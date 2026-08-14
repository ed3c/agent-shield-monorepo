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
  OpenShellMaterializationHandle,
  OpenShellPolicyDecision,
  OpenShellPolicySubject,
  OpenShellProviderInput,
  OpenShellSessionHandle,
  OpenShellTransport,
  OpenShellWorkflowSpec,
} from "./types.ts";

export const OPENSHELL_PROVIDER_ID = "openshell-policy-local" as const;
export const OPENSHELL_WORKLOAD_ID = "agent-shield.openshell.workflow" as const;

export interface OpenShellProviderConfig {
  adapterVersion: string;
  adapterSha256: string;
  environment: RuntimeEnvironmentSubject;
  availability: RuntimeProviderDescriptor["availability"];
  workflows: readonly OpenShellWorkflowSpec[];
}

function safeId(value: string, name: string): void {
  if (!/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(value)) throw new Error(`${name} is invalid`);
}

function safeVersion(value: string, name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(value)) throw new Error(`${name} is invalid`);
}

function safeHost(value: string, name: string): void {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::(?:[1-9][0-9]{0,4}))?$/.test(value)) {
    throw new Error(`${name} is invalid`);
  }
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

function normalizePolicy(value: OpenShellPolicySubject, name: string): OpenShellPolicySubject {
  safeId(value.id, `${name}.id`);
  safeVersion(value.version, `${name}.version`);
  if (!/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error(`${name}.sha256 is invalid`);
  return Object.freeze({ ...value });
}

function samePolicy(left: OpenShellPolicySubject, right: OpenShellPolicySubject): boolean {
  return left.id === right.id && left.version === right.version && left.sha256 === right.sha256;
}

function normalizeWorkflows(values: readonly OpenShellWorkflowSpec[]): Map<string, OpenShellWorkflowSpec> {
  if (values.length === 0 || values.length > 128) throw new Error("OpenShell workflow catalog is empty or unbounded");
  const result = new Map<string, OpenShellWorkflowSpec>();
  for (const value of values) {
    safeId(value.id, "OpenShell workflow ID");
    safeId(value.executableId, `OpenShell workflow ${value.id} executable ID`);
    if (result.has(value.id)) throw new Error(`duplicate OpenShell workflow: ${value.id}`);
    if (value.argv.length === 0 || value.argv.length > 64) throw new Error(`OpenShell workflow argv is invalid: ${value.id}`);
    const argv = value.argv.map((entry, index) => {
      if (entry.length === 0 || entry.length > 1024 || /\p{Cc}/u.test(entry)) {
        throw new Error(`OpenShell workflow ${value.id} argv[${index}] is invalid`);
      }
      return entry;
    });
    const policy = normalizePolicy(value.policy, `OpenShell workflow ${value.id} policy`);
    const allowedExitCodes = [...value.allowedExitCodes].sort((left, right) => left - right);
    if (
      allowedExitCodes.length === 0 ||
      new Set(allowedExitCodes).size !== allowedExitCodes.length ||
      allowedExitCodes.some((entry) => !Number.isSafeInteger(entry) || entry < 0 || entry > 255)
    ) {
      throw new Error(`OpenShell workflow ${value.id} exit codes are invalid`);
    }
    const allowedHosts = [...value.allowedHosts].sort();
    if (new Set(allowedHosts).size !== allowedHosts.length) throw new Error(`OpenShell workflow ${value.id} hosts contain duplicates`);
    for (const [index, host] of allowedHosts.entries()) safeHost(host, `OpenShell workflow ${value.id} allowedHosts[${index}]`);
    if (value.network === "deny-all" && allowedHosts.length > 0) throw new Error(`OpenShell workflow ${value.id} deny-all network contains hosts`);
    if (value.network === "allowlist" && allowedHosts.length === 0) throw new Error(`OpenShell workflow ${value.id} allowlist network is empty`);
    const writableRoots = [...value.writableRoots].sort();
    if (new Set(writableRoots).size !== writableRoots.length) throw new Error(`OpenShell workflow ${value.id} roots contain duplicates`);
    for (const [index, root] of writableRoots.entries()) normalizedPath(root, `OpenShell workflow ${value.id} writableRoots[${index}]`);
    if (!Number.isSafeInteger(value.auditMaxBytes) || value.auditMaxBytes < 1 || value.auditMaxBytes > 1_073_741_824) {
      throw new Error(`OpenShell workflow ${value.id} audit bound is invalid`);
    }
    result.set(value.id, Object.freeze({
      id: value.id,
      executableId: value.executableId,
      argv: Object.freeze(argv),
      policy,
      allowedExitCodes: Object.freeze(allowedExitCodes),
      network: value.network,
      allowedHosts: Object.freeze(allowedHosts),
      writableRoots: Object.freeze(writableRoots),
      auditMaxBytes: value.auditMaxBytes,
    }));
  }
  return result;
}

function parseInput(request: RuntimeRequest): OpenShellProviderInput {
  if (request.workload.id !== OPENSHELL_WORKLOAD_ID) throw new Error("unsupported OpenShell workload ID");
  const input = request.workload.input as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.workflowId !== "string") {
    throw new Error("OpenShell workload input must contain only workflowId");
  }
  safeId(input.workflowId, "OpenShell workflowId");
  return { workflowId: input.workflowId };
}

