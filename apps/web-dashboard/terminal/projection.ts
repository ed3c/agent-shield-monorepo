import { validateTerminalLifecycle } from "./state-machine.ts";
import {
  DEFAULT_TERMINAL_BOUNDS,
  TERMINAL_ATTACH_SCHEMA,
  TERMINAL_CONTROL_ACTIONS,
  TERMINAL_PROJECTION_SCHEMA,
  type TerminalAttachRequest,
  type TerminalBounds,
  type TerminalControlFrame,
  type TerminalOperator,
  type TerminalOutputFrame,
  type TerminalProjection,
  type TerminalScope,
  type TerminalSessionSubject,
  type TerminalState,
  type TerminalTaskState,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const WORKSPACE_ID = /^[a-z0-9][a-z0-9._-]{0,63}:sha256:[a-f0-9]{64}$/;

export function fail(message: string): never {
  throw new Error(`invalid terminal contract: ${message}`);
}

export function assertSessionSubject(subject: TerminalSessionSubject, name = "subject"): TerminalSessionSubject {
  if (!SAFE_ID.test(subject.taskId)) fail(`${name}.taskId is invalid`);
  if (!SAFE_ID.test(subject.sessionId)) fail(`${name}.sessionId is invalid`);
  if (!GIT_OID.test(subject.commit)) fail(`${name}.commit must be a full 40-hex object ID`);
  if (!WORKSPACE_ID.test(subject.workspaceIdentity)) fail(`${name}.workspaceIdentity must be a content-addressed workspace identity`);
  return subject;
}

function sameSubject(left: TerminalSessionSubject, right: TerminalSessionSubject): boolean {
  return left.taskId === right.taskId
    && left.sessionId === right.sessionId
    && left.commit === right.commit
    && left.workspaceIdentity === right.workspaceIdentity;
}

// The live session the projection may observe. Supplied by the owning runtime port, never
// discovered by the projection: there is no lookup-by-name anywhere in this module.
export interface LiveSession {
  subject: TerminalSessionSubject;
  taskState: TerminalTaskState;
}

// UX-TERM-007. Stopping a task goes through the owning runtime's port. This module never
// signals a process, and the port is the only way it can ask.
export interface TerminalRuntimePort {
  requestStop(subject: TerminalSessionSubject): void;
}

export interface AttachOutcome {
  granted: TerminalScope[];
  lifecycle: TerminalState[];
}

// UX-TERM-001 and UX-TERM-002. Attach resolves the exact four-part subject against the live
// session, then grants only the scopes the operator actually holds.
export function attachTerminal(request: TerminalAttachRequest, live: LiveSession | null): AttachOutcome {
  if (request.schema !== TERMINAL_ATTACH_SCHEMA) fail("attach schema is unsupported");
  assertSessionSubject(request.subject);
  if (live === null) return { granted: [], lifecycle: ["UNBOUND", "ABSENT_SESSION"] };
  assertSessionSubject(live.subject, "liveSession.subject");

  if (live.subject.taskId !== request.subject.taskId || live.subject.sessionId !== request.subject.sessionId) {
    // A different task or session entirely: the requested one is not here.
    return { granted: [], lifecycle: ["UNBOUND", "ABSENT_SESSION"] };
  }
  if (!sameSubject(live.subject, request.subject)) {
    // Same names, different commit or workspace. UX-TERM-005: this is exactly the "newest
    // session by name" case, and it is reported as staleness rather than silently attached.
    return { granted: [], lifecycle: ["UNBOUND", "STALE_SUBJECT"] };
  }
  if (live.taskState === "TERMINATED") {
    return { granted: [], lifecycle: ["UNBOUND", "SUBJECT_RESOLVED", "AUTHENTICATED", "CONNECTING", "SESSION_TERMINATED"] };
  }

  const held = new Set(request.operator.scopes);
  const granted = request.requestedScopes.filter((scope) => held.has(scope));
  if (!granted.includes("terminal.read")) {
    return { granted: [], lifecycle: ["UNBOUND", "SUBJECT_RESOLVED", "AUTH_REFUSED"] };
  }
  if (request.requestedScopes.length !== granted.length) {
    // Asking for more than the operator holds is a refusal, not a silent downgrade to read.
    return { granted: [], lifecycle: ["UNBOUND", "SUBJECT_RESOLVED", "AUTH_REFUSED"] };
  }
  return { granted, lifecycle: ["UNBOUND", "SUBJECT_RESOLVED", "AUTHENTICATED", "CONNECTING", "ATTACHED"] };
}

// UX-TERM-003. A control frame is one of four enumerated actions with numeric arguments only.
// `request-stop` is routed to the owning runtime port; this module never signals a process.
export function applyControlFrame(
  frame: TerminalControlFrame,
  granted: readonly TerminalScope[],
  subject: TerminalSessionSubject,
  port: TerminalRuntimePort,
  bounds: TerminalBounds = DEFAULT_TERMINAL_BOUNDS,
): void {
  if (!TERMINAL_CONTROL_ACTIONS.includes(frame.action)) fail(`control action ${frame.action} is not admitted`);
  if (!granted.includes("terminal.control")) fail("control frames require the terminal.control scope");

  const numeric = (value: number | null, name: string, minimum: number, maximum: number): number => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
      fail(`control ${frame.action} ${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return value;
  };

  switch (frame.action) {
    case "resize":
      numeric(frame.columns, "columns", 20, 500);
      numeric(frame.rows, "rows", 5, 500);
      return;
    case "scroll":
      numeric(frame.scrollbackLines, "scrollbackLines", 1, bounds.maxScrollbackLines);
      return;
    case "detach":
      return;
    default:
      port.requestStop(subject);
  }
}

export interface FrameLedger {
  frames: number;
  bytes: number;
  truncatedBytes: number;
}

// UX-TERM-004. Byte, frame, rate and duration limits, with truncation recorded rather than
// applied silently. Exceeding a limit is a named outcome, not a quiet drop.
export function accumulateFrames(
  frames: readonly TerminalOutputFrame[],
  bounds: TerminalBounds = DEFAULT_TERMINAL_BOUNDS,
): FrameLedger {
  if (frames.length > bounds.maxFrames) fail("terminal stream exceeded its admitted frame count");
  const ledger: FrameLedger = { frames: frames.length, bytes: 0, truncatedBytes: 0 };
  for (const [index, frame] of frames.entries()) {
    if (!Number.isSafeInteger(frame.sequence) || frame.sequence !== index) fail(`terminal frame ${index} is out of sequence`);
    if (!Number.isSafeInteger(frame.bytes) || frame.bytes < 0 || frame.bytes > bounds.maxFrameBytes) {
      fail(`terminal frame ${index} exceeds the admitted frame size`);
    }
    if (!Number.isSafeInteger(frame.truncatedBytes) || frame.truncatedBytes < 0) fail(`terminal frame ${index} has an invalid truncation count`);
    if (!SHA_256.test(frame.sha256)) fail(`terminal frame ${index} has no content digest`);
    if (index > 0 && frame.emittedAtEpochMs < frames[index - 1].emittedAtEpochMs) fail(`terminal frame ${index} moves backwards in time`);
    ledger.bytes += frame.bytes;
    ledger.truncatedBytes += frame.truncatedBytes;
  }
  if (ledger.bytes > bounds.maxTotalBytes) fail("terminal stream exceeded its admitted total bytes");
  if (frames.length >= 2) {
    const spanMs = frames[frames.length - 1].emittedAtEpochMs - frames[0].emittedAtEpochMs;
    if (spanMs > bounds.maxSessionMs) fail("terminal stream exceeded its admitted duration");
    if (frames.length > (Math.max(spanMs, 1) / 1000) * bounds.maxFramesPerSecond + 1) {
      fail("terminal stream exceeded its admitted frame rate");
    }
  }
  return ledger;
}

// UX-TERM-006. Detaching or losing the socket is never completion, and a failed task stays
// failed no matter how the projection ended.
export function projectTerminal(
  subject: TerminalSessionSubject,
  lifecycle: readonly TerminalState[],
  taskState: TerminalTaskState,
  ledger: FrameLedger,
  granted: readonly TerminalScope[],
): TerminalProjection {
  assertSessionSubject(subject);
  const outcome = validateTerminalLifecycle(lifecycle);
  const attached = lifecycle[lifecycle.length - 1] === "ATTACHED";
  if (outcome === "CLOSED" && taskState === "RUNNING") {
    fail("a closed projection cannot report a still-running task");
  }
  if (taskState === "FAILED" && outcome === "CLOSED") {
    // Closing cleanly does not launder the task result; the projection must carry the failure.
    fail("a failed task cannot be projected as a clean close");
  }
  return {
    schema: TERMINAL_PROJECTION_SCHEMA,
    subject,
    lifecycle: [...lifecycle],
    outcome,
    taskState,
    attached,
    frames: ledger.frames,
    bytes: ledger.bytes,
    truncatedBytes: ledger.truncatedBytes,
    grantedScopes: [...granted].sort(),
    detail: ledger.truncatedBytes > 0
      ? `projection truncated ${ledger.truncatedBytes} byte(s); output is incomplete`
      : "projection carried every admitted byte",
  };
}

// UX-TERM-007. Closing the projection ends only its own subscriptions. It reports what it
// released so an orphaned watcher is visible rather than assumed absent.
export interface TerminalSubscriptions {
  close(): void;
  readonly open: boolean;
}

export function closeProjection(subscriptions: readonly TerminalSubscriptions[]): void {
  for (const subscription of subscriptions) subscription.close();
  const leaked = subscriptions.filter((subscription) => subscription.open).length;
  if (leaked > 0) fail(`${leaked} terminal subscription(s) remained open after close`);
}

export function terminalOperator(actorId: string, scopes: readonly TerminalScope[]): TerminalOperator {
  if (!SAFE_ID.test(actorId)) fail("operator actorId is invalid");
  return { actorKind: "human", actorId, scopes: [...new Set(scopes)].sort() };
}
