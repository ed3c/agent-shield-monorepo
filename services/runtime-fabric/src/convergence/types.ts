export const CONVERGENCE_RECEIPT_SCHEMA = "agent-shield/runtime-convergence-receipt/v1" as const;

export type ConvergenceState =
  | "CHILDREN_PENDING"
  | "SUBJECTS_PINNED"
  | "REGISTRY_RESOLVED"
  | "MATRIX_RUNNING"
  | "CONTROLS_RUNNING"
  | "CLEANUP_CHECKED"
  | "RELEASE_RENDERED"
  | "HUMAN_REVIEW"
  | "ADMITTED"
  | "CHILD_ABSENT"
  | "SUBJECT_MISMATCH"
  | "CAPABILITY_CONFLICT"
  | "LOCAL_FAIL"
  | "CLOUD_FAIL"
  | "HYBRID_FAIL"
  | "CLEANUP_FAIL"
  | "RELEASE_DRIFT"
  | "HUMAN_REJECTED";

export type ConvergenceOutcome = Extract<ConvergenceState,
  | "HUMAN_REVIEW"
  | "ADMITTED"
  | "CHILD_ABSENT"
  | "SUBJECT_MISMATCH"
  | "CAPABILITY_CONFLICT"
  | "LOCAL_FAIL"
  | "CLOUD_FAIL"
  | "HYBRID_FAIL"
  | "CLEANUP_FAIL"
  | "RELEASE_DRIFT"
  | "HUMAN_REJECTED">;

// The three routes #44 converges. Named as a union so a fourth route cannot appear without the
// matrix, the status map and the terminal states all being updated together.
export type RuntimeRoute = "local" | "cloud" | "hybrid";

export type RouteState = "PASS" | "FAIL" | "NOT_EXERCISED" | "NOT_IMPLEMENTED";

// RT-CONV-001. What a child leaf hands the convergence. Every field is an identity: the
// convergence never re-derives a child's result, only checks that the receipt it was given
// belongs to the child it claims to be from.
export interface ChildReceipt {
  issue: number;
  providerId: string;
  interfaceVersion: string;
  // The immutable subject the child pinned. A stale receipt is one whose subject is not the one
  // the convergence expects for that child -- which is the control the eval names.
  providerSubjectSha256: string;
  capabilities: string[];
  route: RuntimeRoute;
  state: RouteState;
  cleanupCleared: boolean;
}

export interface ExpectedChild {
  issue: number;
  providerId: string;
  interfaceVersion: string;
  providerSubjectSha256: string;
}

// RT-CONV-008. The module graph, as the manifests already record it. `provides` and `requires`
// are capability strings, so the dependent set is computed rather than listed.
export interface ModuleNode {
  id: string;
  provides: string[];
  requires: string[];
}

// RT-CONV-009. What the convergence proposes to write. It is an input, not an output: the
// verifier's job is to decide whether the proposal is supported by the receipts, and a proposal
// nobody checked is exactly how an unreceipted PASS reaches a status file.
export interface ProposedStatus {
  routes: Record<RuntimeRoute, RouteState>;
  // Modules whose evidence the proposal marks stale. Compared against the computed dependent
  // set: restamping an unrelated module because HEAD moved is the control.
  invalidatedModules: string[];
}

export interface ConvergenceReceipt {
  schema: typeof CONVERGENCE_RECEIPT_SCHEMA;
  lifecycle: ConvergenceState[];
  outcome: ConvergenceOutcome;
  childCount: number;
  routes: Record<RuntimeRoute, RouteState>;
  invalidatedModules: string[];
  releaseDigest: string | null;
  detail: string;
}
