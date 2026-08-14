import type { SecurityOpaqueRef } from "../../../../../packages/contracts/src/security/index.ts";
import type { SealedSecret } from "./sealed.ts";

export const BROKER_AUDIT_SCHEMA = "agent-shield/openbao-audit/v1" as const;
export const OPENBAO_PROVIDER_ID = "openbao-broker" as const;

export type BrokerState =
  | "UNRESOLVED"
  | "SERVER_ADMITTED"
  | "AUTHENTICATING"
  | "LEASE_ISSUED"
  | "OPERATION_AUTHORIZED"
  | "OPERATION_EXECUTED"
  | "AUDITED"
  | "LEASE_REVOKED"
  | "ABSENT_SERVER"
  | "ABSENT_AUTH"
  | "AUTH_REFUSED"
  | "POLICY_REFUSED"
  | "LEASE_EXPIRED"
  | "OPERATION_FAILED"
  | "AUDIT_FAILED"
  | "REVOCATION_FAILED"
  | "FAILED_CLEANUP";

export type BrokerOutcome = Extract<BrokerState,
  | "LEASE_REVOKED"
  | "ABSENT_SERVER"
  | "ABSENT_AUTH"
  | "AUTH_REFUSED"
  | "POLICY_REFUSED"
  | "LEASE_EXPIRED"
  | "OPERATION_FAILED"
  | "AUDIT_FAILED"
  | "REVOCATION_FAILED"
  | "FAILED_CLEANUP">;

// SEC-BAO-001.
export interface OpenBaoServerSubject {
  id: string;
  version: string;
  artifactSha256: string;
  sourceCommit: string;
  license: "MPL-2.0";
  licenseSha256: string;
  sbomSha256: string;
  noticesSha256: string;
}

// SEC-BAO-003. A policy names one exact path, one operation and one workflow. There is no
// wildcard syntax to write, so least privilege is not something a reviewer has to notice.
export type BrokerOperationKind = "read" | "wrap" | "unwrap" | "rotate" | "revoke";

export interface BrokerPolicy {
  path: string;
  operation: BrokerOperationKind;
  workflowId: string;
  policyEpoch: number;
}

export interface BrokerLease {
  leaseId: string;
  path: string;
  workflowId: string;
  actorId: string;
  policyEpoch: number;
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
  revoked: boolean;
}

export interface BrokerRequest {
  ref: SecurityOpaqueRef;
  path: string;
  operation: BrokerOperationKind;
  workflowId: string;
  actorId: string;
  policyEpoch: number;
}

// SEC-BAO-007. Metadata only. There is no field on this type that could hold a value, so an
// audit receipt cannot become a copy of the secret even by accident.
export interface BrokerAuditReceipt {
  schema: typeof BROKER_AUDIT_SCHEMA;
  serverVersion: string;
  refKind: SecurityOpaqueRef["kind"];
  refId: string;
  path: string;
  operation: BrokerOperationKind;
  workflowId: string;
  actorId: string;
  policyEpoch: number;
  leaseId: string;
  result: "OK" | "REFUSED" | "FAILED";
  valueByteLength: number | null;
  auditDigest: string;
}

export interface BrokerResult {
  lifecycle: BrokerState[];
  outcome: BrokerOutcome;
  audit: BrokerAuditReceipt | null;
  // The sealed value is returned to the in-process caller only, never serialized with the
  // rest of the result.
  sealed: SealedSecret | null;
}

export type BrokerProbeState = "AVAILABLE" | "ABSENT" | "SEALED";

export interface BrokerTransport {
  probe(): { state: BrokerProbeState; version: string | null };
  authenticate(actorId: string, workflowId: string): string | null;
  issueLease(request: BrokerRequest, nowEpochMs: number): BrokerLease | null;
  execute(lease: BrokerLease, request: BrokerRequest): SealedSecret | null;
  writeAudit(receipt: BrokerAuditReceipt): boolean;
  revoke(lease: BrokerLease): boolean;
  residualTokens(): number;
}

export interface OpenBaoProviderConfig {
  server: OpenBaoServerSubject;
  policies: BrokerPolicy[];
  maxLeaseMs: number;
}
