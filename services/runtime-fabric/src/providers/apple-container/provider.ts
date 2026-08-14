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
  AppleContainerHandle,
  AppleContainerMaterializationHandle,
  AppleContainerProviderInput,
  AppleContainerTransport,
  AppleContainerWorkflowSpec,
} from "./types.ts";

export const APPLE_CONTAINER_PROVIDER_ID = "apple-container-local" as const;
export const APPLE_CONTAINER_WORKLOAD_ID = "agent-shield.apple-container.workflow" as const;

export interface AppleContainerProviderConfig {
  containerVersion: string;
  binarySha256: string;
  environment: RuntimeEnvironmentSubject;
  availability: RuntimeProviderDescriptor["availability"];
  workflows: readonly AppleContainerWorkflowSpec[];
}

function safeId(value: string, name: string): void {
  if (!/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(value)) throw new Error(`${name} is invalid`);
}

function safeVersion(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(value)) throw new Error("Apple Container version is invalid");
}

function validateImage(reference: string, digest: string, name: string): void {
  if (
    reference.length === 0 ||
    reference.length > 512 ||
    /\s|\p{Cc}/u.test(reference) ||
    !/^sha256:[a-f0-9]{64}$/.test(digest) ||
    !reference.endsWith(`@${digest}`) ||
    !/^[a-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/i.test(reference)
  ) {
    throw new Error(`${name} must be an immutable OCI image reference`);
  }
}

function normalizeWorkflows(values: readonly AppleContainerWorkflowSpec[]): Map<string, AppleContainerWorkflowSpec> {
  if (values.length === 0 || values.length > 128) throw new Error("Apple Container workflow catalog is empty or unbounded");
  const result = new Map<string, AppleContainerWorkflowSpec>();
  for (const value of values) {
    safeId(value.id, "Apple Container workflow ID");
    if (result.has(value.id)) throw new Error(`duplicate Apple Container workflow: ${value.id}`);
    validateImage(value.image.reference, value.image.digest, `Apple Container workflow ${value.id} image`);
    if (value.argv.length === 0 || value.argv.length > 64) throw new Error(`Apple Container workflow argv is invalid: ${value.id}`);
    const argv = value.argv.map((entry, index) => {
      if (entry.length === 0 || entry.length > 1024 || /\p{Cc}/u.test(entry)) {
        throw new Error(`Apple Container workflow ${value.id} argv[${index}] is invalid`);
      }
      return entry;
    });
    const allowedExitCodes = [...value.allowedExitCodes].sort((left, right) => left - right);
    if (
      allowedExitCodes.length === 0 ||
      new Set(allowedExitCodes).size !== allowedExitCodes.length ||
      allowedExitCodes.some((entry) => !Number.isSafeInteger(entry) || entry < 0 || entry > 255)
    ) {
      throw new Error(`Apple Container workflow exit codes are invalid: ${value.id}`);
    }
    if (!Number.isSafeInteger(value.maxLogBytes) || value.maxLogBytes < 1 || value.maxLogBytes > 1_073_741_824) {
      throw new Error(`Apple Container workflow log bound is invalid: ${value.id}`);
    }
    if (value.network !== "deny-all") throw new Error(`Apple Container workflow network policy is unsupported: ${value.id}`);
    result.set(value.id, Object.freeze({
      id: value.id,
      image: Object.freeze({ ...value.image }),
      argv: Object.freeze(argv),
      allowedExitCodes: Object.freeze(allowedExitCodes),
      maxLogBytes: value.maxLogBytes,
      network: "deny-all" as const,
    }));
  }
  return result;
}

function parseInput(request: RuntimeRequest): AppleContainerProviderInput {
  if (request.workload.id !== APPLE_CONTAINER_WORKLOAD_ID) throw new Error("unsupported Apple Container workload ID");
  const input = request.workload.input as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.workflowId !== "string") {
    throw new Error("Apple Container workload input must contain only workflowId");
  }
  safeId(input.workflowId, "Apple Container workflowId");
  return { workflowId: input.workflowId };
}

