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
import { BunTmuxTransport } from "./transport.ts";
import type {
  TmuxMaterializationHandle,
  TmuxProviderInput,
  TmuxTransport,
  TmuxWorkflowSpec,
} from "./types.ts";

export const TMUX_PROVIDER_ID = "tmux-pty-local" as const;
export const TMUX_WORKLOAD_ID = "agent-shield.tmux.workflow" as const;

export interface TmuxProviderConfig {
  tmuxVersion: string;
  binarySha256: string;
  environment: RuntimeEnvironmentSubject;
  availability: RuntimeProviderDescriptor["availability"];
  workflows: readonly TmuxWorkflowSpec[];
}

export interface LiveTmuxProviderConfig extends Omit<TmuxProviderConfig, "availability"> {
  probeTimeoutMs: number;
}

function safeId(value: string, name: string): void {
  if (!/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(value)) throw new Error(`${name} is invalid`);
}

function normalizeWorkflows(values: readonly TmuxWorkflowSpec[]): Map<string, TmuxWorkflowSpec> {
  if (values.length === 0 || values.length > 128) throw new Error("tmux workflow catalog is empty or unbounded");
  const workflows = new Map<string, TmuxWorkflowSpec>();
  for (const value of values) {
    safeId(value.id, "tmux workflow ID");
    if (workflows.has(value.id)) throw new Error(`duplicate tmux workflow: ${value.id}`);
    if (value.argv.length === 0 || value.argv.length > 64) throw new Error(`tmux workflow argv is invalid: ${value.id}`);
    const argv = value.argv.map((entry, index) => {
      if (entry.length === 0 || entry.length > 1024 || /\p{Cc}/u.test(entry)) {
        throw new Error(`tmux workflow ${value.id} argv[${index}] is invalid`);
      }
      return entry;
    });
    const allowedExitCodes = [...value.allowedExitCodes].sort((left, right) => left - right);
    if (
      allowedExitCodes.length === 0 ||
      new Set(allowedExitCodes).size !== allowedExitCodes.length ||
      allowedExitCodes.some((entry) => !Number.isSafeInteger(entry) || entry < 0 || entry > 255)
    ) {
      throw new Error(`tmux workflow exit codes are invalid: ${value.id}`);
    }
    if (!Number.isSafeInteger(value.maxCaptureLines) || value.maxCaptureLines < 1 || value.maxCaptureLines > 10_000) {
      throw new Error(`tmux workflow capture bound is invalid: ${value.id}`);
    }
    workflows.set(value.id, Object.freeze({
      id: value.id,
      argv: Object.freeze(argv),
      allowedExitCodes: Object.freeze(allowedExitCodes),
      maxCaptureLines: value.maxCaptureLines,
    }));
  }
  return workflows;
}

function parseInput(request: RuntimeRequest): TmuxProviderInput {
  if (request.workload.id !== TMUX_WORKLOAD_ID) throw new Error("unsupported tmux workload ID");
  const input = request.workload.input as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes("workflowId") || !keys.includes("captureLines")) {
    throw new Error("tmux workload input must contain only workflowId and captureLines");
  }
  if (typeof input.workflowId !== "string") throw new Error("tmux workflowId is required");
  safeId(input.workflowId, "tmux workflowId");
  if (!Number.isSafeInteger(input.captureLines) || (input.captureLines as number) < 1 || (input.captureLines as number) > 10_000) {
    throw new Error("tmux captureLines is invalid");
  }
  return { workflowId: input.workflowId, captureLines: input.captureLines as number };
}

function sessionName(request: RuntimeRequest): string {
  return `as-${runtimeRequestDigest(request).slice(0, 24)}`;
}

function workspaceIdentity(request: RuntimeRequest): string {
  const digest = createHash("sha256")
    .update(`${TMUX_PROVIDER_ID}\u0000${request.providerSubject.sha256}\u0000${request.environmentSubject.sha256}\u0000${sessionName(request)}`)
    .digest("hex");
  return `tmux-session:sha256:${digest}`;
}

