import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";

export const RUNTIME_BINDING_SCHEMA = "agent-shield/runtime-binding/v1" as const;

export type RuntimeBindingState =
  | "UNRESOLVED"
  | "SOURCE_RELEASE_PINNED"
  | "REQUIREMENTS_PARSED"
  | "MODULES_SELECTED"
  | "PROFILE_RESOLVED"
  | "WORKLOAD_RESOLVED"
  | "POLICIES_RESOLVED"
  | "SECRET_FREE_CHECKED"
  | "PROJECTIONS_RENDERED"
  | "BINDING_LOCKED"
  | "ABSENT_SOURCE"
  | "MISSING_MODULE"
  | "PROFILE_CONFLICT"
  | "WORKLOAD_CONFLICT"
  | "POLICY_CONFLICT"
  | "SECRET_VALUE_DETECTED"
  | "HOST_PATH_DETECTED"
  | "PROJECTION_DRIFT"
  | "MUTABLE_SOURCE";

export type RuntimeBindingOutcome = Extract<RuntimeBindingState,
  | "BINDING_LOCKED"
  | "ABSENT_SOURCE"
  | "MISSING_MODULE"
  | "PROFILE_CONFLICT"
  | "WORKLOAD_CONFLICT"
  | "POLICY_CONFLICT"
  | "SECRET_VALUE_DETECTED"
  | "HOST_PATH_DETECTED"
  | "PROJECTION_DRIFT"
  | "MUTABLE_SOURCE">;

export type Carrier = "claude-code" | "codex-cli" | "native";

// INT-RUNTIME-003 and INT-RUNTIME-004. A variable declares its *name* and whether it is a
// secret. There is no value field anywhere in this family, so a binding cannot carry one even
// by accident, and a secret variable cannot carry a default because the type has no place for
// one to live.
export interface RuntimeVariable {
  name: string;
  secret: boolean;
  required: boolean;
  // Only a non-secret variable may declare a default, and the resolver enforces it.
  defaultValue: string | null;
}

export interface RuntimeProfile {
  id: string;
  version: string;
  profileSha256: string;
  variables: RuntimeVariable[];
  scope: "local" | "cloud" | "local-cloud";
}

// INT-RUNTIME-006. A workload names a checked-in entrypoint and the exact variable names it
// receives. There is no command, argv or trailing-arguments field, so a generic command
// surface cannot be expressed.
export interface RuntimeWorkload {
  id: string;
  entrypointPath: string;
  entrypointSha256: string;
  variableNames: string[];
  network: "deny-all" | "allowlist";
  allowedHosts: string[];
  mutation: "none" | "workspace";
  receiptRequired: boolean;
}

// INT-RUNTIME-008. Each carrier gets its own policy, and a policy names only its own carrier's
// config paths. Cross-carrier leakage is a conflict rather than a merge.
export interface CarrierPolicy {
  carrier: Carrier;
  configPaths: string[];
  allowedVariableNames: string[];
}

export interface RuntimeCatalog {
  release: ReleaseSubject;
  workingTreeClean: boolean;
  modules: string[];
  profiles: RuntimeProfile[];
  workloads: RuntimeWorkload[];
  policies: CarrierPolicy[];
}

export interface RuntimeRequirements {
  consumerId: string;
  modules: string[];
  profileId: string;
  workloadIds: string[];
  carriers: Carrier[];
}

export interface RuntimeProjection {
  carrier: Carrier;
  variableNames: string[];
  workloadIds: string[];
  projectionDigest: string;
}

export interface RuntimeBinding {
  schema: typeof RUNTIME_BINDING_SCHEMA;
  consumerId: string;
  source: ReleaseSubject;
  modules: string[];
  profile: RuntimeProfile;
  workloads: RuntimeWorkload[];
  policies: CarrierPolicy[];
  projections: RuntimeProjection[];
  bindingDigest: string;
}

export interface RuntimeBindingResult {
  lifecycle: RuntimeBindingState[];
  outcome: RuntimeBindingOutcome;
  binding: RuntimeBinding | null;
  detail: string;
}
