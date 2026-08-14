import type { ReleaseModule } from "../../../packages/contracts/src/integration/index.ts";
import type { AuthoringOriginReceipt } from "../forgejo-origin/index.ts";
import type { OriginReceipt } from "../github-origin/index.ts";

export const EQUIVALENCE_RECEIPT_SCHEMA = "agent-shield/origin-equivalence-receipt/v1" as const;

export type EquivalenceState =
  | "UNRESOLVED"
  | "GITHUB_RECEIPT_VERIFIED"
  | "FORGEJO_RECEIPT_VERIFIED"
  | "LOGICAL_RELEASE_MATCHED"
  | "EQUIVALENCE_LEVEL_SELECTED"
  | "COMPARING"
  | "EQUIVALENT"
  | "RECEIPT_EMITTED"
  | "GITHUB_ABSENT"
  | "FORGEJO_ABSENT"
  | "RECEIPT_STALE"
  | "SUBJECT_MISMATCH"
  | "NOT_EQUIVALENT"
  | "UNSUPPORTED_LEVEL"
  | "CLOSURE_MISMATCH"
  | "ATTESTATION_ABSENT";

export type EquivalenceOutcome = Extract<EquivalenceState,
  | "RECEIPT_EMITTED"
  | "GITHUB_ABSENT"
  | "FORGEJO_ABSENT"
  | "RECEIPT_STALE"
  | "SUBJECT_MISMATCH"
  | "NOT_EQUIVALENT"
  | "UNSUPPORTED_LEVEL"
  | "CLOSURE_MISMATCH"
  | "ATTESTATION_ABSENT">;

// INT-EQ-007. Ordered strongest first. The verdict is the strongest level the evidence actually
// supports, and reporting a stronger one than was achieved is the failure this ordering exists
// to make expressible-and-then-refusable rather than accidental.
export const EQUIVALENCE_LEVELS = ["exact-commit", "same-tree", "same-release-manifest"] as const;

export type EquivalenceLevel = (typeof EQUIVALENCE_LEVELS)[number];

// INT-EQ-006. Neither origin receipt carries a timestamp, and that is correct -- a receipt
// describes an immutable subject, not a moment. Freshness is a property of *this comparison*:
// how long ago each receipt was observed. So it is an input to the comparator rather than a
// field somebody could backdate inside a receipt.
export interface ObservedReceipt<T> {
  receipt: T;
  observedAtEpochMs: number;
}

export interface EquivalenceRequest {
  github: ObservedReceipt<OriginReceipt> | null;
  forgejo: ObservedReceipt<AuthoringOriginReceipt> | null;
  // The closure each origin is claimed to carry. INT-EQ-005's control is a matching top-level
  // manifest label with a changed closure, so the modules are compared and not just the label.
  githubClosure: readonly ReleaseModule[];
  forgejoClosure: readonly ReleaseModule[];
  requestedLevel: EquivalenceLevel;
  nowEpochMs: number;
  maxReceiptAgeMs: number;
  // Levels that require a signed attestation before they may be claimed. Empty by default:
  // this repository has no attestation lane, and a level nobody can support is refused rather
  // than quietly downgraded.
  attestationRequiredFor: readonly EquivalenceLevel[];
  attestationPresent: boolean;
}

export interface EquivalenceReceipt {
  schema: typeof EQUIVALENCE_RECEIPT_SCHEMA;
  repositoryFullName: string;
  releaseId: string;
  lifecycle: EquivalenceState[];
  outcome: EquivalenceOutcome;
  // The level actually achieved, which may be weaker than the one requested and is never
  // stronger. `null` whenever the comparison did not conclude.
  achievedLevel: EquivalenceLevel | null;
  requestedLevel: EquivalenceLevel;
  moduleCount: number;
  detail: string;
}
