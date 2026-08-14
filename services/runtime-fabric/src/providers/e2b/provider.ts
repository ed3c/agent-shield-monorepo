import { createHash } from "node:crypto";
import type {
  RuntimeCleanupReceipt,
  RuntimeEnvironmentSubject,
  RuntimeOutcomeState,
  RuntimeProviderDescriptor,
  RuntimeRequest,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import {
  runtimeRequestDigest,
  type RuntimeAdmissionResult,
  type RuntimeCollectionResult,
  type RuntimeExecutionResult,
  type RuntimeMaterialization,
  type RuntimeOperationContext,
  type RuntimeProviderSpi,
} from "../../spi/index.ts";
import type {
  E2bMaterializationHandle,
  E2bProviderInput,
  E2bSandboxHandle,
  E2bTransport,
  E2bWorkflowSpec,
} from "./types.ts";

export const E2B_PROVIDER_ID = "e2b-firecracker-cloud" as const;
export const E2B_WORKLOAD_ID = "agent-shield.e2b.workflow" as const;
export const E2B_CREDENTIAL_NAME = "E2B_CREDENTIAL_REF" as const;

export interface E2bProviderConfig {
  adapterVersion: string;
  adapterSha256: string;
  environment: RuntimeEnvironmentSubject;
  availability: RuntimeProviderDescriptor["availability"];
  workflows: readonly E2bWorkflowSpec[];
}

function safeId(value: string, name: string): void {
  if (!/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(value)) throw new Error(`${name} is invalid`);
}

function safeVersion(value: string, name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(value)) throw new Error(`${name} is invalid`);
}

function normalizedPath(value: string, name: string): void {
  if (
    value.length === 0 ||
    value.length > 255 ||
    value.startsWith("/") ||
    value.startsWith("~") ||
    /^[A-Za-z]:/.test(value) ||
    value.includes("\\")
  ) {
    throw new Error(`${name} must be workspace-relative`);
  }
  const segments = value.split("/");
  if (segments.some((entry) => entry.length === 0 || entry === "." || entry === ".." || /\p{Cc}/u.test(entry))) {
    throw new Error(`${name} is not normalized`);
  }
}

function safeHost(value: string, name: string): void {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::(?:[1-9][0-9]{0,4}))?$/.test(value)) {
    throw new Error(`${name} is invalid`);
  }
}

function normalizeWorkflows(values: readonly E2bWorkflowSpec[]): Map<string, E2bWorkflowSpec> {
  if (values.length === 0 || values.length > 128) throw new Error("E2B workflow catalog is empty or unbounded");
  const result = new Map<string, E2bWorkflowSpec>();
  for (const value of values) {
    safeId(value.id, "E2B workflow ID");
    if (result.has(value.id)) throw new Error(`duplicate E2B workflow: ${value.id}`);
    safeId(value.templateId, `E2B workflow ${value.id} template ID`);
    safeVersion(value.templateVersion, `E2B workflow ${value.id} template version`);
    if (!/^[a-f0-9]{64}$/.test(value.templateSha256)) throw new Error(`E2B workflow ${value.id} template digest is invalid`);
    const allowedExitCodes = [...value.allowedExitCodes].sort((left, right) => left - right);
    if (
      allowedExitCodes.length === 0 ||
      new Set(allowedExitCodes).size !== allowedExitCodes.length ||
      allowedExitCodes.some((entry) => !Number.isSafeInteger(entry) || entry < 0 || entry > 255)
    ) {
      throw new Error(`E2B workflow ${value.id} exit codes are invalid`);
    }
    const allowedHosts = [...value.allowedHosts].sort();
    if (new Set(allowedHosts).size !== allowedHosts.length) throw new Error(`E2B workflow ${value.id} hosts contain duplicates`);
    for (const [index, host] of allowedHosts.entries()) safeHost(host, `E2B workflow ${value.id} allowedHosts[${index}]`);
    if (value.workloadNetwork === "deny-all" && allowedHosts.length > 0) {
      throw new Error(`E2B workflow ${value.id} deny-all network contains hosts`);
    }
    if (value.workloadNetwork === "allowlist" && allowedHosts.length === 0) {
      throw new Error(`E2B workflow ${value.id} allowlist network is empty`);
    }
    const writableRoots = [...value.writableRoots].sort();
    if (new Set(writableRoots).size !== writableRoots.length) throw new Error(`E2B workflow ${value.id} writable roots contain duplicates`);
    for (const [index, root] of writableRoots.entries()) normalizedPath(root, `E2B workflow ${value.id} writableRoots[${index}]`);
    safeId(value.artifactKind, `E2B workflow ${value.id} artifact kind`);
    const mediaTypes = [...value.artifactMediaTypes].sort();
    if (
      mediaTypes.length === 0 ||
      new Set(mediaTypes).size !== mediaTypes.length ||
      mediaTypes.some((entry) => !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(entry))
    ) {
      throw new Error(`E2B workflow ${value.id} artifact media types are invalid`);
    }
    if (!Number.isSafeInteger(value.maxArtifactBytes) || value.maxArtifactBytes < 1 || value.maxArtifactBytes > 1_073_741_824) {
      throw new Error(`E2B workflow ${value.id} artifact bound is invalid`);
    }
    result.set(value.id, Object.freeze({
      id: value.id,
      templateId: value.templateId,
      templateVersion: value.templateVersion,
      templateSha256: value.templateSha256,
      allowedExitCodes: Object.freeze(allowedExitCodes),
      workloadNetwork: value.workloadNetwork,
      allowedHosts: Object.freeze(allowedHosts),
      writableRoots: Object.freeze(writableRoots),
      artifactKind: value.artifactKind,
      artifactMediaTypes: Object.freeze(mediaTypes),
      maxArtifactBytes: value.maxArtifactBytes,
    }));
  }
  return result;
}