function sessionName(request: RuntimeRequest): string {
  return `as-${runtimeRequestDigest(request).slice(0, 24)}`;
}

function workspaceIdentity(request: RuntimeRequest, handle: OpenShellSessionHandle): string {
  const digest = createHash("sha256")
    .update(`${OPENSHELL_PROVIDER_ID}\u0000${request.providerSubject.sha256}\u0000${request.environmentSubject.sha256}\u0000${handle.id}`)
    .digest("hex");
  return `openshell-session:sha256:${digest}`;
}

function materializationHandle(value: unknown): OpenShellMaterializationHandle {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("OpenShell handle is invalid");
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== 3 ||
    typeof candidate.name !== "string" ||
    typeof candidate.id !== "string" ||
    typeof candidate.workflowId !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(candidate.name) ||
    !/^[a-z0-9][a-z0-9._:-]{0,255}$/.test(candidate.id)
  ) {
    throw new Error("OpenShell handle is not portable");
  }
  safeId(candidate.workflowId, "OpenShell handle workflowId");
  return { name: candidate.name, id: candidate.id, workflowId: candidate.workflowId };
}

function transportHandle(value: OpenShellMaterializationHandle): OpenShellSessionHandle {
  return { name: value.name, id: value.id };
}

function validateDecision(decision: OpenShellPolicyDecision, workflow: OpenShellWorkflowSpec): OpenShellPolicyDecision {
  if (!samePolicy(decision.policy, workflow.policy)) throw new Error("OpenShell policy decision subject drifted");
  if (decision.state !== "ALLOW" && decision.state !== "DENY") throw new Error("OpenShell policy decision state is invalid");
  if (decision.detail.length === 0 || decision.detail.length > 1024 || /\p{Cc}/u.test(decision.detail)) {
    throw new Error("OpenShell policy decision detail is invalid");
  }
  const reasonCodes = [...decision.reasonCodes].sort();
  if (
    new Set(reasonCodes).size !== reasonCodes.length ||
    reasonCodes.some((entry) => !/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(entry))
  ) {
    throw new Error("OpenShell policy reason codes are invalid");
  }
  return { state: decision.state, policy: { ...decision.policy }, reasonCodes, detail: decision.detail };
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
    residue: ["openshell-session-residue"],
    detail,
  };
}

export class OpenShellRuntimeProvider implements RuntimeProviderSpi {
  readonly descriptor: RuntimeProviderDescriptor;
  readonly #transport: OpenShellTransport;
  readonly #workflows: Map<string, OpenShellWorkflowSpec>;