function containerName(request: RuntimeRequest): string {
  return `as-${runtimeRequestDigest(request).slice(0, 24)}`;
}

function workspaceIdentity(request: RuntimeRequest, handle: AppleContainerHandle): string {
  const digest = createHash("sha256")
    .update(
      `${APPLE_CONTAINER_PROVIDER_ID}\u0000${request.providerSubject.sha256}\u0000${request.environmentSubject.sha256}\u0000${handle.id}`,
    )
    .digest("hex");
  return `apple-container:sha256:${digest}`;
}

function materializationHandle(value: unknown): AppleContainerMaterializationHandle {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Apple Container handle is invalid");
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== 3 ||
    typeof candidate.name !== "string" ||
    typeof candidate.id !== "string" ||
    typeof candidate.workflowId !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(candidate.name) ||
    !/^[a-z0-9][a-z0-9._:-]{0,255}$/.test(candidate.id)
  ) {
    throw new Error("Apple Container handle is not portable");
  }
  safeId(candidate.workflowId, "Apple Container handle workflowId");
  return { name: candidate.name, id: candidate.id, workflowId: candidate.workflowId };
}

function transportHandle(value: AppleContainerMaterializationHandle): AppleContainerHandle {
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
    residue: ["apple-container-residue"],
    detail,
  };
}

export class AppleContainerRuntimeProvider implements RuntimeProviderSpi {
  readonly descriptor: RuntimeProviderDescriptor;
  readonly #transport: AppleContainerTransport;
  readonly #workflows: Map<string, AppleContainerWorkflowSpec>;

  constructor(config: AppleContainerProviderConfig, transport: AppleContainerTransport) {
    safeVersion(config.containerVersion);
    if (!/^[a-f0-9]{64}$/.test(config.binarySha256)) throw new Error("Apple Container binary SHA-256 is invalid");
    this.#workflows = normalizeWorkflows(config.workflows);
    this.#transport = transport;
    this.descriptor = Object.freeze({
      id: APPLE_CONTAINER_PROVIDER_ID,
      version: config.containerVersion,
      subject: Object.freeze({
        kind: "binary" as const,
        id: APPLE_CONTAINER_PROVIDER_ID,
        version: config.containerVersion,
        sha256: config.binarySha256,
      }),
      environment: Object.freeze({ ...config.environment }),
      scope: "local" as const,
      capabilities: Object.freeze([
        "container.ephemeral",
        "container.log-artifact",
        "container.cleanup",
      ]) as unknown as string[],
      credentialBoundary: "none" as const,
      implementation: "IMPLEMENTED" as const,
      availability: config.availability,
      liveEvidence: "NOT_EXERCISED" as const,
    });
  }

  async admit(request: RuntimeRequest, context: RuntimeOperationContext): Promise<RuntimeAdmissionResult> {
    let input: AppleContainerProviderInput;
    try {
      input = parseInput(request);
    } catch {
      return { state: "FAIL", detail: "Apple Container workload input is not admitted" };
    }
    const workflow = this.#workflows.get(input.workflowId);
    if (!workflow) return { state: "FAIL", detail: "Apple Container workflow is not registered" };
    if (request.network.mode !== "deny-all" || request.network.allowlist.length !== 0) {
      return { state: "REFUSED_POLICY", detail: "Apple Container v1 workflow requires deny-all workload networking" };
    }
    if (request.secrets.length !== 0) {
      return { state: "REFUSED_POLICY", detail: "Apple Container v1 workflow does not admit secret references" };
    }
    if (request.mutation.writableRoots.length !== 0) {
      return { state: "REFUSED_POLICY", detail: "Apple Container v1 workflow does not admit host writable roots" };
    }
    const log = request.artifacts.find((artifact) => artifact.kind === "container-log");
    if (
      request.artifacts.length !== 1 ||
      !log ||
      !log.required ||
      !log.mediaTypes.includes("text/plain") ||
      log.maxBytes > workflow.maxLogBytes
    ) {
      return { state: "FAIL", detail: "Apple Container provider requires one bounded container-log artifact" };
    }
    const probe = await this.#transport.probe(context);
    if (probe.state === "ABSENT") return { state: "FAIL", detail: "Apple Container executable or service is absent" };
    if (probe.state === "REFUSED_POLICY" || probe.version !== this.descriptor.version) {
      return { state: "REFUSED_POLICY", detail: "Apple Container executable does not match the admitted version" };
    }
    return { state: "PASS", detail: "fixed Apple Container workflow and exact executable version admitted" };
  }

