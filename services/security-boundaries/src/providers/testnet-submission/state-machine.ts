import type { ChainOutcome, ChainState } from "./types.ts";

const OUTCOMES = new Set<ChainState>([
  "RECORDED", "ABSENT_NETWORK", "ABSENT_BUNDLER", "ABSENT_PAYMASTER", "SUBJECT_MISMATCH",
  "SIMULATION_REVERTED", "POLICY_REFUSED", "SUBMISSION_FAILED", "REPLACED", "DROPPED",
  "TIMED_OUT", "REORGED", "CONFIRMATION_FAILED", "LEDGER_FAILED", "FAILED_CLEANUP",
]);

// SEC-CHAIN-008. Once a nonce is leased there is host state to account for, so every state from
// OPERATION_BUILT onwards can end in a cleanup failure.
const AFTER_BUILD: readonly ChainState[] = ["FAILED_CLEANUP"];

// SEC-CHAIN-006. What the mempool can do to a submitted operation, and none of it is settlement.
const MEMPOOL_EXITS: readonly ChainState[] = ["DROPPED", "REPLACED", "TIMED_OUT"];

// SEC-CHAIN-003. SUBMITTED is reachable only through SIMULATED and then AUTHORIZED. There is no
// edge from OPERATION_BUILT to SUBMITTED, so "submit past a failed simulation" is a path that
// does not exist rather than a guard that can be forgotten.
const TRANSITIONS: Readonly<Record<ChainState, readonly ChainState[]>> = {
  UNRESOLVED: ["NETWORK_ADMITTED", "ABSENT_NETWORK", "ABSENT_BUNDLER", "POLICY_REFUSED"],
  NETWORK_ADMITTED: ["CONTRACTS_RESOLVED", "SUBJECT_MISMATCH", "ABSENT_BUNDLER"],
  CONTRACTS_RESOLVED: ["INPUT_RECEIPTS_VERIFIED", "SUBJECT_MISMATCH"],
  INPUT_RECEIPTS_VERIFIED: ["OPERATION_BUILT", "POLICY_REFUSED", "SUBJECT_MISMATCH"],
  // SUBMISSION_FAILED is reachable here and not only from AUTHORIZED: the idempotency
  // reconciliation happens as soon as the operation is built, and a transport that answers it
  // with a malformed prior hash has failed at submission without anything being sent.
  OPERATION_BUILT: ["SIMULATED", "SIMULATION_REVERTED", "POLICY_REFUSED", "SUBMISSION_FAILED", ...AFTER_BUILD],
  SIMULATED: ["AUTHORIZED", "ABSENT_PAYMASTER", "POLICY_REFUSED", ...AFTER_BUILD],
  AUTHORIZED: ["SUBMITTED", "SUBMISSION_FAILED", ...AFTER_BUILD],
  // CONFIRMATION_FAILED is reachable from here as well as from INCLUDED: a transport that says
  // "included" and names no block has failed to evidence the inclusion, and pushing INCLUDED
  // first in order to reach the tidier edge would be claiming exactly what it did not provide.
  SUBMITTED: ["INCLUDED", ...MEMPOOL_EXITS, "SUBMISSION_FAILED", "CONFIRMATION_FAILED", ...AFTER_BUILD],
  // SEC-CHAIN-006. Inclusion is not confirmation and confirmation is not a record. A reorg is
  // reachable from INCLUDED because that is exactly where it happens: the operation was in a
  // block, and then it was not.
  INCLUDED: ["CONFIRMED", "REORGED", "CONFIRMATION_FAILED", "TIMED_OUT", ...AFTER_BUILD],
  CONFIRMED: ["RECORDED", "LEDGER_FAILED", ...AFTER_BUILD],
  RECORDED: [],
  ABSENT_NETWORK: [],
  ABSENT_BUNDLER: [],
  ABSENT_PAYMASTER: [],
  SUBJECT_MISMATCH: [],
  SIMULATION_REVERTED: [],
  POLICY_REFUSED: [],
  SUBMISSION_FAILED: [],
  REPLACED: [],
  DROPPED: [],
  TIMED_OUT: [],
  REORGED: [],
  CONFIRMATION_FAILED: [],
  LEDGER_FAILED: [],
  FAILED_CLEANUP: [],
};

// A submission run ends. Nothing here resumes -- a retry is a new run that reconciles against
// the chain rather than a continuation of this one -- so every outcome is terminal.
for (const [state, next] of Object.entries(TRANSITIONS) as [ChainState, readonly ChainState[]][]) {
  if (OUTCOMES.has(state) && next.length > 0) {
    throw new Error(`invalid chain contract: terminal outcome ${state} declares successors`);
  }
}

// Every declared state must be reachable from UNRESOLVED.
{
  const seen = new Set<ChainState>(["UNRESOLVED"]);
  const queue: ChainState[] = ["UNRESOLVED"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as ChainState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as ChainState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid chain contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isChainOutcome(value: ChainState): value is ChainOutcome {
  return OUTCOMES.has(value);
}

export function assertChainTransition(from: ChainState, to: ChainState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid chain contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateChainLifecycle(trace: readonly ChainState[]): ChainOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid chain contract: lifecycle must contain between 2 and 32 states");
  }
  if (trace[0] !== "UNRESOLVED") throw new Error("invalid chain contract: lifecycle must start at UNRESOLVED");
  for (let index = 1; index < trace.length; index += 1) {
    assertChainTransition(trace[index - 1] as ChainState, trace[index] as ChainState);
  }
  const terminal = trace[trace.length - 1] as ChainState;
  if (!isChainOutcome(terminal)) throw new Error("invalid chain contract: lifecycle did not reach an outcome");
  return terminal;
}