  constructor(config: OpenShellProviderConfig, transport: OpenShellTransport) {
    safeVersion(config.adapterVersion, "OpenShell adapter version");
    if (!/^[a-f0-9]{64}$/.test(config.adapterSha256)) throw new Error("OpenShell adapter SHA-256 is invalid");
    if (config.environment.kind !== "profile") throw new Error("OpenShell environment subject must be a policy profile");
    this.#workflows = normalizeWorkflows(config.workflows);
    for (const workflow of this.#workflows.values()) {
      if (
        workflow.policy.id !== config.environment.id ||
        workflow.policy.version !== config.environment.version ||
        workflow.policy.sha256 !== config.environment.sha256
      ) {
        throw new Error(`OpenShell workflow ${workflow.id} policy does not match environment subject`);
      }
    }
    this.#transport = transport;
    this.descriptor = Object.freeze({
      id: OPENSHELL_PROVIDER_ID,
      version: config.adapterVersion,
      subject: Object.freeze({
        kind: "source" as const,
        id: OPENSHELL_PROVIDER_ID,
        version: config.adapterVersion,
        sha256: config.adapterSha256,
      }),
      environment: Object.freeze({ ...config.environment }),
      scope: "local" as const,
      capabilities: Object.freeze([
        "policy-shell.fixed-workflow",
        "policy-shell.audit",
        "policy-shell.cleanup",
      ]) as unknown as string[],
      credentialBoundary: "none" as const,
      implementation: "IMPLEMENTED" as const,
      availability: config.availability,
      liveEvidence: "NOT_EXERCISED" as const,
    });
  }

