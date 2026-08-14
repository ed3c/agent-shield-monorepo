import {
  DEFAULT_TERMINAL_BOUNDS,
  TERMINAL_ATTACH_SCHEMA,
  TERMINAL_CONTROL_ACTIONS,
  accumulateFrames,
  applyControlFrame,
  assertTerminalTransition,
  attachTerminal,
  closeProjection,
  projectTerminal,
  terminalOperator,
  terminalProjectionState,
  validateTerminalLifecycle,
  type LiveSession,
  type TerminalAttachRequest,
  type TerminalOutputFrame,
  type TerminalRuntimePort,
  type TerminalScope,
  type TerminalSessionSubject,
  type TerminalState,
  type TerminalSubscriptions,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`UX-TERM ${message}`);
}

// Controls must fail through this module's own contract error. A control that accepts any
// throw lets a guard that never fires look load-bearing when guards are disabled one by one.
function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid terminal contract: "), `${message} threw "${text}" rather than a terminal contract error`);
}

const COMMIT = "1".repeat(40);
const WORKSPACE = `tmux-session:sha256:${"2".repeat(64)}`;
const NOW = 1_700_000_000_000;

const SUBJECT: TerminalSessionSubject = {
  taskId: "task-1",
  sessionId: "session-1",
  commit: COMMIT,
  workspaceIdentity: WORKSPACE,
};

function request(overrides: Partial<TerminalAttachRequest> = {}): TerminalAttachRequest {
  return {
    schema: TERMINAL_ATTACH_SCHEMA,
    subject: { ...SUBJECT },
    operator: terminalOperator("owner", ["terminal.read", "terminal.control"]),
    requestedScopes: ["terminal.read"],
    ...overrides,
  };
}

function live(overrides: Partial<LiveSession> = {}): LiveSession {
  return { subject: { ...SUBJECT }, taskState: "RUNNING", ...overrides };
}

function frame(sequence: number, overrides: Partial<TerminalOutputFrame> = {}): TerminalOutputFrame {
  return {
    sequence,
    emittedAtEpochMs: NOW + sequence * 100,
    bytes: 1_024,
    truncatedBytes: 0,
    sha256: "3".repeat(64),
    ...overrides,
  };
}

function port(): TerminalRuntimePort & { stops: TerminalSessionSubject[] } {
  const stops: TerminalSessionSubject[] = [];
  return { stops, requestStop: (subject) => { stops.push(subject); } };
}

function subscription(leaks = false): TerminalSubscriptions {
  let open = true;
  return { close: () => { if (!leaks) open = false; }, get open() { return open; } };
}

// UX-TERM-001 exact session
function exactSession(): void {
  ok(attachTerminal(request(), live()).lifecycle.at(-1) === "ATTACHED", "an exact subject failed to attach");
  ok(attachTerminal(request(), null).lifecycle.at(-1) === "ABSENT_SESSION", "a missing session was not reported absent");
  ok(
    attachTerminal(request(), live({ subject: { ...SUBJECT, taskId: "task-2" } })).lifecycle.at(-1) === "ABSENT_SESSION",
    "a foreign task was attached",
  );
  ok(
    attachTerminal(request(), live({ subject: { ...SUBJECT, commit: "9".repeat(40) } })).lifecycle.at(-1) === "STALE_SUBJECT",
    "a drifted commit was attached",
  );
  ok(
    attachTerminal(request(), live({ subject: { ...SUBJECT, workspaceIdentity: `tmux-session:sha256:${"9".repeat(64)}` } })).lifecycle.at(-1) === "STALE_SUBJECT",
    "a drifted workspace was attached",
  );
  red(() => attachTerminal(request({ subject: { ...SUBJECT, commit: "main" } }), live()), "a moving ref as the session commit");
  red(() => attachTerminal(request({ subject: { ...SUBJECT, workspaceIdentity: "session-1" } }), live()), "a non-content-addressed workspace");
}

// UX-TERM-002 auth
function auth(): void {
  const readOnly = request({ operator: terminalOperator("reader", ["terminal.read"]) });
  ok(attachTerminal(readOnly, live()).granted.join(",") === "terminal.read", "a read-only operator was refused read");

  const escalating = request({ operator: terminalOperator("reader", ["terminal.read"]), requestedScopes: ["terminal.read", "terminal.control"] });
  const outcome = attachTerminal(escalating, live());
  ok(outcome.lifecycle.at(-1) === "AUTH_REFUSED" && outcome.granted.length === 0, "privilege escalation was silently downgraded instead of refused");

  const anonymous = request({ operator: terminalOperator("nobody", []) });
  ok(attachTerminal(anonymous, live()).lifecycle.at(-1) === "AUTH_REFUSED", "an unauthenticated attach succeeded");

  const controlOnly = request({ operator: terminalOperator("controller", ["terminal.control"]), requestedScopes: ["terminal.control"] });
  ok(attachTerminal(controlOnly, live()).lifecycle.at(-1) === "AUTH_REFUSED", "control without read was granted");
}

