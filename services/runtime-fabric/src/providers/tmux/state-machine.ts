import type { TmuxSessionOutcome, TmuxSessionState } from "./types.ts";

const outcomes = new Set<TmuxSessionOutcome>([
  "TERMINATED",
  "ABSENT_TMUX",
  "FAILED_CREATE",
  "STREAM_LIMIT",
  "TIMED_OUT",
  "CANCELLED",
  "PROCESS_FAILED",
  "FAILED_TERMINATE",
  "FAILED_CLEANUP",
]);

const transitions: Readonly<Record<TmuxSessionState, readonly TmuxSessionState[]>> = {
  UNRESOLVED: ["HOST_CHECKED", "ABSENT_TMUX"],
  HOST_CHECKED: ["SESSION_CREATING", "FAILED_CREATE"],
  SESSION_CREATING: ["SESSION_READY", "FAILED_CREATE"],
  SESSION_READY: ["ATTACHED", "DETACHED", "STOPPING", "TIMED_OUT", "CANCELLED", "PROCESS_FAILED"],
  ATTACHED: ["DETACHED", "STOPPING", "STREAM_LIMIT", "TIMED_OUT", "CANCELLED", "PROCESS_FAILED"],
  DETACHED: ["ATTACHED", "STOPPING", "STREAM_LIMIT", "TIMED_OUT", "CANCELLED", "PROCESS_FAILED"],
  STOPPING: ["COLLECTING", "FAILED_TERMINATE"],
  COLLECTING: ["TERMINATED", "STREAM_LIMIT", "TIMED_OUT", "CANCELLED", "PROCESS_FAILED", "FAILED_CLEANUP"],
  TERMINATED: [],
  ABSENT_TMUX: [],
  FAILED_CREATE: [],
  STREAM_LIMIT: [],
  TIMED_OUT: [],
  CANCELLED: [],
  PROCESS_FAILED: [],
  FAILED_TERMINATE: [],
  FAILED_CLEANUP: [],
};

export function isTmuxSessionOutcome(value: TmuxSessionState): value is TmuxSessionOutcome {
  return outcomes.has(value as TmuxSessionOutcome);
}

export function assertTmuxSessionTransition(from: TmuxSessionState, to: TmuxSessionState): void {
  if (!transitions[from].includes(to)) throw new Error(`illegal tmux session transition: ${from} -> ${to}`);
}

export class TmuxSessionLifecycle {
  readonly trace: TmuxSessionState[] = ["UNRESOLVED"];

  get current(): TmuxSessionState { return this.trace[this.trace.length - 1]; }

  transition(next: TmuxSessionState): void {
    assertTmuxSessionTransition(this.current, next);
    this.trace.push(next);
  }

  outcome(): TmuxSessionOutcome {
    if (!isTmuxSessionOutcome(this.current)) throw new Error(`tmux session lifecycle is not terminal: ${this.current}`);
    return this.current;
  }
}

export function validateTmuxSessionLifecycle(trace: readonly TmuxSessionState[]): TmuxSessionOutcome {
  if (trace.length < 2 || trace[0] !== "UNRESOLVED") throw new Error("tmux session lifecycle must start at UNRESOLVED");
  for (let index = 1; index < trace.length; index += 1) assertTmuxSessionTransition(trace[index - 1], trace[index]);
  const outcome = trace[trace.length - 1];
  if (!isTmuxSessionOutcome(outcome)) throw new Error(`tmux session lifecycle is not terminal: ${outcome}`);
  return outcome;
}