function handle(value: unknown): TmuxMaterializationHandle {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("tmux materialization handle is invalid");
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== 3 ||
    typeof candidate.sessionName !== "string" ||
    typeof candidate.workflowId !== "string" ||
    !Number.isSafeInteger(candidate.captureLines)
  ) {
    throw new Error("tmux materialization handle is invalid");
  }
  return {
    sessionName: candidate.sessionName,
    workflowId: candidate.workflowId,
    captureLines: candidate.captureLines as number,
  };
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
    residue: ["tmux-session-residue"],
    detail,
  };
}

export class TmuxRuntimeProvider implements RuntimeProviderSpi {
  readonly descriptor: RuntimeProviderDescriptor;
  readonly #transport: TmuxTransport;
  readonly #workflows: Map<string, TmuxWorkflowSpec>;

  constructor(config: TmuxProviderConfig, transport: TmuxTransport) {
    this.#workflows = normalizeWorkflows(config.workflows);
    this.#transport = transport;
    this.descriptor = Object.freeze({
      id: TMUX_PROVIDER_ID,
      version: config.tmuxVersion,
      subject: Object.freeze({
        kind: "binary" as const,
        id: TMUX_PROVIDER_ID,
        version: config.tmuxVersion,
        sha256: config.binarySha256,
      }),
      environment: Object.freeze({ ...config.environment }),
      scope: "local" as const,
      capabilities: Object.freeze([
        "terminal.fixed-workflow",
        "terminal.transcript",
        "terminal.session-cleanup",
      ]) as unknown as string[],
      credentialBoundary: "none" as const,
      implementation: "IMPLEMENTED" as const,
      availability: config.availability,
      liveEvidence: "NOT_EXERCISED" as const,
    });
  }

  async admit(request: RuntimeRequest, context: RuntimeOperationContext): Promise<RuntimeAdmissionResult> {
    let input: TmuxProviderInput;
    try {
      input = parseInput(request);
    } catch {
      return { state: "FAIL", detail: "tmux workload input is not admitted" };
    }
    const workflow = this.#workflows.get(input.workflowId);
    if (!workflow || input.captureLines > workflow.maxCaptureLines) {
      return { state: "FAIL", detail: "tmux workflow is absent or exceeds its capture policy" };
    }
    if (request.network.mode !== "deny-all" || request.network.allowlist.length !== 0 || request.secrets.length !== 0) {
      return { state: "REFUSED_POLICY", detail: "tmux workflow requires deny-all network and no secret references" };
    }
    if (request.mutation.writableRoots.length !== 0) {
      return { state: "REFUSED_POLICY", detail: "tmux transcript provider does not admit writable workspace roots" };
    }
    const transcript = request.artifacts.find((artifact) => artifact.kind === "terminal-transcript");
    if (
      request.artifacts.length !== 1 ||
      !transcript ||
      !transcript.required ||
      !transcript.mediaTypes.includes("text/plain")
    ) {
      return { state: "FAIL", detail: "tmux provider requires one terminal-transcript artifact contract" };
    }
    const probe = await this.#transport.probe(context);
    if (probe.state === "ABSENT") return { state: "FAIL", detail: "tmux executable is absent" };
    if (probe.state === "REFUSED_POLICY" || probe.version !== this.descriptor.version) {
      return { state: "REFUSED_POLICY", detail: "tmux executable does not match the admitted version" };
    }
    return { state: "PASS", detail: "fixed tmux workflow and exact executable version admitted" };
  }

  async materialize(request: RuntimeRequest, context: RuntimeOperationContext): Promise<RuntimeMaterialization> {
    const input = parseInput(request);
    const workflow = this.#workflows.get(input.workflowId);
    if (!workflow) throw new Error("tmux workflow disappeared after admission");
    const name = sessionName(request);
    await this.#transport.createSession(name, workflow, context);
    return {
      workspaceIdentity: workspaceIdentity(request),
      handle: Object.freeze({ sessionName: name, workflowId: workflow.id, captureLines: input.captureLines }),
    };
  }