function parseInput(request: RuntimeRequest): E2bProviderInput {
  if (request.workload.id !== E2B_WORKLOAD_ID) throw new Error("unsupported E2B workload ID");
  const input = request.workload.input as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.workflowId !== "string") {
    throw new Error("E2B workload input must contain only workflowId");
  }
  safeId(input.workflowId, "E2B workflowId");
  return { workflowId: input.workflowId };
}

function credentialRef(request: RuntimeRequest): string {
  if (request.secrets.length !== 1) throw new Error("E2B requires exactly one broker credential reference");
  const credential = request.secrets[0];
  if (
    credential.name !== E2B_CREDENTIAL_NAME ||
    credential.class !== "broker-only" ||
    credential.delivery !== "opaque-handle"
  ) {
    throw new Error("E2B credential reference has the wrong class or delivery mode");
  }
  return credential.brokerRef;
}

function sandboxName(request: RuntimeRequest): string {
  return `as-${runtimeRequestDigest(request).slice(0, 24)}`;
}

function workspaceIdentity(request: RuntimeRequest, handle: E2bSandboxHandle): string {
  const digest = createHash("sha256")
    .update(`${E2B_PROVIDER_ID}\u0000${request.providerSubject.sha256}\u0000${request.environmentSubject.sha256}\u0000${handle.id}`)
    .digest("hex");
  return `e2b-sandbox:sha256:${digest}`;
}

function materializationHandle(value: unknown): E2bMaterializationHandle {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("E2B handle is invalid");
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== 3 ||
    typeof candidate.name !== "string" ||
    typeof candidate.id !== "string" ||
    typeof candidate.workflowId !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(candidate.name) ||
    !/^[a-z0-9][a-z0-9._:-]{0,255}$/.test(candidate.id)
  ) {
    throw new Error("E2B handle is not portable");
  }
  safeId(candidate.workflowId, "E2B handle workflowId");
  return { name: candidate.name, id: candidate.id, workflowId: candidate.workflowId };
}

function transportHandle(value: E2bMaterializationHandle): E2bSandboxHandle {
  return { name: value.name, id: value.id };
}

function cleanupPass(detail: string): RuntimeCleanupReceipt {
  return {
    state: "PASS",
    durationMs: 1,
    processesChecked: true,
    workspaceChecked: true,
    sessionsChecked: true,
    workspaceDisposition: "DELETED",
    preservationRef: null,
    residue: [],
    detail,
  };
}

function cleanupFail(detail: string): RuntimeCleanupReceipt {
  return {
    state: "FAIL",
    durationMs: 1,
    processesChecked: true,
    workspaceChecked: false,
    sessionsChecked: false,
    workspaceDisposition: "UNKNOWN",
    preservationRef: null,
    residue: ["e2b-sandbox-residue"],
    detail,
  };
}

