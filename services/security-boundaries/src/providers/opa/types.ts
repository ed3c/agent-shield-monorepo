import type { SecurityOpaqueRef, SettlementIntent } from "../../../../../packages/contracts/src/security/index.ts";

export const OPA_DECISION_SCHEMA = "agent-shield/opa-policy-decision/v1" as const;
export const OPA_PROVIDER_ID = "opa-policy-local" as const;

export type OpaState =
  | "UNRESOLVED"
  | "ENGINE_ADMITTED"
  | "BUNDLE_RESOLVED"
  | "BUNDLE_VERIFIED"
  | "INPUT_VALIDATED"
  | "EVALUATING"
  | "DECISION_EMITTED"
  | "ABSENT_ENGINE"
  | "ABSENT_BUNDLE"
  | "INVALID_POLICY"
  | "INVALID_INPUT"
  | "EVALUATION_FAILED"
  | "POLICY_EPOCH_STALE"
  | "FAILED_CLEANUP";

export type OpaOutcome = Extract<OpaState,
  | "DECISION_EMITTED"
  | "ABSENT_ENGINE"
  | "ABSENT_BUNDLE"
  | "INVALID_POLICY"
  | "INVALID_INPUT"
  | "EVALUATION_FAILED"
  | "POLICY_EPOCH_STALE"
  | "FAILED_CLEANUP">;

// SEC-OPA-006. A decision is one of four. Engine absence, bundle absence, invalid policy and
// evaluation failure are lifecycle outcomes, not decisions, so a failure can never arrive at a
// call site shaped like an allow.
export type OpaDecisionState = "ALLOW_SESSION" | "REQUIRE_HARDWARE" | "REQUIRE_HUMAN" | "DENY";

// SEC-OPA-001. The exact engine artifact, its source and its mandatory licence state. An
// unknown licence state is not a warning; it is an inadmissible engine.
export interface OpaEngineSubject {
  id: string;
  version: string;
  artifactSha256: string;
  sourceCommit: string;
  license: "Apache-2.0";
  licenseSha256: string;
  sbomSha256: string;
  noticesSha256: string;
}

export interface OpaBundleSubject {
  bundleId: string;
  bundleVersion: string;
  bundleSha256: string;
  policyEpoch: number;
  ruleIds: string[];
}

export interface OpaLimits {
  maxAmountMinor: string;
  deniedTargets: string[];
  requiredEvidenceRefs: string[];
  hardwareDataClasses: string[];
}

// The evaluation input is a closed projection of the intent. Free text from the intent -- the
// purpose field -- is deliberately absent: SEC-OPA-004 requires untrusted content to be data,
// and the simplest way to guarantee it never becomes instruction is to not pass it in.
export interface OpaEvaluationInput {
  intentId: string;
  intentDigest: string;
  policyEpoch: number;
  target: string;
  amountMinor: string;
  currency: string;
  actorKind: SettlementIntent["actorKind"];
  actorId: string;
  evidenceRefs: string[];
  dataClass: string;
}

export interface OpaDecision {
  schema: typeof OPA_DECISION_SCHEMA;
  state: OpaDecisionState;
  intentDigest: string;
  policyEpoch: number;
  bundleSha256: string;
  reasonCodes: string[];
  requiredEvidence: string[];
  detail: string;
}

export interface OpaEvaluationResult {
  lifecycle: OpaState[];
  outcome: OpaOutcome;
  decision: OpaDecision | null;
}

export type OpaProbeState = "AVAILABLE" | "ABSENT" | "REFUSED_POLICY";

export interface OpaProbeResult {
  state: OpaProbeState;
  version: string | null;
  detail: string;
}

// The transport is the boundary to the real engine. Nothing in this adapter shells out, and
// the interface carries no command, argv or path field for a caller to reach through.
export interface OpaEngineTransport {
  probe(): OpaProbeResult;
  resolveBundle(bundleId: string): OpaBundleSubject | null;
  bundleDigest(bundle: OpaBundleSubject): string;
  evaluate(bundle: OpaBundleSubject, input: OpaEvaluationInput, limits: OpaLimits): OpaDecisionState | null;
  cleanup(): boolean;
}

export interface OpaProviderConfig {
  engine: OpaEngineSubject;
  bundleId: string;
  limits: OpaLimits;
  brokerRef: SecurityOpaqueRef | null;
}
