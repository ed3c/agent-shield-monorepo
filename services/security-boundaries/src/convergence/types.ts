import type { EvidenceState } from "../../../../packages/contracts/src/index.ts";

export const SECURITY_CONVERGENCE_RECEIPT_SCHEMA = "agent-shield/security-convergence-receipt/v1" as const;
export const SECURITY_REQUIRED_ISSUES = [54, 55, 56, 57, 58, 59, 60, 61, 62, 63] as const;

export type SecurityConvergenceState =
  | "CHILDREN_PENDING"
  | "SUBJECTS_PINNED"
  | "CAPABILITIES_RESOLVED"
  | "CEREMONY_PRECHECK"
  | "E2E_REFERENCE_RUNNING"
  | "ADVERSARIAL_SUITE_RUNNING"
  | "RECOVERY_SUITE_RUNNING"
  | "CLEANUP_REVOCATION_CHECKED"
  | "RESIDUAL_RISK_REVIEWED"
  | "RELEASE_RENDERED"
  | "HUMAN_REVIEW"
  | "TESTNET_ADMITTED"
  | "CHILD_ABSENT"
  | "SUBJECT_MISMATCH"
  | "CAPABILITY_CONFLICT"
  | "CEREMONY_REFUSED"
  | "POLICY_FAIL"
  | "HARDWARE_FAIL"
  | "SIGNING_FAIL"
  | "LEDGER_FAIL"
  | "CONTRACT_FAIL"
  | "TESTNET_FAIL"
  | "RECOVERY_FAIL"
  | "CLEANUP_FAIL"
  | "AUDIT_GAP"
  | "HUMAN_REJECTED";

export type SecurityConvergenceOutcome = Extract<SecurityConvergenceState,
  | "HUMAN_REVIEW"
  | "TESTNET_ADMITTED"
  | "CHILD_ABSENT"
  | "SUBJECT_MISMATCH"
  | "CAPABILITY_CONFLICT"
  | "CEREMONY_REFUSED"
  | "POLICY_FAIL"
  | "HARDWARE_FAIL"
  | "SIGNING_FAIL"
  | "LEDGER_FAIL"
  | "CONTRACT_FAIL"
  | "TESTNET_FAIL"
  | "RECOVERY_FAIL"
  | "CLEANUP_FAIL"
  | "AUDIT_GAP"
  | "HUMAN_REJECTED">;

export const SECURITY_LANES = ["policy", "hardware", "signing", "ledger", "contract", "testnet"] as const;
export type SecurityLane = (typeof SECURITY_LANES)[number];

export interface SecurityChildReceipt {
  issue: number;
  providerId: string;
  interfaceVersion: string;
  subjectSha256: string;
  ceremonySha256: string;
  capabilities: string[];
  lane: SecurityLane;
  state: EvidenceState;
  cleanupCleared: boolean;
}

export interface ExpectedSecurityChild {
  issue: number;
  providerId: string;
  interfaceVersion: string;
  subjectSha256: string;
  lane: SecurityLane;
}

export interface SecurityConvergenceControls {
  ceremonyAdmitSha256: string | null;
  lowRiskSessionLimitsCleared: boolean;
  highRiskHardwareEnforced: boolean;
  replayAndStalenessCleared: boolean;
  compromisedComponentCleared: boolean;
  threatModelMeasured: boolean;
  lostSubjectRecoveryCleared: boolean;
  automaticUnsafeRecoveryDisabled: boolean;
  ledgerChainConsistencyCleared: boolean;
  confirmationStatesDistinct: boolean;
  adversarialInputsCleared: boolean;
  secrecyPrivacyCleared: boolean;
  cleanupRevocationCleared: boolean;
  auditScopesRecorded: boolean;
  residualRisksRecorded: boolean;
  claimLanguageCleared: boolean;
}

export interface SecurityModuleNode {
  id: string;
  provides: string[];
  requires: string[];
}

export interface ProposedSecurityStatus {
  lanes: Record<SecurityLane, EvidenceState>;
  invalidatedModules: string[];
}

export interface SecurityConvergenceReceipt {
  schema: typeof SECURITY_CONVERGENCE_RECEIPT_SCHEMA;
  lifecycle: SecurityConvergenceState[];
  outcome: SecurityConvergenceOutcome;
  childCount: number;
  ceremonySha256: string;
  lanes: Record<SecurityLane, EvidenceState>;
  invalidatedModules: string[];
  releaseDigest: string | null;
  detail: string;
}