export class E2bRuntimeProvider implements RuntimeProviderSpi {
  readonly descriptor: RuntimeProviderDescriptor;
  readonly #transport: E2bTransport;
  readonly #workflows: Map<string, E2bWorkflowSpec>;

  constructor(config: E2bProviderConfig, transport: E2bTransport) {
    safeVersion(config.adapterVersion, "E2B adapter version");
    if (!/^[a-f0-9]{64}$/.test(config.adapterSha256)) throw new Error("E2B adapter SHA-256 is invalid");
    if (config.environment.kind !== "template") throw new Error("E2B environment subject must be a template");
    this.#workflows = normalizeWorkflows(config.workflows);
    for (const workflow of this.#workflows.values()) {
      if (
        workflow.templateId !== config.environment.id ||
        workflow.templateVersion !== config.environment.version ||
        workflow.templateSha256 !== config.environment.sha256
      ) {
        throw new Error(`E2B workflow ${workflow.id} template does not match provider environment subject`);
      }
    }
    this.#transport = transport;
    this.descriptor = Object.freeze({
      id: E2B_PROVIDER_ID,
      version: config.adapterVersion,
      subject: Object.freeze({
        kind: "source" as const,
        id: E2B_PROVIDER_ID,
        version: config.adapterVersion,
        sha256: config.adapterSha256,
      }),
      environment: Object.freeze({ ...config.environment }),
      scope: "cloud" as const,
      capabilities: Object.freeze([
        "sandbox.ephemeral",
        "sandbox.artifact-return",
        "sandbox.cleanup",
      ]) as unknown as string[],
      credentialBoundary: "broker-only" as const,
      implementation: "IMPLEMENTED" as const,
      availability: config.availability,
      liveEvidence: "NOT_EXERCISED" as const,
    });
  }

  async admit(request: RuntimeRequest, context: RuntimeOperationContext): Promise<RuntimeAdmissionResult> {
    let input: E2bProviderInput;
    let brokerRef: string;
    try {
      input = parseInput(request);
      brokerRef = credentialRef(request);
    } catch {
      return { state: "FAIL", detail: "E2B workload or broker credential reference is not admitted" };
    }
    const workflow = this.#workflows.get(input.workflowId);
    if (!workflow) return { state: "FAIL", detail: "E2B workflow is not registered" };
    if (
      request.network.mode !== workflow.workloadNetwork ||
      request.network.allowlist.join("\u0000") !== [...workflow.allowedHosts].sort().join("\u0000")
    ) {
      return { state: "REFUSED_POLICY", detail: "E2B workload network policy differs from the fixed workflow" };
    }
    if (request.mutation.writableRoots.join("\u0000") !== [...workflow.writableRoots].sort().join("\u0000")) {
      return { state: "REFUSED_POLICY", detail: "E2B writable roots differ from the fixed workflow" };
    }
    const artifact = request.artifacts.find((entry) => entry.kind === workflow.artifactKind);
    if (
      request.artifacts.length !== 1 ||
      !artifact ||
      !artifact.required ||
      artifact.maxBytes > workflow.maxArtifactBytes ||
      artifact.mediaTypes.some((entry) => !workflow.artifactMediaTypes.includes(entry))
    ) {
      return { state: "FAIL", detail: "E2B artifact contract differs from the fixed workflow" };
    }
    if (brokerRef.length === 0) return { state: "FAIL", detail: "E2B broker reference is empty" };
    const probe = await this.#transport.probe(context);
    if (probe.state === "ABSENT") return { state: "FAIL", detail: "E2B transport or host broker is absent" };
    if (probe.state === "REFUSED_POLICY" || probe.adapterVersion !== this.descriptor.version) {
      return { state: "REFUSED_POLICY", detail: "E2B adapter transport does not match the admitted version" };
    }
    return { state: "PASS", detail: "fixed E2B workflow, template, network, and broker reference admitted" };
  }

