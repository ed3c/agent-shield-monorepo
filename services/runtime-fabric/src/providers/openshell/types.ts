import type { EvidenceState } from "../../../../../packages/contracts/src/index.ts";
import type { RuntimeRequest } from "../../../../../packages/contracts/src/runtime/index.ts";

export const OPENSHELL_POLICY_REQUEST_SCHEMA = "agent-shield/openshell-policy-request/v1" as const;
export const OPENSHELL_POLICY_ENVELOPE_SCHEMA = "agent-shield/openshell-policy-envelope/v1" as const;

export type OpenShellPolicyState =
  | "UNRESOLVED"
  | "POLICY_RESOLVED"
  | "POLICY_VERIFIED"
  | "AUTHORIZED"
  | "COMPILED"
  | "COMPLETED"
  | "ABSENT_POLICY"
  | "STALE_EPOCH"
  | "REFUSED_TASK"
  | "REFUSED_NETWORK"
  | "REFUSED_FILESYSTEM"
  | "FAILED_POLICY_SCHEMA";

export type OpenShellPolicyOutcome = Extract<OpenShellPolicyState,
  "COMPLETED" | "ABSENT_POLICY" | "STALE_EPOCH" | "REFUSED_TASK" |
  "REFUSED_NETWORK" | "REFUSED_FILESYSTEM" | "FAILED_POLICY_SCHEMA">;

export interface OpenShellSubjectRef { id: string; sha256: string }

export interface OpenShellUpstreamSubject {
  repository: "https://github.com/NVIDIA/OpenShell";
  commit: string;
  license: "Apache-2.0";
  policySchemaVersion: 1;
  channel: "source-commit" | "dev-prerelease";
  artifactAdmission: "NOT_EXERCISED";
}

export interface OpenShellPolicyEpoch {
  previous: number;
  current: number;
}

export interface OpenShellPreviousPolicy {
  epoch: number;
  staticDigest: string;
  dynamicDigest: string;
}

export interface OpenShellFilesystemPolicy {
  includeWorkdir: boolean;
  readOnly: string[];
  readWrite: string[];
  landlockCompatibility: "best_effort" | "required";
}

export interface OpenShellNetworkEndpoint {
  host: string;
  port: number;
  protocol: "rest";
  enforcement: "enforce";
  access: "read-only" | "read-write";
}

export interface OpenShellNetworkPolicy {
  id: string;
  name: string;
  endpoints: OpenShellNetworkEndpoint[];
  binaries: string[];
}

export interface OpenShellCredentialBinding {
  name: string;
  brokerRef: string;
}

export interface OpenShellPolicyRequest {
  schema: typeof OPENSHELL_POLICY_REQUEST_SCHEMA;
  requestId: string;
  runtimeRequest: RuntimeRequest;
  upstream: OpenShellUpstreamSubject;
  policyEpoch: OpenShellPolicyEpoch;
  previous: OpenShellPreviousPolicy | null;
  workspaceRoot: string;
  filesystem: OpenShellFilesystemPolicy;
  processProfile: OpenShellSubjectRef;
  networkPolicies: OpenShellNetworkPolicy[];
  inferenceProfile: OpenShellSubjectRef | null;
  credentialBindings: OpenShellCredentialBinding[];
  exclusions: string[];
}

export interface OpenShellPolicyDocumentEndpoint {
  host: string;
  port: number;
  protocol: "rest";
  enforcement: "enforce";
  access: "read-only" | "read-write";
}

export interface OpenShellPolicyDocumentNetworkRule {
  name: string;
  endpoints: OpenShellPolicyDocumentEndpoint[];
  binaries: { path: string }[];
}

export interface OpenShellPolicyDocument {
  version: 1;
  filesystem_policy: {
    include_workdir: boolean;
    read_only: string[];
    read_write: string[];
  };
  landlock: { compatibility: "best_effort" | "required" };
  network_policies: Record<string, OpenShellPolicyDocumentNetworkRule>;
}

export type OpenShellReloadMode = "CREATE_REQUIRED" | "HOT_RELOAD_DYNAMIC" | "NO_CHANGE";

export interface OpenShellPolicyEnvelope {
  schema: typeof OPENSHELL_POLICY_ENVELOPE_SCHEMA;
  requestId: string;
  runtimeRequestDigest: string;
  upstream: OpenShellUpstreamSubject;
  policyEpoch: number;
  lifecycle: OpenShellPolicyState[];
  outcome: OpenShellPolicyOutcome;
  state: EvidenceState;
  externalRuntimeState: "NOT_EXERCISED";
  reloadMode: OpenShellReloadMode | null;
  staticDigest: string | null;
  dynamicDigest: string | null;
  task: { id: string; version: string };
  processProfile: OpenShellSubjectRef;
  inferenceProfile: OpenShellSubjectRef | null;
  credentialBindings: OpenShellCredentialBinding[];
  document: OpenShellPolicyDocument | null;
  exclusions: string[];
  detail: string;
}
