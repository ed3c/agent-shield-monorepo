import type { EvidenceState } from "../index.ts";
import type { ProductOutcome, ProductState } from "./types.ts";

const OUTCOMES = new Set<ProductState>([
  "COMPLETED",
  "WAITING_FOR_HUMAN",
  "WAITING_FOR_HARDWARE",
  "DENIED",
  "ABSENT_ADAPTER",
  "NOT_IMPLEMENTED",
  "NOT_EXERCISED",
  "FAILED_ACTION",
  "FAILED_PROVIDER",
  "FAILED_OBSERVATION",
  "FAILED_CLEANUP",
]);

// Every progress state names the exact set it may reach. A state absent from a row cannot be
// reached from it, so a trace that skips validation, authorization or observation is rejected
// rather than normalized.
const TRANSITIONS: Readonly<Record<ProductState, readonly ProductState[]>> = {
  UNRESOLVED: ["ACTION_VALIDATED", "FAILED_ACTION", "ABSENT_ADAPTER", "NOT_IMPLEMENTED", "NOT_EXERCISED"],
  ACTION_VALIDATED: ["AUTH_CHECKED", "DENIED", "FAILED_ACTION"],
  AUTH_CHECKED: ["RISK_CHECKED", "DENIED"],
  RISK_CHECKED: ["ROUTED", "DENIED", "WAITING_FOR_HUMAN", "WAITING_FOR_HARDWARE"],
  ROUTED: ["EXECUTING", "ABSENT_ADAPTER", "WAITING_FOR_HARDWARE", "FAILED_PROVIDER"],
  EXECUTING: ["OBSERVING", "FAILED_PROVIDER", "FAILED_ACTION"],
  OBSERVING: ["COMPLETED", "FAILED_OBSERVATION", "FAILED_CLEANUP"],
  COMPLETED: [],
  WAITING_FOR_HUMAN: [],
  WAITING_FOR_HARDWARE: [],
  DENIED: [],
  ABSENT_ADAPTER: [],
  NOT_IMPLEMENTED: [],
  NOT_EXERCISED: [],
  FAILED_ACTION: [],
  FAILED_PROVIDER: [],
  FAILED_OBSERVATION: [],
  FAILED_CLEANUP: [],
};

export function isProductOutcome(value: ProductState): value is ProductOutcome {
  return OUTCOMES.has(value);
}

export function assertProductTransition(from: ProductState, to: ProductState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid product contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateProductLifecycle(trace: readonly ProductState[]): ProductOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid product contract: lifecycle must contain between 2 and 32 states");
  }
  if (trace[0] !== "UNRESOLVED") throw new Error("invalid product contract: lifecycle must start at UNRESOLVED");
  for (let index = 1; index < trace.length; index += 1) assertProductTransition(trace[index - 1], trace[index]);
  const terminal = trace[trace.length - 1];
  if (!isProductOutcome(terminal)) throw new Error("invalid product contract: lifecycle did not reach an outcome");
  if (trace.slice(0, -1).some((state) => isProductOutcome(state))) {
    throw new Error("invalid product contract: lifecycle continued past an outcome");
  }
  return terminal;
}

// UX-FND-004. A waiting, denied or failed outcome can never project as PASS, and UX-FND-005
// keeps adapter absence, implementation absence and an unrun canary in three distinct states.
export function productEvidenceForOutcome(outcome: ProductOutcome): EvidenceState {
  switch (outcome) {
    case "COMPLETED":
      return "PASS";
    case "ABSENT_ADAPTER":
      return "ABSENT";
    case "NOT_IMPLEMENTED":
      return "NOT_IMPLEMENTED";
    case "NOT_EXERCISED":
    case "WAITING_FOR_HUMAN":
    case "WAITING_FOR_HARDWARE":
      return "NOT_EXERCISED";
    default:
      return "FAIL";
  }
}
