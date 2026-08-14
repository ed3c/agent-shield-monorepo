import type { EvidenceState } from "../index.ts";

export const EXCHANGE_REQUEST_SCHEMA = "agent-shield/exchange-request/v1" as const;
export const EXCHANGE_RECEIPT_SCHEMA = "agent-shield/exchange-receipt/v1" as const;
export const EXCHANGE_ROLLBACK_SCHEMA = "agent-shield/exchange-rollback-receipt/v1" as const;

export type ExchangeClass = "source"|"artifact"|"policy"|"image"|"data"|"secret"|"session";
export type ExchangeEnvironment = "local"|"cloud";
export type ExchangeState =
  | "UNRESOLVED"|"CLASSIFIED"|"LEASED"|"BASE_BOUND"|"EXPORTED"|"TRANSFERRED"|"VERIFIED"|"APPLIED"|"REPLAYED"
  | "COMPLETED"|"ABSENT_BASE"|"LEASE_CONFLICT"|"BASE_DRIFT"|"PATH_CONFLICT"|"POLICY_REFUSED"
  | "TRANSFER_FAILED"|"VERIFY_FAILED"|"APPLY_FAILED"|"REPLAY_FAILED"|"ROLLBACK_REFUSED_DRIFT";
export type ExchangeOutcome = Extract<ExchangeState,
  "COMPLETED"|"ABSENT_BASE"|"LEASE_CONFLICT"|"BASE_DRIFT"|"PATH_CONFLICT"|"POLICY_REFUSED"|
  "TRANSFER_FAILED"|"VERIFY_FAILED"|"APPLY_FAILED"|"REPLAY_FAILED"|"ROLLBACK_REFUSED_DRIFT">;

export interface ExchangeTarget {
  id:string; digest:string; generation:number; policyEpoch:number|null; recordCount:number|null; bindings:string[];
}
export interface ExchangeLease {
  id:string; owner:string; branch:string; baseDigest:string; allowedPaths:string[]; expiresAtEpochMs:number;
}
export type ExchangePayload =
  | {class:"source"; base:{repository:string;commit:string;tree:string;digest:string};
      patch:{format:"git-patch";sha256:string;touchedPaths:string[];resultSha256:string}}
  | {class:"artifact"; artifact:{kind:string;sha256:string;bytes:number;mediaType:string}}
  | {class:"policy"; policy:{schema:string;previousEpoch:number;epoch:number;sha256:string}}
  | {class:"image"; image:{kind:"image"|"template";id:string;platform:string;sha256:string}}
  | {class:"data"; data:{snapshotSha256:string;eventLogSha256:string;invariantSha256:string;
      resultSha256:string;expectedRecords:number;replayedRecords:number}}
  | {class:"secret"; secret:{brokerRef:string;bindingId:string}}
  | {class:"session"; session:{brokerRef:string;bindingId:string;sessionClass:"browser"|"device"}};

export interface ExchangeRequest {
  schema:typeof EXCHANGE_REQUEST_SCHEMA; requestId:string; sourceEnvironment:ExchangeEnvironment;
  targetEnvironment:ExchangeEnvironment; dataClass:ExchangeClass; lease:ExchangeLease;
  target:ExchangeTarget; payload:ExchangePayload; exclusions:string[];
}
export type ExchangeTransport =
  "git-patch"|"content-addressed-object"|"policy-epoch"|"image-rebuild"|
  "snapshot-event-replay"|"secret-broker-binding"|"session-broker-binding";
export interface ExchangeArtifact {kind:string;sha256:string;bytes:number|null;mediaType:string}
export interface ExchangeReceipt {
  schema:typeof EXCHANGE_RECEIPT_SCHEMA; requestId:string; requestDigest:string; dataClass:ExchangeClass;
  sourceEnvironment:ExchangeEnvironment; targetEnvironment:ExchangeEnvironment; lifecycle:ExchangeState[];
  outcome:ExchangeOutcome; state:EvidenceState; transport:ExchangeTransport; leaseId:string;
  targetBefore:ExchangeTarget; targetAfter:ExchangeTarget; artifacts:ExchangeArtifact[];
  appliedPaths:string[]; exclusions:string[]; detail:string;
}
export interface ExchangeResult {target:ExchangeTarget;receipt:ExchangeReceipt}
export interface ExchangeRollbackReceipt {
  schema:typeof EXCHANGE_ROLLBACK_SCHEMA; requestId:string; originalRequestDigest:string;
  targetBefore:ExchangeTarget; targetObserved:ExchangeTarget; targetAfter:ExchangeTarget;
  outcome:"COMPLETED"|"ROLLBACK_REFUSED_DRIFT"; state:EvidenceState; detail:string;
}
