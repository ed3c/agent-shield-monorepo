import type { EvidenceState } from "../../../../../packages/contracts/src/index.ts";
import type {
  RuntimeNetworkPolicy,
  RuntimeRequest,
  RuntimeSourceRef,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import type { RuntimeOperationContext } from "../../spi/index.ts";

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

// Fixed-workflow Runtime v2 provider types. These coexist with the policy compiler
// envelope types above and do not widen the provider into caller-selected shell
// execution: the caller selects a workflow ID and nothing else.

export interface OpenShellPolicySubject {
  id: string;
  version: string;
  sha256: string;
}

export interface OpenShellWorkflowSpec {
  id: string;
  executableId: string;
  argv: readonly string[];
  policy: OpenShellPolicySubject;
  allowedExitCodes: readonly number[];
  network: RuntimeNetworkPolicy["mode"];
  allowedHosts: readonly string[];
  writableRoots: readonly string[];
  auditMaxBytes: number;
}

export interface OpenShellProviderInput {
  workflowId: string;
}

export interface OpenShellSessionHandle {
  name: string;
  id: string;
}

export interface OpenShellMaterializationHandle extends OpenShellSessionHandle {
  workflowId: string;
}

export interface OpenShellProbeResult {
  state: "AVAILABLE" | "ABSENT" | "REFUSED_POLICY";
  adapterVersion: string | null;
  detail: string;
}

export interface OpenShellPolicyDecision {
  state: "ALLOW" | "DENY";
  policy: OpenShellPolicySubject;
  reasonCodes: readonly string[];
  detail: string;
}

export interface OpenShellSessionCreateSpec {
  name: string;
  workflowId: string;
  executableId: string;
  argv: readonly string[];
  policy: OpenShellPolicySubject;
  source: RuntimeSourceRef;
  network: RuntimeNetworkPolicy["mode"];
  allowedHosts: readonly string[];
  writableRoots: readonly string[];
}

export interface OpenShellWorkflowExit {
  code: number;
  signal: string | null;
}

export interface OpenShellAuditPayload {
  bytes: Uint8Array;
  mediaType: string;
  policy: OpenShellPolicySubject;
  touchedPaths: readonly string[];
}

export interface OpenShellTransport {
  probe(context: RuntimeOperationContext): Promise<OpenShellProbeResult>;
  evaluatePolicy(
    workflow: OpenShellWorkflowSpec,
    source: RuntimeSourceRef,
    context: RuntimeOperationContext,
  ): Promise<OpenShellPolicyDecision>;
  createSession(spec: OpenShellSessionCreateSpec, context: RuntimeOperationContext): Promise<OpenShellSessionHandle>;
  runWorkflow(
    handle: OpenShellSessionHandle,
    workflow: OpenShellWorkflowSpec,
    context: RuntimeOperationContext,
  ): Promise<OpenShellWorkflowExit>;
  collectAudit(
    handle: OpenShellSessionHandle,
    workflow: OpenShellWorkflowSpec,
    maxBytes: number,
    context: RuntimeOperationContext,
  ): Promise<OpenShellAuditPayload>;
  terminateSession(handle: OpenShellSessionHandle, context: RuntimeOperationContext): Promise<void>;
  sessionExists(name: string, context: RuntimeOperationContext): Promise<boolean>;
  terminateByName(name: string, context: RuntimeOperationContext): Promise<void>;
}