  async admit(request: RuntimeRequest, context: RuntimeOperationContext): Promise<RuntimeAdmissionResult> {
    let input: OpenShellProviderInput;
    try {
      input = parseInput(request);
    } catch {
      return { state: "FAIL", detail: "OpenShell workload input is not admitted" };
    }
    const workflow = this.#workflows.get(input.workflowId);
    if (!workflow) return { state: "FAIL", detail: "OpenShell workflow is not registered" };
    if (request.secrets.length !== 0) return { state: "REFUSED_POLICY", detail: "OpenShell v1 workflow does not admit secret references" };
    if (
      request.network.mode !== workflow.network ||
      request.network.allowlist.join("\u0000") !== [...workflow.allowedHosts].sort().join("\u0000")
    ) {
      return { state: "REFUSED_POLICY", detail: "OpenShell network policy differs from the fixed workflow" };
    }
    if (request.mutation.writableRoots.join("\u0000") !== [...workflow.writableRoots].sort().join("\u0000")) {
      return { state: "REFUSED_POLICY", detail: "OpenShell writable roots differ from the fixed workflow" };
    }
    const audit = request.artifacts.find((entry) => entry.kind === "policy-audit");
    if (
      request.artifacts.length !== 1 ||
      !audit ||
      !audit.required ||
      audit.maxBytes > workflow.auditMaxBytes ||
      !audit.mediaTypes.includes("application/json")
    ) {
      return { state: "FAIL", detail: "OpenShell provider requires one bounded policy-audit artifact" };
    }
    const probe = await this.#transport.probe(context);
    if (probe.state === "ABSENT") return { state: "FAIL", detail: "OpenShell transport is absent" };
    if (probe.state === "REFUSED_POLICY" || probe.adapterVersion !== this.descriptor.version) {
      return { state: "REFUSED_POLICY", detail: "OpenShell transport does not match the admitted adapter version" };
    }
    let decision: OpenShellPolicyDecision;
    try {
      decision = validateDecision(await this.#transport.evaluatePolicy(workflow, request.source, context), workflow);
    } catch {
      return { state: "FAIL", detail: "OpenShell policy decision is invalid" };
    }
    if (decision.state !== "ALLOW") return { state: "REFUSED_POLICY", detail: "OpenShell policy denied the fixed workflow" };
    return { state: "PASS", detail: "fixed OpenShell workflow and exact policy subject admitted" };
  }

  async materialize(request: RuntimeRequest, context: RuntimeOperationContext): Promise<RuntimeMaterialization> {
    const input = parseInput(request);
    const workflow = this.#workflows.get(input.workflowId);
    if (!workflow) throw new Error("OpenShell workflow disappeared after admission");
    const decision = validateDecision(await this.#transport.evaluatePolicy(workflow, request.source, context), workflow);
    if (decision.state !== "ALLOW") throw new Error("OpenShell policy changed before materialization");
    const name = sessionName(request);
    const created = await this.#transport.createSession({
      name,
      workflowId: workflow.id,
      executableId: workflow.executableId,
      argv: workflow.argv,
      policy: workflow.policy,
      source: request.source,
      network: workflow.network,
      allowedHosts: workflow.allowedHosts,
      writableRoots: workflow.writableRoots,
    }, context);
    if (created.name !== name) throw new Error("OpenShell transport changed the deterministic session name");
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
    if (!workflow) throw new Error("OpenShell workflow disappeared during execution");
    const exit = await this.#transport.runWorkflow(transportHandle(value), workflow, context);
    const passed = workflow.allowedExitCodes.includes(exit.code);
    return {
      state: passed ? "PASS" : "FAIL",
      exit: { code: exit.code, signal: exit.signal, timedOut: false, cancelled: false },
      stdoutBytes: 0,
      stderrBytes: 0,
      detail: passed ? "OpenShell workflow reached an admitted exit code" : "OpenShell workflow returned a denied exit code",
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
    const contract = request.artifacts.find((entry) => entry.kind === "policy-audit");
    if (!workflow || !contract) return { state: "FAIL", artifacts: [], touchedPaths: [], detail: "OpenShell audit contract disappeared" };
    const payload = await this.#transport.collectAudit(
      transportHandle(value),
      workflow,
      Math.min(contract.maxBytes, workflow.auditMaxBytes),
      context,
    );
    if (!samePolicy(payload.policy, workflow.policy)) {
      return { state: "FAIL", artifacts: [], touchedPaths: [], detail: "OpenShell audit policy subject drifted" };
    }
    if (
      payload.mediaType !== "application/json" ||
      payload.bytes.byteLength > contract.maxBytes ||
      payload.bytes.byteLength > request.limits.maxArtifactBytes
    ) {
      return { state: "FAIL", artifacts: [], touchedPaths: [], detail: "OpenShell audit exceeds the admitted contract" };
    }
    return {
      state: "PASS",
      artifacts: [{
        kind: "policy-audit",
        sha256: createHash("sha256").update(payload.bytes).digest("hex"),
        bytes: payload.bytes.byteLength,
        mediaType: "application/json",
      }],
      touchedPaths: [...payload.touchedPaths].sort(),
      detail: "OpenShell policy audit collected as content-addressed metadata",
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
      if (await this.#transport.sessionExists(value.name, context)) await this.#transport.terminateSession(handle, context);
      if (await this.#transport.sessionExists(value.name, context)) return cleanupFail("OpenShell session remained after cleanup");
      return cleanupPass("OpenShell session absence verified after cleanup");
    } catch {
      return cleanupFail("OpenShell cleanup could not verify session deletion");
    }
  }

  async cleanupFailedMaterialization(
    request: RuntimeRequest,
    _taskOutcome: Extract<RuntimeOutcomeState, "FAILED_MATERIALIZATION" | "CANCELLED" | "TIMED_OUT">,
    context: RuntimeOperationContext,
  ): Promise<RuntimeCleanupReceipt> {
    const name = sessionName(request);
    try {
      if (await this.#transport.sessionExists(name, context)) await this.#transport.terminateByName(name, context);
      if (await this.#transport.sessionExists(name, context)) return cleanupFail("partial OpenShell session remained after recovery cleanup");
      return cleanupPass("partial OpenShell session absence verified after recovery cleanup");
    } catch {
      return cleanupFail("OpenShell materialization recovery cleanup failed");
    }
  }
}