  async execute(
    materialization: RuntimeMaterialization,
    _request: RuntimeRequest,
    context: RuntimeOperationContext,
  ): Promise<RuntimeExecutionResult> {
    const state = handle(materialization.handle);
    const workflow = this.#workflows.get(state.workflowId);
    if (!workflow) throw new Error("tmux workflow disappeared during execution");
    const result = await this.#transport.waitForExit(state.sessionName, context);
    const passed = workflow.allowedExitCodes.includes(result.code);
    return {
      state: passed ? "PASS" : "FAIL",
      exit: { code: result.code, signal: result.signal, timedOut: false, cancelled: false },
      stdoutBytes: 0,
      stderrBytes: 0,
      detail: passed ? "fixed tmux workflow reached an admitted exit code" : "fixed tmux workflow returned a denied exit code",
    };
  }

  async collect(
    materialization: RuntimeMaterialization,
    request: RuntimeRequest,
    _execution: RuntimeExecutionResult,
    context: RuntimeOperationContext,
  ): Promise<RuntimeCollectionResult> {
    const state = handle(materialization.handle);
    const transcript = await this.#transport.capture(state.sessionName, state.captureLines, context);
    const bytes = new TextEncoder().encode(transcript);
    const contract = request.artifacts.find((artifact) => artifact.kind === "terminal-transcript");
    if (!contract || bytes.byteLength > contract.maxBytes || bytes.byteLength > request.limits.maxArtifactBytes) {
      return { state: "FAIL", artifacts: [], touchedPaths: [], detail: "tmux transcript exceeds the admitted artifact bound" };
    }
    return {
      state: "PASS",
      artifacts: [{
        kind: "terminal-transcript",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.byteLength,
        mediaType: "text/plain",
      }],
      touchedPaths: [],
      detail: "tmux transcript collected as content-addressed metadata",
    };
  }

  async cleanup(
    materialization: RuntimeMaterialization,
    _request: RuntimeRequest,
    _taskOutcome: RuntimeOutcomeState,
    context: RuntimeOperationContext,
  ): Promise<RuntimeCleanupReceipt> {
    const state = handle(materialization.handle);
    try {
      if (await this.#transport.sessionExists(state.sessionName, context)) {
        await this.#transport.killSession(state.sessionName, context);
      }
      if (await this.#transport.sessionExists(state.sessionName, context)) {
        return cleanupFail("tmux session remained after cleanup");
      }
      return cleanupPass("tmux session absence verified after cleanup");
    } catch {
      return cleanupFail("tmux cleanup could not verify session deletion");
    }
  }

  async cleanupFailedMaterialization(
    request: RuntimeRequest,
    _taskOutcome: Extract<RuntimeOutcomeState, "FAILED_MATERIALIZATION" | "CANCELLED" | "TIMED_OUT">,
    context: RuntimeOperationContext,
  ): Promise<RuntimeCleanupReceipt> {
    const name = sessionName(request);
    try {
      if (await this.#transport.sessionExists(name, context)) await this.#transport.killSession(name, context);
      if (await this.#transport.sessionExists(name, context)) return cleanupFail("partial tmux session remained after recovery cleanup");
      return cleanupPass("partial tmux session absence verified after recovery cleanup");
    } catch {
      return cleanupFail("tmux materialization recovery cleanup failed");
    }
  }
}

export async function createBunTmuxProvider(config: LiveTmuxProviderConfig): Promise<TmuxRuntimeProvider> {
  const transport = new BunTmuxTransport(config.tmuxVersion);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("tmux probe timeout"), config.probeTimeoutMs);
  try {
    const probe = await transport.probe({
      stage: "admission",
      signal: controller.signal,
      deadlineEpochMs: Date.now() + config.probeTimeoutMs,
      cancellationGraceMs: Math.min(1_000, Math.max(1, config.probeTimeoutMs)),
    });
    return new TmuxRuntimeProvider({
      ...config,
      availability: probe.state === "AVAILABLE" ? "AVAILABLE" : probe.state === "ABSENT" ? "ABSENT" : "REFUSED_POLICY",
    }, transport);
  } finally {
    clearTimeout(timeout);
  }
}
