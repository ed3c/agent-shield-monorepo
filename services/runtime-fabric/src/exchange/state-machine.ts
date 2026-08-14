import type { ExchangeOutcome, ExchangeState } from "../../../../packages/contracts/src/exchange/index.ts";
import type {
  RuntimeExchangeLifecycleState,
  RuntimeExchangeOutcome,
} from "./types.ts";

// Older protocol/session exchange state machine retained for the already-merged
// exchange.test.ts contract. It is independent from the runtime repair planner below.
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

// Runtime exchange/repair state machine consumed by planner.ts, validation.ts,
// and selftest.ts. This is not an alias of the older protocol machine because
// the two contracts intentionally have different states and terminal outcomes.
const runtimeTerminal = new Set<RuntimeExchangeOutcome>([
  "READY_FOR_REVIEW",
  "READY_FOR_APPLY",
  "REFUSED_DATA_CLASS",
  "REFUSED_STRATEGY",
  "STALE_BASE",
  "LEASE_EXPIRED",
  "LEASE_MISMATCH",
  "PATH_OUT_OF_SCOPE",
  "INVALID_PAYLOAD",
  "INVALID_REVIEW",
  "INVALID_REQUEST",
]);

const runtimeTransitions: Readonly<
  Record<RuntimeExchangeLifecycleState, readonly RuntimeExchangeLifecycleState[]>
> = {
  REQUESTED: ["CLASSIFIED"],
  CLASSIFIED: ["SUBJECT_VERIFIED", "REFUSED_DATA_CLASS", "REFUSED_STRATEGY", "INVALID_REQUEST"],
  SUBJECT_VERIFIED: ["LEASE_VERIFIED", "STALE_BASE"],
  LEASE_VERIFIED: [
    "STRATEGY_VERIFIED",
    "LEASE_EXPIRED",
    "LEASE_MISMATCH",
    "PATH_OUT_OF_SCOPE",
    "INVALID_PAYLOAD",
  ],
  STRATEGY_VERIFIED: ["PAYLOAD_VERIFIED"],
  PAYLOAD_VERIFIED: ["REVIEW_PENDING", "READY_FOR_APPLY", "INVALID_REVIEW"],
  REVIEW_PENDING: ["READY_FOR_REVIEW"],
  READY_FOR_APPLY: [],
  RECEIPTED: [],
  READY_FOR_REVIEW: [],
  REFUSED_DATA_CLASS: [],
  REFUSED_STRATEGY: [],
  STALE_BASE: [],
  LEASE_EXPIRED: [],
  LEASE_MISMATCH: [],
  PATH_OUT_OF_SCOPE: [],
  INVALID_PAYLOAD: [],
  INVALID_REVIEW: [],
  INVALID_REQUEST: [],
};

export function isRuntimeExchangeOutcome(
  value: RuntimeExchangeLifecycleState,
): value is RuntimeExchangeOutcome {
  return runtimeTerminal.has(value as RuntimeExchangeOutcome);
}

export function assertRuntimeExchangeTransition(
  from: RuntimeExchangeLifecycleState,
  to: RuntimeExchangeLifecycleState,
): void {
  if (!runtimeTransitions[from].includes(to)) {
    throw new Error(`illegal runtime exchange transition: ${from} -> ${to}`);
  }
}

export class RuntimeExchangeLifecycle {
  readonly trace: RuntimeExchangeLifecycleState[] = ["REQUESTED"];

  get current(): RuntimeExchangeLifecycleState {
    return this.trace[this.trace.length - 1];
  }

  transition(next: RuntimeExchangeLifecycleState): void {
    assertRuntimeExchangeTransition(this.current, next);
    this.trace.push(next);
  }

  outcome(): RuntimeExchangeOutcome {
    if (!isRuntimeExchangeOutcome(this.current)) {
      throw new Error(`runtime exchange lifecycle is not terminal: ${this.current}`);
    }
    return this.current;
  }
}

export function validateRuntimeExchangeLifecycle(
  trace: readonly RuntimeExchangeLifecycleState[],
): RuntimeExchangeOutcome {
  if (trace.length < 2 || trace[0] !== "REQUESTED") {
    throw new Error("runtime exchange lifecycle must start at REQUESTED");
  }
  for (let index = 1; index < trace.length; index += 1) {
    assertRuntimeExchangeTransition(trace[index - 1], trace[index]);
  }
  const outcome = trace[trace.length - 1];
  if (!isRuntimeExchangeOutcome(outcome)) {
    throw new Error(`runtime exchange lifecycle is not terminal: ${outcome}`);
  }
  return outcome;
}
