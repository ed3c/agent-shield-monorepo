import type { EvidenceState } from "../index.ts";
import type { ProductActorKind } from "../product/index.ts";

export const SETTLEMENT_INTENT_SCHEMA = "agent-shield/settlement-intent/v1" as const;
export const SECURITY_CHALLENGE_SCHEMA = "agent-shield/security-challenge/v1" as const;
export const SECURITY_SETTLEMENT_RECEIPT_SCHEMA = "agent-shield/security-settlement-receipt/v1" as const;

export type SecurityRiskTier = "low" | "high";

export type SecurityState =
  | "DRAFT"
  | "INTENT_VALIDATED"
  | "RISK_EVALUATED"
  | "ROUTED"
  | "SESSION_AUTHORIZED"
  | "CHALLENGE_ISSUED"
  | "EVIDENCE_VERIFIED"
  | "SIGNING_AUTHORIZED"
  | "OPERATION_PREPARED"
  | "SUBMISSION_PENDING"
  | "DENIED"
  | "EXPIRED"
  | "REVOKED"
  | "REPLAY_REFUSED"
  | "WAITING_FOR_HUMAN"
  | "WAITING_FOR_HARDWARE"
  | "ABSENT_PROVIDER"
  | "NOT_IMPLEMENTED"
  | "NOT_EXERCISED"
  | "FAILED_POLICY"
  | "FAILED_EVIDENCE"
  | "FAILED_SIGNING"
  | "FAILED_LEDGER"
  | "FAILED_SUBMISSION"
  | "FAILED_RECOVERY";

export type SecurityOutcome = Extract<SecurityState,
  | "SUBMISSION_PENDING"
  | "DENIED"
  | "EXPIRED"
  | "REVOKED"
  | "REPLAY_REFUSED"
  | "WAITING_FOR_HUMAN"
  | "WAITING_FOR_HARDWARE"
  | "ABSENT_PROVIDER"
  | "NOT_IMPLEMENTED"
  | "NOT_EXERCISED"
  | "FAILED_POLICY"
  | "FAILED_EVIDENCE"
  | "FAILED_SIGNING"
  | "FAILED_LEDGER"
  | "FAILED_SUBMISSION"
  | "FAILED_RECOVERY">;

// SEC-FND-004. Each capability class carries its own receipt kind, so no receipt can stand
// in for another: a policy decision is not hardware evidence, and neither is a ledger proof.
export type SecurityProviderKind =
  | "policy"
  | "workflow"
  | "broker"
  | "ledger"
  | "hardware"
  | "crypto"
  | "chain";

// SEC-FND-005. Every reference into a secret-bearing system is opaque: a kind, a stable ID
// and a digest. No key, shard, PIN, token, session or NFC byte can be expressed here.
export type SecuritySubjectKind = "broker-secret" | "key" | "device" | "card" | "session";

export interface SecurityOpaqueRef {
  kind: SecuritySubjectKind;
  id: string;
  sha256: string;
}

// SEC-FND-008. A claim carrying a percentage or comparative security number must name the
// model that produced it. Absolute claims have no admissible measurement model at all.
export interface SecurityClaim {
  text: string;
  measurementModel: string | null;
}

export interface SettlementIntent {
  schema: typeof SETTLEMENT_INTENT_SCHEMA;
  intentId: string;
  actorKind: ProductActorKind;
  actorId: string;
  target: string;
  amountMinor: string;
  currency: string;
  purpose: string;
  evidenceRefs: string[];
  policyEpoch: number;
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
}

export interface SecurityRiskDecision {
  intentDigest: string;
  policyEpoch: number;
  tier: SecurityRiskTier;
  humanAdmitRequired: boolean;
  reasonCodes: string[];
  detail: string;
}

export interface SecurityChallenge {
  schema: typeof SECURITY_CHALLENGE_SCHEMA;
  nonce: string;
  intentDigest: string;
  policyEpoch: number;
  audience: string;
  subjects: SecurityOpaqueRef[];
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
}

export interface SecurityHardwareEvidence {
  challengeNonce: string;
  intentDigest: string;
  policyEpoch: number;
  subject: SecurityOpaqueRef;
  attestationSha256: string;
  detail: string;
}

export interface SecurityProviderReceipt {
  kind: SecurityProviderKind;
  providerId: string;
  providerVersion: string;
  subject: SecurityOpaqueRef | null;
  implementation: "IMPLEMENTED" | "NOT_IMPLEMENTED";
  state: EvidenceState;
  auditRef: string | null;
  detail: string;
}

// SEC-FND-006. A revocation names the epoch it takes effect from; evidence bound to an
// earlier epoch stops being admissible rather than being re-evaluated.
export interface SecurityRevocation {
  subject: SecurityOpaqueRef;
  revokedFromEpoch: number;
  reason: string;
}

export interface SecuritySettlementReceipt {
  schema: typeof SECURITY_SETTLEMENT_RECEIPT_SCHEMA;
  intentId: string;
  intentDigest: string;
  policyEpoch: number;
  tier: SecurityRiskTier;
  lifecycle: SecurityState[];
  outcome: SecurityOutcome;
  state: EvidenceState;
  providerReceipts: SecurityProviderReceipt[];
  humanAdmit: {
    required: boolean;
    granted: boolean;
    approverId: string | null;
  };
  claims: SecurityClaim[];
  exclusions: string[];
  detail: string;
}