// UX-TERM-003 no generic shell
function noGenericShell(): void {
  ok(TERMINAL_CONTROL_ACTIONS.length === 4, "the control action set changed size");
  ok(
    !TERMINAL_CONTROL_ACTIONS.some((action) => ["exec", "run", "command", "shell", "eval"].includes(action)),
    "an execution action entered the control set",
  );

  const runtime = port();
  const granted: TerminalScope[] = ["terminal.read", "terminal.control"];
  applyControlFrame({ action: "resize", columns: 120, rows: 40, scrollbackLines: null }, granted, SUBJECT, runtime);
  applyControlFrame({ action: "detach", columns: null, rows: null, scrollbackLines: null }, granted, SUBJECT, runtime);
  // Read the count into a local: ok() is an assertion function, so comparing the array length
  // again after a mutating call would be narrowed by the compiler to the previous value.
  const beforeStop = runtime.stops.length;
  ok(beforeStop === 0, "a non-stop control reached the runtime port");

  applyControlFrame({ action: "request-stop", columns: null, rows: null, scrollbackLines: null }, granted, SUBJECT, runtime);
  ok(runtime.stops.length === beforeStop + 1, "request-stop did not reach the owning runtime port");
  ok(runtime.stops[0]?.sessionId === "session-1", "request-stop carried the wrong session");

  red(
    () => applyControlFrame({ action: "exec" as never, columns: null, rows: null, scrollbackLines: null }, granted, SUBJECT, runtime),
    "an unadmitted control action",
  );
  red(
    () => applyControlFrame({ action: "resize", columns: 120, rows: 40, scrollbackLines: null }, ["terminal.read"], SUBJECT, runtime),
    "a control frame from a read-only operator",
  );
  red(
    () => applyControlFrame({ action: "resize", columns: 100_000, rows: 40, scrollbackLines: null }, granted, SUBJECT, runtime),
    "an unbounded resize",
  );
  red(
    () => applyControlFrame({ action: "scroll", columns: null, rows: null, scrollbackLines: DEFAULT_TERMINAL_BOUNDS.maxScrollbackLines + 1 }, granted, SUBJECT, runtime),
    "an unbounded scrollback request",
  );
}

// UX-TERM-004 frame bounds
function frameBounds(): void {
  const ledger = accumulateFrames([frame(0), frame(1), frame(2)]);
  ok(ledger.frames === 3 && ledger.bytes === 3_072 && ledger.truncatedBytes === 0, "a bounded stream was mis-accounted");

  const truncated = accumulateFrames([frame(0, { truncatedBytes: 512 })]);
  ok(truncated.truncatedBytes === 512, "truncation was not recorded");
  const projection = projectTerminal(SUBJECT, ["UNBOUND", "SUBJECT_RESOLVED", "AUTHENTICATED", "CONNECTING", "ATTACHED", "DRAINING", "CLOSED"], "COMPLETED", truncated, ["terminal.read"]);
  ok(projection.truncatedBytes === 512 && projection.detail.includes("incomplete"), "truncation was hidden from the projection");

  red(() => accumulateFrames([frame(0, { bytes: DEFAULT_TERMINAL_BOUNDS.maxFrameBytes + 1 })]), "an oversized frame");
  red(() => accumulateFrames([frame(0), frame(1, { sequence: 5 })]), "an out-of-sequence frame");
  red(() => accumulateFrames([frame(0), frame(1, { emittedAtEpochMs: NOW - 1 })]), "a frame that moves backwards in time");
  red(() => accumulateFrames([frame(0, { sha256: "nope" })]), "a frame with no content digest");
  red(
    () => accumulateFrames(Array.from({ length: DEFAULT_TERMINAL_BOUNDS.maxFrames + 1 }, (_unused, index) => frame(index))),
    "an unbounded frame count",
  );
  red(
    () => accumulateFrames(Array.from({ length: 100 }, (_unused, index) => frame(index, { emittedAtEpochMs: NOW }))),
    "an unbounded frame rate",
  );
  red(
    () => accumulateFrames([frame(0), frame(1, { emittedAtEpochMs: NOW + DEFAULT_TERMINAL_BOUNDS.maxSessionMs + 1_000 })]),
    "a stream beyond its admitted duration",
  );
  red(
    () => accumulateFrames(Array.from({ length: 80 }, (_unused, index) => frame(index, { bytes: 65_536, emittedAtEpochMs: NOW + index * 1_000 }))),
    "a stream beyond its admitted total bytes",
  );
}

