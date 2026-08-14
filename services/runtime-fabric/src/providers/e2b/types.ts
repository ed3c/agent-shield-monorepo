import type {
  RuntimeOperationContext,
} from "../../spi/index.ts";
import type {
  RuntimeSourceRef,
} from "../../../../../packages/contracts/src/runtime/index.ts";

export interface E2bWorkflowSpec {
  id: string;
  templateId: string;
  templateVersion: string;
  templateSha256: string;
  allowedExitCodes: readonly number[];
  workloadNetwork: "deny-all" | "allowlist";
  allowedHosts: readonly string[];
  writableRoots: readonly string[];
  artifactKind: string;
  artifactMediaTypes: readonly string[];
  maxArtifactBytes: number;
}

export interface E2bProbeResult {
  state: "AVAILABLE" | "ABSENT" | "REFUSED_POLICY";
  adapterVersion: string | null;
  detail: string;
}

export interface E2bSandboxCreateSpec {
  name: string;
  workflowId: string;
  templateId: string;
  templateVersion: string;
  templateSha256: string;
  source: RuntimeSourceRef;
  credentialRef: string;
  workloadNetwork: "deny-all" | "allowlist";
  allowedHosts: readonly string[];
}

export interface E2bSandboxHandle {
  name: string;
  id: string;
}

export interface E2bWorkflowExit {
  code: number;
  signal: string | null;
}

export interface E2bArtifactPayload {
  bytes: Uint8Array;
  mediaType: string;
  touchedPaths: string[];
}

export interface E2bTransport {
  probe(context: RuntimeOperationContext): Promise<E2bProbeResult>;
  createSandbox(spec: E2bSandboxCreateSpec, context: RuntimeOperationContext): Promise<E2bSandboxHandle>;
  runWorkflow(handle: E2bSandboxHandle, workflow: E2bWorkflowSpec, context: RuntimeOperationContext): Promise<E2bWorkflowExit>;
  collectArtifact(
    handle: E2bSandboxHandle,
    workflow: E2bWorkflowSpec,
    maxBytes: number,
    context: RuntimeOperationContext,
  ): Promise<E2bArtifactPayload>;
  killSandbox(handle: E2bSandboxHandle, context: RuntimeOperationContext): Promise<void>;
  sandboxExists(name: string, context: RuntimeOperationContext): Promise<boolean>;
  killByName(name: string, context: RuntimeOperationContext): Promise<void>;
}

export interface E2bProviderInput {
  workflowId: string;
}

export interface E2bMaterializationHandle {
  name: string;
  id: string;
  workflowId: string;
}
