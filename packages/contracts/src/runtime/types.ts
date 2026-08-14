import type { EvidenceState } from "../index.ts";

export const RUNTIME_REQUEST_SCHEMA = "agent-shield/runtime-request/v1" as const;
export const RUNTIME_RECEIPT_SCHEMA = "agent-shield/runtime-receipt/v1" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type RuntimeScope = "local" | "cloud";
export type RuntimeCredentialBoundary = "none" | "host-only" | "broker-only";
export type RuntimeImplementationState = "IMPLEMENTED" | "NOT_IMPLEMENTED";
export type RuntimeAvailabilityState = "AVAILABLE" | "ABSENT" | "REFUSED_POLICY";
export type RuntimeExerciseState = "PASS" | "FAIL" | "NOT_EXERCISED";

export type RuntimePhaseState =
  | "UNRESOLVED"
  | "RESOLVED"
  | "ADMISSION_CHECKED"
  | "MATERIALIZING"
  | "READY"
  | "RUNNING"
  | "COLLECTING"
  | "CLEANING";

export type RuntimeOutcomeState =
  | "COMPLETED"
  | "ABSENT"
  | "NOT_IMPLEMENTED"
  | "NOT_EXERCISED"
  | "REFUSED_POLICY"
  | "FAILED_ADMISSION"
  | "FAILED_MATERIALIZATION"
  | "FAILED_EXECUTION"
  | "FAILED_ARTIFACT"
  | "FAILED_CLEANUP"
  | "CANCELLED"
  | "TIMED_OUT";

export type RuntimeLifecycleState = RuntimePhaseState | RuntimeOutcomeState;

export interface RuntimeGitSourceRef {
  kind: "git";
  repository: string;
  commit: string;
  tree: string;
}

export interface RuntimeArtifactSourceRef {
  kind: "artifact";
  sha256: string;
  mediaType: string;
}

export type RuntimeSourceRef = RuntimeGitSourceRef | RuntimeArtifactSourceRef;

export interface RuntimeWorkload {
  id: string;
  version: string;
  input: JsonObject;
}

export interface RuntimeEnvironmentPolicy {
  allowedVariables: string[];
}

export interface RuntimeNetworkPolicy {
  mode: "deny-all" | "allowlist";
  allowlist: string[];
}

export interface RuntimeSecretRef {
  name: string;
  brokerRef: string;
  class: Exclude<RuntimeCredentialBoundary, "none">;
  delivery: "environment" | "opaque-handle";
}

export interface RuntimeLimits {
  timeoutMs: number;
  cancellationGraceMs: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxArtifactBytes: number;
  maxTouchedPaths: number;
}

export interface RuntimeMutationScope {
  writableRoots: string[];
  readOnlyRoots: string[];
}

export interface RuntimeArtifactRequest {
  kind: string;
  required: boolean;
  maxBytes: number;
  mediaTypes: string[];
}

export interface RuntimeCleanupPolicy {
  processCleanup: "required";
  workspaceCleanup: "delete" | "preserve-on-failure";
  sessionCleanup: "required";
  maxDurationMs: number;
}

export interface RuntimeRequest {
  schema: typeof RUNTIME_REQUEST_SCHEMA;
  requestId: string;
  providerId: string;
  scope: RuntimeScope;
  requiredCapabilities: string[];
  source: RuntimeSourceRef;
  workload: RuntimeWorkload;
  environment: RuntimeEnvironmentPolicy;
  network: RuntimeNetworkPolicy;
  secrets: RuntimeSecretRef[];
  limits: RuntimeLimits;
  mutation: RuntimeMutationScope;
  artifacts: RuntimeArtifactRequest[];
  cleanup: RuntimeCleanupPolicy;
  exclusions: string[];
}

export interface RuntimeProviderDescriptor {
  id: string;
  version: string;
  scope: RuntimeScope;
  capabilities: string[];
  credentialBoundary: RuntimeCredentialBoundary;
  implementation: RuntimeImplementationState;
  availability: RuntimeAvailabilityState;
  liveEvidence: RuntimeExerciseState;
}

export interface RuntimeAdmissionReceipt {
  state: "PASS" | "FAIL" | "NOT_EXERCISED";
  detail: string;
}

export interface RuntimeExit {
  code: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: boolean;
}

export interface RuntimeOutputReceipt {
  stdoutBytes: number;
  stderrBytes: number;
}

export interface RuntimeArtifactRef {
  kind: string;
  sha256: string;
  bytes: number;
  mediaType: string;
}

export interface RuntimeCleanupReceipt {
  state: "PASS" | "FAIL" | "NOT_EXERCISED";
  durationMs: number;
  processesChecked: boolean;
  workspaceChecked: boolean;
  sessionsChecked: boolean;
  residue: string[];
  detail: string;
}

export interface RuntimeReceipt {
  schema: typeof RUNTIME_RECEIPT_SCHEMA;
  requestId: string;
  requestDigest: string;
  provider: Pick<RuntimeProviderDescriptor, "id" | "version" | "scope"> & { capabilities: string[] };
  source: RuntimeSourceRef;
  workspaceIdentity: string | null;
  lifecycle: RuntimeLifecycleState[];
  admission: RuntimeAdmissionReceipt;
  taskOutcome: RuntimeOutcomeState;
  outcome: RuntimeOutcomeState;
  state: EvidenceState;
  exit: RuntimeExit;
  output: RuntimeOutputReceipt;
  artifacts: RuntimeArtifactRef[];
  touchedPaths: string[];
  cleanup: RuntimeCleanupReceipt;
  exclusions: string[];
  detail: string;
}