// UX-TERM-005 reconnect
function reconnect(): void {
  // The same names with a newer commit is precisely the "attach to newest session by name"
  // case, and it must surface as staleness rather than fabricated continuity.
  const newest = live({ subject: { ...SUBJECT, commit: "8".repeat(40) } });
  ok(attachTerminal(request(), newest).lifecycle.at(-1) === "STALE_SUBJECT", "a newest-by-name session was silently attached");

  ok(
    attachTerminal(request(), live({ taskState: "TERMINATED" })).lifecycle.at(-1) === "SESSION_TERMINATED",
    "a terminated session was reported as attachable",
  );

  const resumed: TerminalState[] = ["UNBOUND", "SUBJECT_RESOLVED", "AUTHENTICATED", "CONNECTING", "ATTACHED", "DISCONNECTED", "CONNECTING", "ATTACHED", "DRAINING", "CLOSED"];
  ok(validateTerminalLifecycle(resumed) === "CLOSED", "a legitimate reconnect was rejected");
  red(() => assertTerminalTransition("DISCONNECTED", "ATTACHED"), "a reconnect that skipped CONNECTING");
}

// UX-TERM-006 state fidelity
function stateFidelity(): void {
  const dropped = projectTerminal(
    SUBJECT,
    ["UNBOUND", "SUBJECT_RESOLVED", "AUTHENTICATED", "CONNECTING", "ATTACHED", "DISCONNECTED"],
    "RUNNING",
    { frames: 1, bytes: 10, truncatedBytes: 0 },
    ["terminal.read"],
  );
  ok(dropped.outcome === "DISCONNECTED" && dropped.attached === false, "a socket close was projected as completion");
  ok(dropped.taskState === "RUNNING", "a disconnected projection rewrote the task state");

  red(
    () => projectTerminal(SUBJECT, ["UNBOUND", "SUBJECT_RESOLVED", "AUTHENTICATED", "CONNECTING", "ATTACHED", "DRAINING", "CLOSED"], "RUNNING", { frames: 0, bytes: 0, truncatedBytes: 0 }, ["terminal.read"]),
    "a closed projection reporting a still-running task",
  );
  red(
    () => projectTerminal(SUBJECT, ["UNBOUND", "SUBJECT_RESOLVED", "AUTHENTICATED", "CONNECTING", "ATTACHED", "DRAINING", "CLOSED"], "FAILED", { frames: 0, bytes: 0, truncatedBytes: 0 }, ["terminal.read"]),
    "a failed task laundered into a clean close",
  );
  const failed = projectTerminal(
    SUBJECT,
    ["UNBOUND", "SUBJECT_RESOLVED", "AUTHENTICATED", "CONNECTING", "ATTACHED", "TASK_FAILED"],
    "FAILED",
    { frames: 0, bytes: 0, truncatedBytes: 0 },
    ["terminal.read"],
  );
  ok(failed.outcome === "TASK_FAILED" && failed.taskState === "FAILED", "a failed task lost its failure in projection");
  red(
    () => validateTerminalLifecycle(["UNBOUND", "SUBJECT_RESOLVED", "AUTHENTICATED", "CONNECTING", "ATTACHED", "TASK_FAILED", "CLOSED"] as TerminalState[]),
    "a lifecycle continuing past a terminal fault",
  );
}

// UX-TERM-007 cleanup
function cleanup(): void {
  const clean = [subscription(), subscription()];
  closeProjection(clean);
  ok(clean.every((entry) => !entry.open), "a subscription stayed open after close");
  red(() => closeProjection([subscription(), subscription(true)]), "an orphaned subscription");

  // Stopping goes through the owning runtime port and carries the exact subject, so a caller
  // cannot ask this module to signal anything directly.
  const runtime = port();
  applyControlFrame({ action: "request-stop", columns: null, rows: null, scrollbackLines: null }, ["terminal.read", "terminal.control"], SUBJECT, runtime);
  ok(runtime.stops.length === 1, "request-stop did not reach the runtime port");
  ok(
    Object.keys(runtime.stops[0]).sort().join(",") === "commit,sessionId,taskId,workspaceIdentity",
    "the stop request carried something other than the exact session subject",
  );
}

function evidenceBoundary(): void {
  ok(terminalProjectionState.liveAttach === "NOT_EXERCISED", "a live attach was claimed without a carrier");
  ok(terminalProjectionState.ptySubject === "NOT_EXERCISED", "a PTY subject was claimed without exercise");
  ok(terminalProjectionState.productionIngress === "NOT_IMPLEMENTED", "production ingress was claimed");
}

// The compiler proves no field is PASS; a runtime scan could not fail and would be dead.
type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const terminalNeverPasses: NeverPass<typeof terminalProjectionState> = true;
void terminalNeverPasses;

exactSession();
auth();
noGenericShell();
frameBounds();
reconnect();
stateFidelity();
cleanup();
evidenceBoundary();

console.log("SELFTEST GREEN: UX-TERM exact session, auth separation, no generic shell, frame bounds, reconnect, state fidelity, cleanup");
