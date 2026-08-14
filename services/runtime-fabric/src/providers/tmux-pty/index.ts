import { createHash } from "node:crypto";
import type {
  JsonObject,
  RuntimeArtifactRef,
  RuntimeCleanupReceipt,
  RuntimeProviderDescriptor,
  RuntimeReceipt,
  RuntimeRequest,
  RuntimeSourceRef,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import {
  assertRuntimeReceiptMatchesRequest,
  type RuntimeAdmissionResult,
  type RuntimeCollectionResult,
  type RuntimeExecutionResult,
  type RuntimeMaterialization,
  type RuntimeProviderSpi,
} from "../../spi/index.ts";

export const TMUX_PTY_PROVIDER_ID = "tmux-pty-local" as const;
export const TMUX_PTY_ADAPTER_VERSION = "0.1.0" as const;
export const TMUX_PTY_ADMISSION_SCHEMA = "agent-shield/tmux-pty-admission/v1" as const;
export const TMUX_PTY_PLAN_SCHEMA = "agent-shield/tmux-pty-session-plan/v1" as const;

export const TMUX_PTY_CAPABILITIES = [
  "artifact-return",
  "pty",
  "session-reconnect",
  "terminal-transcript",
] as const;

const RESERVED_ARTIFACT_KINDS = ["tmux-pty-admission", "tmux-pty-session-plan"] as const;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const SAFE_INPUT_KEY = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
const FORBIDDEN_INPUT_KEYS = new Set([
  "args",
  "arguments",
  "argv",
  "cmd",
  "command",
  "cwd",
  "env",
  "environment",
  "executable",
  "hostpath",
  "pid",
  "privateflags",
  "program",
  "script",
  "shell",
  "socket",
  "socketpath",
  "tty",
  "ttypath",
  "workdir",
  "workingdirectory",
]);

export type TmuxPtyCapability = (typeof TMUX_PTY_CAPABILITIES)[number];

export interface TmuxPtyToolAdmission {
  schema: typeof TMUX_PTY_ADMISSION_SCHEMA;
  repository: "https://github.com/tmux/tmux";
  commit: string;
  tree: string;
  version: string;
  binarySha256: string;
  licenseSha256: string;
  ptyHarnessSha256: string;
  platform: "darwin" | "linux";
  architecture: "arm64" | "amd64";
  state: "PASS" | "FAIL" | "NOT_EXERCISED";
  detail: string;
}

export interface TmuxTerminalProfile {
  profileId: string;
  profileVersion: string;
  profileSha256: string;
  columns: number;
  rows: number;
  terminalType: "xterm-256color";
  reconnect: boolean;
  maxTranscriptBytes: number;
}

export interface TmuxPtyWorkloadDefinition {
  id: string;
  version: string;
  profile: TmuxTerminalProfile;
  entrypointId: string;
  allowedInputKeys: string[];
  requiredCapabilities: TmuxPtyCapability[];
}

export interface TmuxPtySessionPlan {
  schema: typeof TMUX_PTY_PLAN_SCHEMA;
  requestId: string;
  providerId: typeof TMUX_PTY_PROVIDER_ID;
  adapterVersion: typeof TMUX_PTY_ADAPTER_VERSION;
  toolAdmissionDigest: string;
  source: RuntimeSourceRef;
  logicalSessionId: string;
  profile: TmuxTerminalProfile;
  workload: {
    id: string;
    version: string;
    entrypointId: string;
    input: JsonObject;
  };
  mutation: RuntimeRequest["mutation"];
  artifactKinds: string[];
  exclusions: string[];
}

export interface TmuxPtyBackendMaterialization extends RuntimeMaterialization {
  handle: unknown;
}

export interface TmuxPtyBackend {
  materialize(plan: Readonly<TmuxPtySessionPlan>, request: Readonly<RuntimeRequest>): Promise<TmuxPtyBackendMaterialization>;
  execute(
    materialization: TmuxPtyBackendMaterialization,
    plan: Readonly<TmuxPtySessionPlan>,
    request: Readonly<RuntimeRequest>,
  ): Promise<RuntimeExecutionResult>;
  collect(
    materialization: TmuxPtyBackendMaterialization,
    plan: Readonly<TmuxPtySessionPlan>,
    request: Readonly<RuntimeRequest>,
    execution: RuntimeExecutionResult,
  ): Promise<RuntimeCollectionResult>;
  cleanup(
    materialization: TmuxPtyBackendMaterialization,
    plan: Readonly<TmuxPtySessionPlan>,
    request: Readonly<RuntimeRequest>,
  ): Promise<RuntimeCleanupReceipt>;
  // The backend owns every session effect, so it also owns recovery when materialization
  // never returned a handle. The provider must not report an unverified absence itself.
  cleanupFailedMaterialization(
    plan: Readonly<TmuxPtySessionPlan>,
    request: Readonly<RuntimeRequest>,
  ): Promise<RuntimeCleanupReceipt>;
}

export interface TmuxPtyProviderOptions {
  admission: TmuxPtyToolAdmission;
  workload: TmuxPtyWorkloadDefinition;
  backend: TmuxPtyBackend;
  liveEvidence?: "PASS" | "FAIL" | "NOT_EXERCISED";
}

function fail(message: string): never {
  throw new Error(`invalid tmux-PTY provider contract: ${message}`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${name} must not inherit properties`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  const expected = new Set(keys);
  for (const key of Object.keys(value)) if (!expected.has(key)) fail(`${name}.${key} is not allowed`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${name}.${key} is required`);
}

function text(value: unknown, name: string, pattern?: RegExp, maximum = 1024): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || /\p{Cc}/u.test(value)) {
    fail(`${name} must be a printable bounded string`);
  }
  if (pattern && !pattern.test(value)) fail(`${name} has an invalid format`);
  return value;
}

