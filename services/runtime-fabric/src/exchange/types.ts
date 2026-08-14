import type { EvidenceState } from "../../../../packages/contracts/src/index.ts";

export const RUNTIME_EXCHANGE_REQUEST_SCHEMA = "agent-shield/runtime-exchange-request/v1" as const;
export const RUNTIME_EXCHANGE_RECEIPT_SCHEMA = "agent-shield/runtime-exchange-receipt/v1" as const;

export type RuntimePlane = "local" | "cloud";
export type RuntimeExchangeDataClass = "source" | "artifact" | "policy" | "database" | "secret" | "session";
export type RuntimeExchangeStrategy =
  | "git-patch"
  | "content-addressed-artifact"
  | "policy-epoch"
  | "api-event"
  | "newest-wins"
  | "prefer-cloud"
  | "prefer-beta"
  | "bidirectional-folder-sync";

export type RuntimeExchangeLifecycleState =
  | "REQUESTED"
  | "CLASSIFIED"
  | "SUBJECT_VERIFIED"
  | "LEASE_VERIFIED"
  | "STRATEGY_VERIFIED"
  | "PAYLOAD_VERIFIED"
  | "REVIEW_PENDING"
  | "READY_FOR_APPLY"
  | "RECEIPTED"
  | RuntimeExchangeOutcome;

export type RuntimeExchangeOutcome =
  | "READY_FOR_REVIEW"
  | "READY_FOR_APPLY"
  | "REFUSED_DATA_CLASS"
  | "REFUSED_STRATEGY"
  | "STALE_BASE"
  | "LEASE_EXPIRED"
  | "LEASE_MISMATCH"
  | "PATH_OUT_OF_SCOPE"
  | "INVALID_PAYLOAD"
  | "INVALID_REVIEW"
  | "INVALID_REQUEST";

export interface RuntimeGitSubject {
  repository: string;
  commit: string;
  tree: string;
}

export interface RuntimeArtifactSubject {
  sha256: string;
  bytes: number;
  mediaType: string;
}

export interface RuntimeWriterLease {
  leaseId: string;
  writerId: string;
  branch: string;
  repository: string;
  baseCommit: string;
  baseTree: string;
  writableRoots: string[];
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
}

export interface RuntimePatchEnvelope {
  kind: "git-patch";
  artifact: RuntimeArtifactSubject;
  baseCommit: string;
  baseTree: string;
  resultTree: string;
  changedPaths: string[];
}

export interface RuntimeImmutableArtifactEnvelope {
  kind: "content-addressed-artifact";
  artifact: RuntimeArtifactSubject;
}

export interface RuntimePolicyEnvelope {
  kind: "policy-epoch";
  artifact: RuntimeArtifactSubject;
  currentEpoch: number;
  nextEpoch: number;
}

export interface RuntimeApiEventEnvelope {
  kind: "api-event";
  artifact: RuntimeArtifactSubject;
  stream: string;
  sequence: number;
}

export type RuntimeExchangeEnvelope =
  | RuntimePatchEnvelope
  | RuntimeImmutableArtifactEnvelope
  | RuntimePolicyEnvelope
  | RuntimeApiEventEnvelope;

export interface RuntimeReviewApproval {
  schema: "agent-shield/exchange-review-approval/v1";
  requestDigest: string;
  reviewerClass: "human" | "trusted-automation";
  approvalRef: RuntimeArtifactSubject;
}

export interface RuntimeExchangeRequest {
  schema: typeof RUNTIME_EXCHANGE_REQUEST_SCHEMA;
  requestId: string;
  observedAtEpochMs: number;
  sourcePlane: RuntimePlane;
  targetPlane: RuntimePlane;
  dataClass: RuntimeExchangeDataClass;
  strategy: RuntimeExchangeStrategy;
  source: RuntimeGitSubject | RuntimeArtifactSubject;
  lease: RuntimeWriterLease | null;
  envelope: RuntimeExchangeEnvelope | null;
  review: RuntimeReviewApproval | null;
  exclusions: string[];
}

export interface RuntimeExchangeReceipt {
  schema: typeof RUNTIME_EXCHANGE_RECEIPT_SCHEMA;
  requestId: string;
  requestDigest: string;
  lifecycle: RuntimeExchangeLifecycleState[];
  outcome: RuntimeExchangeOutcome;
  state: EvidenceState;
  sourcePlane: RuntimePlane;
  targetPlane: RuntimePlane;
  dataClass: RuntimeExchangeDataClass;
  strategy: RuntimeExchangeStrategy;
  source: RuntimeGitSubject | RuntimeArtifactSubject;
  leaseDigest: string | null;
  envelope: RuntimeExchangeEnvelope | null;
  review: RuntimeReviewApproval | null;
  applicationState: "NOT_EXERCISED";
  exclusions: string[];
  detail: string;
}
