import type { CanaryOutcome, CanaryState } from "./types.ts";

const OUTCOMES = new Set<CanaryState>([
  "CLEANED", "ABSENT_CLAUDE", "NOT_AUTHENTICATED", "CONTEXT_MISMATCH", "SKILL_MISMATCH",
  "MCP_MISMATCH", "CANARY_FAILED", "OUTPUT_INVALID", "TIMED_OUT", "FAILED_CLEANUP",
]);

// INT-CLAUDE-008. Once a workspace exists there is host state to account for, so every state
// from WORKSPACE_MATERIALIZED onwards can end in a cleanup failure.
const AFTER_WORKSPACE: readonly CanaryState[] = ["FAILED_CLEANUP"];

// INT-CLAUDE-006. RESULT_VALIDATED is reachable only through CANARY_RUNNING, which is reachable
// only after the adapter and the authorization were both checked. There is no edge from
// CONTEXT_FROZEN to RECEIPT_EMITTED, so "the context was right, therefore the carrier works" is
// a path that does not exist.
const TRANSITIONS: Readonly<Record<CanaryState, readonly CanaryState[]>> = {
  UNRESOLVED: ["RELEASE_PINNED", "ABSENT_CLAUDE", "NOT_AUTHENTICATED"],
  RELEASE_PINNED: ["WORKSPACE_MATERIALIZED", "CANARY_FAILED"],
  WORKSPACE_MATERIALIZED: ["CONTEXT_FROZEN", "CONTEXT_MISMATCH", ...AFTER_WORKSPACE],
  CONTEXT_FROZEN: ["CLAUDE_ADAPTER_VERIFIED", "SKILL_MISMATCH", "CONTEXT_MISMATCH", ...AFTER_WORKSPACE],
  CLAUDE_ADAPTER_VERIFIED: ["CARRIER_AUTH_CHECKED", "MCP_MISMATCH", "NOT_AUTHENTICATED", ...AFTER_WORKSPACE],
  CARRIER_AUTH_CHECKED: ["CANARY_RUNNING", "CANARY_FAILED", ...AFTER_WORKSPACE],
  CANARY_RUNNING: ["RESULT_VALIDATED", "CANARY_FAILED", "TIMED_OUT", "OUTPUT_INVALID", "MCP_MISMATCH", ...AFTER_WORKSPACE],
  // The workspace is re-checked after the turn, so a run that mutated what it was measuring is
  // caught here rather than reported as a result.
  RESULT_VALIDATED: ["RECEIPT_EMITTED", "CONTEXT_MISMATCH", ...AFTER_WORKSPACE],
  RECEIPT_EMITTED: ["CLEANED", ...AFTER_WORKSPACE],
  CLEANED: [],
  ABSENT_CLAUDE: [],
  NOT_AUTHENTICATED: [],
  CONTEXT_MISMATCH: [],
  SKILL_MISMATCH: [],
  MCP_MISMATCH: [],
  CANARY_FAILED: [],
  OUTPUT_INVALID: [],
  TIMED_OUT: [],
  FAILED_CLEANUP: [],
};

for (const [state, next] of Object.entries(TRANSITIONS) as [CanaryState, readonly CanaryState[]][]) {
  if (OUTCOMES.has(state) && next.length > 0) {
    throw new Error(`invalid canary contract: terminal outcome ${state} declares successors`);
  }
}

{
  const seen = new Set<CanaryState>(["UNRESOLVED"]);
  const queue: CanaryState[] = ["UNRESOLVED"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as CanaryState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as CanaryState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid canary contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isCanaryOutcome(value: CanaryState): value is CanaryOutcome {
  return OUTCOMES.has(value);
}

export function assertCanaryTransition(from: CanaryState, to: CanaryState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid canary contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateCanaryLifecycle(trace: readonly CanaryState[]): CanaryOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid canary contract: lifecycle must contain between 2 and 32 states");
  }
  if (trace[0] !== "UNRESOLVED") throw new Error("invalid canary contract: lifecycle must start at UNRESOLVED");
  for (let index = 1; index < trace.length; index += 1) {
    assertCanaryTransition(trace[index - 1] as CanaryState, trace[index] as CanaryState);
  }
  const terminal = trace[trace.length - 1] as CanaryState;
  if (!isCanaryOutcome(terminal)) throw new Error("invalid canary contract: lifecycle did not reach an outcome");
  return terminal;
}
