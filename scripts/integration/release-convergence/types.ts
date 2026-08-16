import type { EvidenceState } from "../../../packages/contracts/src/index.ts";

export const RELEASE_CONVERGENCE_RECEIPT_SCHEMA = "agent-shield/release-convergence-receipt/v1" as const;
export const RELEASE_REQUIRED_ISSUES = [65, 66, 67, 68, 69, 70, 71, 72, 73, 74] as const;

export type ReleaseConvergenceState =
  | "CHILDREN_PENDING"
  | "SUBJECTS_PINNED"
  | "COMPOSITION_RESOLVED"
  | "OFFLINE_VERIFIED"
  | "CLAUDE_VERIFIED"
  | "CODEX_VERIFIED"
  | "ORIGINS_VERIFIED"
  | "EQUIVALENCE_VERIFIED"
  | "REMOVAL_ROLLBACK_CONTROLS_VERIFIED"
  | "RELEASE_RECEIPT_RENDERED"
  | "HUMAN_REVIEW"
  | "PROMOTED"
  | "REJECTED"
  | "ROLLED_BACK"
  | "CHILD_ABSENT"
  | "SUBJECT_MISMATCH"
  | "LOCK_CONFLICT"
  | "OFFLINE_FAIL"
  | "CLAUDE_FAIL"
  | "CODEX_FAIL"
  | "ORIGIN_FAIL"
  | "EQUIVALENCE_FAIL"
  | "CLEANUP_FAIL"
  | "ROLLBACK_FAIL"
  | "ATTESTATION_REQUIRED_ABSENT"
  | "HUMAN_REJECTED";

export type ReleaseConvergenceOutcome = Extract<ReleaseConvergenceState,
  | "HUMAN_REVIEW"
  | "PROMOTED"
  | "REJECTED"
  | "ROLLED_BACK"
  | "CHILD_ABSENT"
  | "SUBJECT_MISMATCH"
  | "LOCK_CONFLICT"
  | "OFFLINE_FAIL"
  | "CLAUDE_FAIL"
  | "CODEX_FAIL"
  | "ORIGIN_FAIL"
  | "EQUIVALENCE_FAIL"
  | "CLEANUP_FAIL"
  | "ROLLBACK_FAIL"
  | "ATTESTATION_REQUIRED_ABSENT"
  | "HUMAN_REJECTED">;

export const RELEASE_LANES = [
  "offline",
  "claude",
  "codex",
  "github-origin",
  "forgejo-origin",
  "equivalence",
] as const;

export type ReleaseLane = (typeof RELEASE_LANES)[number];
export type OriginEquivalenceLevel = "none" | "metadata" | "artifact" | "behavioral";
export type AttestationPolicy = "optional" | "required";

export interface ReleaseChildReceipt {
  issue: number;
  ownerId: string;
  interfaceVersion: string;
  subjectSha256: string;
  headSha256: string;
  lockSha256: string;
  compositionSha256: string;
  claims: string[];
  lane: ReleaseLane;
  state: EvidenceState;
  cleanupCleared: boolean;
}

export interface ExpectedReleaseChild {
  issue: number;
  ownerId: string;
  interfaceVersion: string;
  subjectSha256: string;
  lane: ReleaseLane;
}

export interface ReleaseConvergenceControls {
  deterministicCompositionCleared: boolean;
  hostParityCleared: boolean;
  carrierProxyFree: boolean;
  mcpDefaultDenyCleared: boolean;
  priorPinStable: boolean;
  selectedPolicyTools: string[];
  achievedOriginEquivalence: OriginEquivalenceLevel;
  requiredOriginEquivalence: OriginEquivalenceLevel;
  orphanRemovalCleared: boolean;
  rollbackTargetUnchanged: boolean;
  rollbackControlsCleared: boolean;
  residualGapsNamed: boolean;
}

export interface ReleaseModuleNode {
  id: string;
  provides: string[];
  requires: string[];
}

export interface ProposedReleaseStatus {
  lanes: Record<ReleaseLane, EvidenceState>;
  invalidatedModules: string[];
  publishedTools: string[];
  residualGaps: string[];
}

export interface ReleaseConvergenceReceipt {
  schema: typeof RELEASE_CONVERGENCE_RECEIPT_SCHEMA;
  lifecycle: ReleaseConvergenceState[];
  outcome: ReleaseConvergenceOutcome;
  childCount: number;
  lanes: Record<ReleaseLane, EvidenceState>;
  invalidatedModules: string[];
  publishedTools: string[];
  residualGaps: string[];
  headSha256: string;
  lockSha256: string;
  compositionSha256: string;
  releaseDigest: string | null;
  detail: string;
}

export interface ReleaseAttestation {
  artifactSha256: string;
  headSha256: string;
  lockSha256: string;
  releaseDigest: string;
}

export type ReleaseDecision = "promote" | "reject" | "rollback";
