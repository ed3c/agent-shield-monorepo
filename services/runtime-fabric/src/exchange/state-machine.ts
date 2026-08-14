import type { ExchangeOutcome, ExchangeState } from "../../../../packages/contracts/src/exchange/index.ts";

const terminal = new Set<ExchangeOutcome>([
  "COMPLETED",
  "ABSENT_BASE",
  "LEASE_CONFLICT",
  "BASE_DRIFT",
  "PATH_CONFLICT",
  "POLICY_REFUSED",
  "TRANSFER_FAILED",
  "VERIFY_FAILED",
  "APPLY_FAILED",
  "REPLAY_FAILED",
  "ROLLBACK_REFUSED_DRIFT",
]);

const transitions: Readonly<Record<ExchangeState, readonly ExchangeState[]>> = {
  UNRESOLVED: ["CLASSIFIED"],
  CLASSIFIED: ["LEASED", "LEASE_CONFLICT"],
  LEASED: ["BASE_BOUND", "ABSENT_BASE", "BASE_DRIFT"],
  BASE_BOUND: ["EXPORTED", "PATH_CONFLICT", "POLICY_REFUSED"],
  EXPORTED: ["TRANSFERRED", "TRANSFER_FAILED"],
  TRANSFERRED: ["VERIFIED", "VERIFY_FAILED"],
  VERIFIED: ["APPLIED", "APPLY_FAILED"],
  APPLIED: ["REPLAYED", "COMPLETED"],
  REPLAYED: ["COMPLETED", "REPLAY_FAILED"],
  COMPLETED: [],
  ABSENT_BASE: [],
  LEASE_CONFLICT: [],
  BASE_DRIFT: [],
  PATH_CONFLICT: [],
  POLICY_REFUSED: [],
  TRANSFER_FAILED: [],
  VERIFY_FAILED: [],
  APPLY_FAILED: [],
  REPLAY_FAILED: [],
  ROLLBACK_REFUSED_DRIFT: [],
};

export function isExchangeOutcome(value: ExchangeState): value is ExchangeOutcome {
  return terminal.has(value as ExchangeOutcome);
}

export function assertExchangeTransition(from: ExchangeState, to: ExchangeState): void {
  if (!transitions[from].includes(to)) {
    throw new Error(`illegal exchange transition: ${from} -> ${to}`);
  }
}

export class ExchangeLifecycle {
  readonly trace: ExchangeState[] = ["UNRESOLVED"];

  get current(): ExchangeState {
    return this.trace[this.trace.length - 1];
  }

  transition(next: ExchangeState): void {
    assertExchangeTransition(this.current, next);
    this.trace.push(next);
  }

  outcome(): ExchangeOutcome {
    if (!isExchangeOutcome(this.current)) {
      throw new Error(`exchange lifecycle is not terminal: ${this.current}`);
    }
    return this.current;
  }
}

export function validateExchangeLifecycle(trace: readonly ExchangeState[]): ExchangeOutcome {
  if (trace.length < 2 || trace[0] !== "UNRESOLVED") {
    throw new Error("exchange lifecycle must start at UNRESOLVED");
  }
  for (let index = 1; index < trace.length; index += 1) {
    assertExchangeTransition(trace[index - 1], trace[index]);
  }
  const outcome = trace[trace.length - 1];
  if (!isExchangeOutcome(outcome)) {
    throw new Error(`exchange lifecycle is not terminal: ${outcome}`);
  }
  return outcome;
}

// Compatibility names consumed by the already-merged planner, validator, and selftest.
// They are aliases of the same implementation, not a second state machine.
export { ExchangeLifecycle as RuntimeExchangeLifecycle };
export const assertRuntimeExchangeTransition = assertExchangeTransition;
export const validateRuntimeExchangeLifecycle = validateExchangeLifecycle;
