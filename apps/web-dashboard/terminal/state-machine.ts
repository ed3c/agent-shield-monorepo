import type { TerminalOutcome, TerminalState } from "./types.ts";

const OUTCOMES = new Set<TerminalState>([
  "CLOSED", "DISCONNECTED", "ABSENT_SESSION", "STALE_SUBJECT", "AUTH_REFUSED",
  "CONNECT_FAILED", "RATE_LIMITED", "STREAM_LIMIT", "TASK_FAILED",
  "SESSION_TERMINATED", "CLEANUP_FAILED",
]);

// DISCONNECTED is the one outcome a trace may pass through and continue from: the issue's
// state machine is ATTACHED ↔ DISCONNECTED. Everything else ends the trace where it appears.
const RESUMABLE = new Set<TerminalState>(["DISCONNECTED"]);

const STREAM_FAULTS: readonly TerminalState[] = ["RATE_LIMITED", "STREAM_LIMIT", "TASK_FAILED", "SESSION_TERMINATED"];

const TRANSITIONS: Readonly<Record<TerminalState, readonly TerminalState[]>> = {
  UNBOUND: ["SUBJECT_RESOLVED", "ABSENT_SESSION", "STALE_SUBJECT"],
  SUBJECT_RESOLVED: ["AUTHENTICATED", "AUTH_REFUSED"],
  AUTHENTICATED: ["CONNECTING", "AUTH_REFUSED"],
  CONNECTING: ["ATTACHED", "CONNECT_FAILED", "ABSENT_SESSION", "SESSION_TERMINATED"],
  ATTACHED: ["DISCONNECTED", "DRAINING", ...STREAM_FAULTS],
  DISCONNECTED: ["CONNECTING", "DRAINING", "STALE_SUBJECT", "SESSION_TERMINATED"],
  DRAINING: ["CLOSED", "CLEANUP_FAILED", "TASK_FAILED"],
  CLOSED: [],
  ABSENT_SESSION: [],
  STALE_SUBJECT: [],
  AUTH_REFUSED: [],
  CONNECT_FAILED: [],
  RATE_LIMITED: [],
  STREAM_LIMIT: [],
  TASK_FAILED: [],
  SESSION_TERMINATED: [],
  CLEANUP_FAILED: [],
};

// The two tables are asserted to agree at module load, so "a trace cannot continue past an
// outcome" stays a property of TRANSITIONS instead of a second scan that could drift from it.
for (const [state, next] of Object.entries(TRANSITIONS) as [TerminalState, readonly TerminalState[]][]) {
  const outcome = OUTCOMES.has(state);
  const resumable = RESUMABLE.has(state);
  if (outcome && next.length > 0 && !resumable) {
    throw new Error(`invalid terminal contract: terminal outcome ${state} declares successors`);
  }
  if (resumable && !(outcome && next.length > 0)) {
    throw new Error(`invalid terminal contract: resumable state ${state} cannot resume`);
  }
}
{
  const seen = new Set<TerminalState>(["UNBOUND"]);
  const queue: TerminalState[] = ["UNBOUND"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as TerminalState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as TerminalState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid terminal contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isTerminalOutcome(value: TerminalState): value is TerminalOutcome {
  return OUTCOMES.has(value);
}

export function assertTerminalTransition(from: TerminalState, to: TerminalState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid terminal contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateTerminalLifecycle(trace: readonly TerminalState[]): TerminalOutcome {
  if (trace.length < 2 || trace.length > 64) {
    throw new Error("invalid terminal contract: lifecycle must contain between 2 and 64 states");
  }
  if (trace[0] !== "UNBOUND") throw new Error("invalid terminal contract: lifecycle must start at UNBOUND");
  for (let index = 1; index < trace.length; index += 1) assertTerminalTransition(trace[index - 1], trace[index]);
  const terminal = trace[trace.length - 1];
  if (!isTerminalOutcome(terminal)) throw new Error("invalid terminal contract: lifecycle did not reach an outcome");
  return terminal;
}