  async materialize(request: RuntimeRequest, context: RuntimeOperationContext): Promise<RuntimeMaterialization> {
    const input = parseInput(request);
    const workflow = this.#workflows.get(input.workflowId);
    if (!workflow) throw new Error("Apple Container workflow disappeared after admission");
    const name = containerName(request);
    const created = await this.#transport.create({
      name,
      image: workflow.image,
      argv: workflow.argv,
      source: request.source,
      network: workflow.network,
    }, context);
    if (created.name !== name) throw new Error("Apple Container transport changed the deterministic name");
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
    if (!workflow) throw new Error("Apple Container workflow disappeared during execution");
    const handle = transportHandle(value);
    await this.#transport.start(handle, context);
    const exit = await this.#transport.wait(handle, context);
    const passed = workflow.allowedExitCodes.includes(exit.code);
    return {
      state: passed ? "PASS" : "FAIL",
      exit: { code: exit.code, signal: exit.signal, timedOut: false, cancelled: false },
      stdoutBytes: 0,
      stderrBytes: 0,
      detail: passed ? "Apple Container workflow reached an admitted exit code" : "Apple Container workflow returned a denied exit code",
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
    const contract = request.artifacts.find((artifact) => artifact.kind === "container-log");
    if (!workflow || !contract) return { state: "FAIL", artifacts: [], touchedPaths: [], detail: "Apple Container log contract disappeared" };
    const log = await this.#transport.logs(transportHandle(value), Math.min(contract.maxBytes, workflow.maxLogBytes), context);
    if (log.byteLength > contract.maxBytes || log.byteLength > request.limits.maxArtifactBytes) {
      return { state: "FAIL", artifacts: [], touchedPaths: [], detail: "Apple Container log exceeds the admitted artifact bound" };
    }
    return {
      state: "PASS",
      artifacts: [{
        kind: "container-log",
        sha256: createHash("sha256").update(log).digest("hex"),
        bytes: log.byteLength,
        mediaType: "text/plain",
      }],
      touchedPaths: [],
      detail: "Apple Container log collected as content-addressed metadata",
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
      if (await this.#transport.exists(value.name, context)) {
        await this.#transport.stop(handle, context);
        await this.#transport.delete(handle, context);
      }
      if (await this.#transport.exists(value.name, context)) return cleanupFail("Apple Container remained after cleanup");
      return cleanupPass("Apple Container absence verified after cleanup");
    } catch {
      return cleanupFail("Apple Container cleanup could not verify deletion");
    }
  }

  async cleanupFailedMaterialization(
    request: RuntimeRequest,
    _taskOutcome: Extract<RuntimeOutcomeState, "FAILED_MATERIALIZATION" | "CANCELLED" | "TIMED_OUT">,
    context: RuntimeOperationContext,
  ): Promise<RuntimeCleanupReceipt> {
    const name = containerName(request);
    try {
      if (await this.#transport.exists(name, context)) await this.#transport.removeByName(name, context);
      if (await this.#transport.exists(name, context)) return cleanupFail("partial Apple Container remained after recovery cleanup");
      return cleanupPass("partial Apple Container absence verified after recovery cleanup");
    } catch {
      return cleanupFail("Apple Container materialization recovery cleanup failed");
    }
  }
}
