export {
  closureDigest,
  compareOrigins,
  equivalenceReceiptRefusal,
  fail,
  originEquivalenceState,
} from "./comparator.ts";
export {
  assertEquivalenceTransition,
  isEquivalenceOutcome,
  validateEquivalenceLifecycle,
} from "./state-machine.ts";
export { EQUIVALENCE_LEVELS, EQUIVALENCE_RECEIPT_SCHEMA } from "./types.ts";
export type {
  EquivalenceLevel,
  EquivalenceOutcome,
  EquivalenceReceipt,
  EquivalenceRequest,
  EquivalenceState,
  ObservedReceipt,
} from "./types.ts";