  async materialize(request: RuntimeRequest, context: RuntimeOperationContext): Promise<RuntimeMaterialization> {
    const input = parseInput(request);
    const workflow = this.#workflows.get(input.workflowId);
    if (!workflow) throw new Error("E2B workflow disappeared after admission");
    const name = sandboxName(request);
    const created = await this.#transport.createSandbox({
      name,
      workflowId: workflow.id,
      templateId: workflow.templateId,
      templateVersion: workflow.templateVersion,
      templateSha256: workflow.templateSha256,
      source: request.source,
      credentialRef: credentialRef(request),
      workloadNetwork: workflow.workloadNetwork,
      allowedHosts: workflow.allowedHosts,
    }, context);
    if (created.name !== name) throw new Error("E2B transport changed the deterministic sandbox name");
    return {
      workspaceIdentity: workspaceIdentity(request, created),
      handle: Object.freeze({ name: created.name, id: created.id, workflowId: workflow.id }),
    };
  }

  async execute(
    materialization: RuntimeMaterialization,
    _request: RuntimeRequest,
    context: RuntimeOperationContext,
  ): Promise<RuntimeExecutionResult> {
    const value = materializationHandle(materialization.handle);
    const workflow = this.#workflows.get(value.workflowId);
    if (!workflow) throw new Error("E2B workflow disappeared during execution");
    const exit = await this.#transport.runWorkflow(transportHandle(value), workflow, context);
    const passed = workflow.allowedExitCodes.includes(exit.code);
    return {
      state: passed ? "PASS" : "FAIL",
      exit: { code: exit.code, signal: exit.signal, timedOut: false, cancelled: false },
      stdoutBytes: 0,
      stderrBytes: 0,
      detail: passed ? "E2B workflow reached an admitted exit code" : "E2B workflow returned a denied exit code",
    };
  }

  async collect(
    materialization: RuntimeMaterialization,
    request: RuntimeRequest,
    _execution: RuntimeExecutionResult,
    context: RuntimeOperationContext,
  ): Promise<RuntimeCollectionResult> {
    const value = materializationHandle(materialization.handle);
    const workflow = this.#workflows.get(value.workflowId);
    const contract = workflow ? request.artifacts.find((entry) => entry.kind === workflow.artifactKind) : null;
    if (!workflow || !contract) return { state: "FAIL", artifacts: [], touchedPaths: [], detail: "E2B artifact contract disappeared" };
    const payload = await this.#transport.collectArtifact(
      transportHandle(value),
      workflow,
      Math.min(contract.maxBytes, workflow.maxArtifactBytes),
      context,
    );
    if (
      payload.bytes.byteLength > contract.maxBytes ||
      payload.bytes.byteLength > request.limits.maxArtifactBytes ||
      !contract.mediaTypes.includes(payload.mediaType)
    ) {
      return { state: "FAIL", artifacts: [], touchedPaths: [], detail: "E2B artifact exceeds the admitted contract" };
    }
    const touchedPaths = [...payload.touchedPaths].sort();
    return {
      state: "PASS",
      artifacts: [{
        kind: workflow.artifactKind,
        sha256: createHash("sha256").update(payload.bytes).digest("hex"),
        bytes: payload.bytes.byteLength,
        mediaType: payload.mediaType,
      }],
      touchedPaths,
      detail: "E2B artifact collected as content-addressed metadata",
    };
  }

  async cleanup(
    materialization: RuntimeMaterialization,
    _request: RuntimeRequest,
    _taskOutcome: RuntimeOutcomeState,
    context: RuntimeOperationContext,
  ): Promise<RuntimeCleanupReceipt> {
    const value = materializationHandle(materialization.handle);
    const handle = transportHandle(value);
    try {
      if (await this.#transport.sandboxExists(value.name, context)) await this.#transport.killSandbox(handle, context);
      if (await this.#transport.sandboxExists(value.name, context)) return cleanupFail("E2B sandbox remained after cleanup");
      return cleanupPass("E2B sandbox absence verified after cleanup");
    } catch {
      return cleanupFail("E2B cleanup could not verify sandbox deletion");
    }
  }

  async cleanupFailedMaterialization(
    request: RuntimeRequest,
    _taskOutcome: Extract<RuntimeOutcomeState, "FAILED_MATERIALIZATION" | "CANCELLED" | "TIMED_OUT">,
    context: RuntimeOperationContext,
  ): Promise<RuntimeCleanupReceipt> {
    const name = sandboxName(request);
    try {
      if (await this.#transport.sandboxExists(name, context)) await this.#transport.killByName(name, context);
      if (await this.#transport.sandboxExists(name, context)) return cleanupFail("partial E2B sandbox remained after recovery cleanup");
      return cleanupPass("partial E2B sandbox absence verified after recovery cleanup");
    } catch {
      return cleanupFail("E2B materialization recovery cleanup failed");
    }
  }
}