function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") fail(`${name} must be boolean`);
  return value;
}

function enumValue<T extends string>(value: unknown, name: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail(`${name} is invalid`);
  return value as T;
}

function sortedUnique(
  value: unknown,
  name: string,
  maximum: number,
  validate: (entry: string, index: number) => void,
): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${name} must contain at most ${maximum} entries`);
  const result = value.map((entry, index) => {
    const normalized = text(entry, `${name}[${index}]`, undefined, 128);
    validate(normalized, index);
    return normalized;
  });
  if (new Set(result).size !== result.length) fail(`${name} contains duplicates`);
  return result.sort();
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  const valueRecord = value as Record<string, unknown>;
  return `{${Object.keys(valueRecord).sort().map((key) => `${JSON.stringify(key)}:${canonical(valueRecord[key])}`).join(",")}}`;
}

function artifact(kind: string, value: unknown): RuntimeArtifactRef {
  const bytes = new TextEncoder().encode(canonical(value));
  return { kind, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength, mediaType: "application/json" };
}

export function validateTmuxPtyAdmission(value: unknown): TmuxPtyToolAdmission {
  const admission = record(value, "admission");
  exactKeys(
    admission,
    ["schema", "repository", "commit", "tree", "version", "binarySha256", "licenseSha256", "ptyHarnessSha256", "platform", "architecture", "state", "detail"],
    "admission",
  );
  if (admission.schema !== TMUX_PTY_ADMISSION_SCHEMA) fail("admission.schema is unsupported");
  if (admission.repository !== "https://github.com/tmux/tmux") fail("admission.repository must be the official tmux source identity");
  return {
    schema: TMUX_PTY_ADMISSION_SCHEMA,
    repository: "https://github.com/tmux/tmux",
    commit: text(admission.commit, "admission.commit", GIT_OID, 40),
    tree: text(admission.tree, "admission.tree", GIT_OID, 40),
    version: text(admission.version, "admission.version", SAFE_VERSION, 64),
    binarySha256: text(admission.binarySha256, "admission.binarySha256", SHA256, 64),
    licenseSha256: text(admission.licenseSha256, "admission.licenseSha256", SHA256, 64),
    ptyHarnessSha256: text(admission.ptyHarnessSha256, "admission.ptyHarnessSha256", SHA256, 64),
    platform: enumValue(admission.platform, "admission.platform", ["darwin", "linux"] as const),
    architecture: enumValue(admission.architecture, "admission.architecture", ["arm64", "amd64"] as const),
    state: enumValue(admission.state, "admission.state", ["PASS", "FAIL", "NOT_EXERCISED"] as const),
    detail: text(admission.detail, "admission.detail", undefined, 512),
  };
}

function validateProfile(value: unknown): TmuxTerminalProfile {
  const profile = record(value, "workload.profile");
  exactKeys(
    profile,
    ["profileId", "profileVersion", "profileSha256", "columns", "rows", "terminalType", "reconnect", "maxTranscriptBytes"],
    "workload.profile",
  );
  return {
    profileId: text(profile.profileId, "workload.profile.profileId", SAFE_ID, 128),
    profileVersion: text(profile.profileVersion, "workload.profile.profileVersion", SAFE_VERSION, 64),
    profileSha256: text(profile.profileSha256, "workload.profile.profileSha256", SHA256, 64),
    columns: integer(profile.columns, "workload.profile.columns", 20, 500),
    rows: integer(profile.rows, "workload.profile.rows", 5, 500),
    terminalType: enumValue(profile.terminalType, "workload.profile.terminalType", ["xterm-256color"] as const),
    reconnect: bool(profile.reconnect, "workload.profile.reconnect"),
    maxTranscriptBytes: integer(profile.maxTranscriptBytes, "workload.profile.maxTranscriptBytes", 1, 16_777_216),
  };
}

export function validateTmuxPtyWorkload(value: unknown): TmuxPtyWorkloadDefinition {
  const workload = record(value, "workloadDefinition");
  exactKeys(workload, ["id", "version", "profile", "entrypointId", "allowedInputKeys", "requiredCapabilities"], "workloadDefinition");
  const allowedInputKeys = sortedUnique(workload.allowedInputKeys, "workloadDefinition.allowedInputKeys", 64, (entry, index) => {
    if (!SAFE_INPUT_KEY.test(entry)) fail(`workloadDefinition.allowedInputKeys[${index}] is invalid`);
    if (FORBIDDEN_INPUT_KEYS.has(entry.toLowerCase())) fail(`workloadDefinition.allowedInputKeys[${index}] exposes a host/shell control`);
  });
  const requiredCapabilities = sortedUnique(
    workload.requiredCapabilities,
    "workloadDefinition.requiredCapabilities",
    TMUX_PTY_CAPABILITIES.length,
    (entry, index) => {
      if (!TMUX_PTY_CAPABILITIES.includes(entry as TmuxPtyCapability)) fail(`workloadDefinition.requiredCapabilities[${index}] is unsupported`);
    },
  ) as TmuxPtyCapability[];
  if (!requiredCapabilities.includes("pty") || !requiredCapabilities.includes("terminal-transcript")) {
    fail("workloadDefinition must require pty and terminal-transcript");
  }
  return {
    id: text(workload.id, "workloadDefinition.id", SAFE_ID, 128),
    version: text(workload.version, "workloadDefinition.version", SAFE_VERSION, 64),
    profile: validateProfile(workload.profile),
    entrypointId: text(workload.entrypointId, "workloadDefinition.entrypointId", SAFE_ID, 128),
    allowedInputKeys,
    requiredCapabilities,
  };
}

function requireArtifact(request: RuntimeRequest, value: RuntimeArtifactRef): void {
  const contract = request.artifacts.find((candidate) => candidate.kind === value.kind);
  if (!contract || !contract.required) fail(`request must require ${value.kind}`);
  if (!contract.mediaTypes.includes(value.mediaType)) fail(`${value.kind} media type is not admitted`);
  if (value.bytes > contract.maxBytes) fail(`${value.kind} exceeds its declared byte limit`);
}

export function buildTmuxPtyPlan(
  request: Readonly<RuntimeRequest>,
  admissionValue: unknown,
  workloadValue: unknown,
): { plan: TmuxPtySessionPlan; admissionArtifact: RuntimeArtifactRef; planArtifact: RuntimeArtifactRef } {
  const admission = validateTmuxPtyAdmission(admissionValue);
  const workload = validateTmuxPtyWorkload(workloadValue);
  if (request.providerId !== TMUX_PTY_PROVIDER_ID) fail("request.providerId is not tmux-pty-local");
  if (request.scope !== "local") fail("tmux-PTY provider supports only local scope");
  if (admission.state !== "PASS") fail("exact tmux-PTY subject admission is not PASS");
  if (request.secrets.length > 0 || request.environment.allowedVariables.length > 0) fail("tmux-PTY adapter v0.1.0 accepts no secrets or environment delivery");
  if (request.network.mode !== "deny-all") fail("tmux-PTY adapter v0.1.0 requires deny-all network policy");
  if (request.workload.id !== workload.id || request.workload.version !== workload.version) fail("request workload does not match definition");
  for (const capability of workload.requiredCapabilities) if (!request.requiredCapabilities.includes(capability)) fail(`request is missing capability: ${capability}`);
  const input = record(request.workload.input, "request.workload.input");
  for (const key of Object.keys(input)) if (!workload.allowedInputKeys.includes(key)) fail(`request.workload.input.${key} is not admitted`);
  const transcriptContract = request.artifacts.find((entry) => entry.kind === "terminal-transcript");
  if (!transcriptContract || !transcriptContract.required || transcriptContract.maxBytes > workload.profile.maxTranscriptBytes) {
    fail("request must require a bounded terminal-transcript artifact");
  }

  const admissionArtifact = artifact("tmux-pty-admission", admission);
  const plan: TmuxPtySessionPlan = {
    schema: TMUX_PTY_PLAN_SCHEMA,
    requestId: request.requestId,
    providerId: TMUX_PTY_PROVIDER_ID,
    adapterVersion: TMUX_PTY_ADAPTER_VERSION,
    toolAdmissionDigest: admissionArtifact.sha256,
    source: request.source,
    logicalSessionId: `tmux-session:sha256:${createHash("sha256").update(request.requestId).digest("hex")}`,
    profile: workload.profile,
    workload: { id: workload.id, version: workload.version, entrypointId: workload.entrypointId, input: request.workload.input },
    mutation: request.mutation,
    artifactKinds: request.artifacts.map((entry) => entry.kind).sort(),
    exclusions: [...request.exclusions],
  };
  const planArtifact = artifact("tmux-pty-session-plan", plan);
  requireArtifact(request as RuntimeRequest, admissionArtifact);
  requireArtifact(request as RuntimeRequest, planArtifact);
  return { plan, admissionArtifact, planArtifact };
}

function backendMaterialization(value: RuntimeMaterialization): TmuxPtyBackendMaterialization {
  return value as TmuxPtyBackendMaterialization;
}

export class TmuxPtyProvider implements RuntimeProviderSpi {
  readonly descriptor: RuntimeProviderDescriptor;
  readonly #admission: TmuxPtyToolAdmission;
  readonly #workload: TmuxPtyWorkloadDefinition;
  readonly #backend: TmuxPtyBackend;

  constructor(options: TmuxPtyProviderOptions) {
    this.#admission = deepFreeze(validateTmuxPtyAdmission(options.admission));
    this.#workload = deepFreeze(validateTmuxPtyWorkload(options.workload));
    this.#backend = options.backend;
    const availability = this.#admission.state === "PASS" ? "AVAILABLE" : this.#admission.state === "FAIL" ? "REFUSED_POLICY" : "ABSENT";
    this.descriptor = deepFreeze({
      id: TMUX_PTY_PROVIDER_ID,
      version: TMUX_PTY_ADAPTER_VERSION,
      // The descriptor subject must bind the descriptor's own id/version, so it names the
      // adapter leaf and its PTY harness digest. The exact tmux binary stays pinned through
      // the admission artifact that assertTmuxPtyReceipt verifies.
      subject: {
        kind: "artifact",
        id: TMUX_PTY_PROVIDER_ID,
        version: TMUX_PTY_ADAPTER_VERSION,
        sha256: this.#admission.ptyHarnessSha256,
      },
      environment: {
        kind: "profile",
        id: this.#workload.profile.profileId,
        version: this.#workload.profile.profileVersion,
        sha256: this.#workload.profile.profileSha256,
      },
      scope: "local",
      capabilities: [...TMUX_PTY_CAPABILITIES],
      credentialBoundary: "none",
      implementation: "IMPLEMENTED",
      availability,
      liveEvidence: availability === "AVAILABLE" ? options.liveEvidence ?? "NOT_EXERCISED" : "NOT_EXERCISED",
    });
  }

  #plan(request: Readonly<RuntimeRequest>): Readonly<TmuxPtySessionPlan> {
    return deepFreeze(buildTmuxPtyPlan(request, this.#admission, this.#workload).plan);
  }

  async admit(request: RuntimeRequest): Promise<RuntimeAdmissionResult> {
    try {
      this.#plan(request);
      return { state: "PASS", detail: "exact tmux, PTY harness, terminal profile, workload, transcript, and cleanup subjects admitted" };
    } catch {
      return { state: this.#admission.state === "FAIL" ? "REFUSED_POLICY" : "FAIL", detail: "tmux-PTY request or exact subject failed admission" };
    }
  }

  async materialize(request: RuntimeRequest): Promise<RuntimeMaterialization> {
    return this.#backend.materialize(this.#plan(request), request);
  }
  async execute(materialization: RuntimeMaterialization, request: RuntimeRequest): Promise<RuntimeExecutionResult> {
    return this.#backend.execute(backendMaterialization(materialization), this.#plan(request), request);
  }
  async collect(materialization: RuntimeMaterialization, request: RuntimeRequest, execution: RuntimeExecutionResult): Promise<RuntimeCollectionResult> {
    const generated = buildTmuxPtyPlan(request, this.#admission, this.#workload);
    const backend = await this.#backend.collect(backendMaterialization(materialization), deepFreeze(generated.plan), request, execution);
    const kinds = new Set(backend.artifacts.map((entry) => entry.kind));
    for (const reserved of RESERVED_ARTIFACT_KINDS) if (kinds.has(reserved)) throw new Error(`backend attempted to replace ${reserved}`);
    return { state: backend.state, artifacts: [generated.admissionArtifact, generated.planArtifact, ...backend.artifacts], touchedPaths: [...backend.touchedPaths], detail: backend.detail };
  }
  async cleanup(materialization: RuntimeMaterialization, request: RuntimeRequest): Promise<RuntimeCleanupReceipt> {
    return this.#backend.cleanup(backendMaterialization(materialization), this.#plan(request), request);
  }
  async cleanupFailedMaterialization(request: RuntimeRequest): Promise<RuntimeCleanupReceipt> {
    return this.#backend.cleanupFailedMaterialization(this.#plan(request), request);
  }
}

function sameArtifact(left: RuntimeArtifactRef, right: RuntimeArtifactRef): boolean {
  return left.kind === right.kind && left.sha256 === right.sha256 && left.bytes === right.bytes && left.mediaType === right.mediaType;
}
function oneArtifact(receipt: RuntimeReceipt, kind: string): RuntimeArtifactRef {
  const matches = receipt.artifacts.filter((entry) => entry.kind === kind);
  if (matches.length !== 1) throw new Error(`tmux-PTY receipt must contain exactly one ${kind}`);
  return matches[0];
}

export function assertTmuxPtyReceipt(
  receipt: RuntimeReceipt,
  request: RuntimeRequest,
  admission: TmuxPtyToolAdmission,
  workload: TmuxPtyWorkloadDefinition,
): void {
  assertRuntimeReceiptMatchesRequest(receipt, request);
  if (receipt.provider.id !== TMUX_PTY_PROVIDER_ID || receipt.provider.version !== TMUX_PTY_ADAPTER_VERSION) throw new Error("tmux-PTY provider identity mismatch");
  if ([...receipt.provider.capabilities].sort().join("\u0000") !== [...TMUX_PTY_CAPABILITIES].sort().join("\u0000")) throw new Error("tmux-PTY capability set mismatch");
  if (receipt.taskOutcome !== "COMPLETED" || receipt.outcome !== "COMPLETED") throw new Error("exact tmux-PTY assertion requires completed receipt");
  const expected = buildTmuxPtyPlan(request, admission, workload);
  if (!sameArtifact(oneArtifact(receipt, "tmux-pty-admission"), expected.admissionArtifact)) throw new Error("tmux-PTY admission artifact mismatch");
  if (!sameArtifact(oneArtifact(receipt, "tmux-pty-session-plan"), expected.planArtifact)) throw new Error("tmux-PTY session plan artifact mismatch");
}
