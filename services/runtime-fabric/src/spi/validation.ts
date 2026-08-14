import { createHash } from "node:crypto";
import {
  RUNTIME_RECEIPT_SCHEMA,
  runtimeEvidenceForOutcome,
  validateRuntimeProviderDescriptor,
  validateRuntimeRequest,
  type RuntimeAdmissionReceipt,
  type RuntimeArtifactRef,
  type RuntimeCleanupReceipt,
  type RuntimeExit,
  type RuntimeOutcomeState,
  type RuntimeProviderDescriptor,
  type RuntimeReceipt,
  type RuntimeRequest,
} from "../../../../packages/contracts/src/runtime/index.ts";
import { validateRuntimeLifecycleTrace } from "../state-machine/index.ts";
import type {
  RuntimeAdmissionResult,
  RuntimeCollectionResult,
  RuntimeExecutionResult,
  RuntimeMaterialization,
  RuntimeProviderSpi,
} from "./types.ts";

const OUTCOMES = new Set<RuntimeOutcomeState>([
  "COMPLETED",
  "ABSENT",
  "NOT_IMPLEMENTED",
  "NOT_EXERCISED",
  "REFUSED_POLICY",
  "FAILED_ADMISSION",
  "FAILED_MATERIALIZATION",
  "FAILED_EXECUTION",
  "FAILED_ARTIFACT",
  "FAILED_CLEANUP",
  "CANCELLED",
  "TIMED_OUT",
]);
const SAFE_LOGICAL_ID = /^[a-z0-9][a-z0-9._:/-]{0,255}$/;
const SAFE_SIGNAL = /^SIG[A-Z0-9_]{1,28}$/;

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) throw new Error(`${name}.${key} is not allowed`);
  for (const key of allowed) if (!(key in value)) throw new Error(`${name}.${key} is required`);
}

function portableDetail(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024 || /\p{Cc}/u.test(value)) {
    throw new Error(`${name} must be printable metadata no longer than 1024 characters`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, name: string, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`${name} must be an integer between 0 and ${max}`);
  }
  return value;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

function enumValue<T extends string>(value: unknown, name: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${name} is invalid`);
  return value as T;
}

export function deepFreeze<T>(value: T): T {
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
  return `{${Object.keys(valueRecord)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(valueRecord[key])}`)
    .join(",")}}`;
}

export function runtimeRequestDigest(request: RuntimeRequest): string {
  return createHash("sha256").update(canonical(request)).digest("hex");
}

export function normalizeDescriptor(value: unknown): RuntimeProviderDescriptor {
  const descriptor = validateRuntimeProviderDescriptor(value);
  descriptor.capabilities = [...descriptor.capabilities].sort();
  return deepFreeze(descriptor);
}

export function emptyExit(): RuntimeExit {
  return { code: null, signal: null, timedOut: false, cancelled: false };
}

export function unexercisedAdmission(detail: string): RuntimeAdmissionReceipt {
  return { state: "NOT_EXERCISED", detail };
}

export function unexercisedCleanup(detail: string): RuntimeCleanupReceipt {
  return {
    state: "NOT_EXERCISED",
    durationMs: 0,
    processesChecked: false,
    workspaceChecked: false,
    sessionsChecked: false,
    residue: [],
    detail,
  };
}

export function failedCleanup(detail: string): RuntimeCleanupReceipt {
  return {
    state: "FAIL",
    durationMs: 0,
    processesChecked: false,
    workspaceChecked: false,
    sessionsChecked: false,
    residue: ["cleanup-exception"],
    detail,
  };
}

export function normalizeAdmission(value: unknown): RuntimeAdmissionResult {
  const admission = record(value, "runtime admission result");
  exactKeys(admission, ["state", "detail"], "runtime admission result");
  return {
    state: enumValue(admission.state, "runtime admission result.state", ["PASS", "FAIL", "REFUSED_POLICY"] as const),
    detail: portableDetail(admission.detail, "runtime admission result.detail"),
  };
}

function validateWorkspaceIdentity(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    /[\s\\]/.test(value) ||
    value.startsWith("/") ||
    value.includes("..") ||
    value.includes("://") ||
    !SAFE_LOGICAL_ID.test(value)
  ) {
    throw new Error("provider returned a non-portable workspace identity");
  }
  return value;
}

export function normalizeMaterialization(value: unknown): RuntimeMaterialization {
  const materialization = record(value, "runtime materialization");
  exactKeys(materialization, ["workspaceIdentity", "handle"], "runtime materialization");
  if (materialization.handle === undefined) throw new Error("runtime materialization.handle is required");
  return {
    workspaceIdentity: validateWorkspaceIdentity(materialization.workspaceIdentity),
    handle: materialization.handle,
  };
}

function normalizeExit(value: unknown): RuntimeExit {
  const exit = record(value, "runtime exit");
  exactKeys(exit, ["code", "signal", "timedOut", "cancelled"], "runtime exit");
  const code = exit.code === null ? null : nonNegativeInteger(exit.code, "runtime exit.code", 255);
  const signal = exit.signal === null ? null : enumSignal(exit.signal);
  const timedOut = boolean(exit.timedOut, "runtime exit.timedOut");
  const cancelled = boolean(exit.cancelled, "runtime exit.cancelled");
  if (timedOut && cancelled) throw new Error("runtime exit cannot be both timed out and cancelled");
  return { code, signal, timedOut, cancelled };
}

function enumSignal(value: unknown): string {
  if (typeof value !== "string" || !SAFE_SIGNAL.test(value)) throw new Error("runtime exit.signal is invalid");
  return value;
}

export function normalizeExecution(value: unknown, request: RuntimeRequest): RuntimeExecutionResult {
  const execution = record(value, "runtime execution result");
  exactKeys(execution, ["state", "exit", "stdoutBytes", "stderrBytes", "detail"], "runtime execution result");
  const state = enumValue(execution.state, "runtime execution result.state", ["PASS", "FAIL", "CANCELLED", "TIMED_OUT"] as const);
  const exit = normalizeExit(execution.exit);
  const stdoutBytes = nonNegativeInteger(execution.stdoutBytes, "runtime execution result.stdoutBytes", request.limits.maxOutputBytes);
  const stderrBytes = nonNegativeInteger(execution.stderrBytes, "runtime execution result.stderrBytes", request.limits.maxOutputBytes);
  if (stdoutBytes + stderrBytes > request.limits.maxOutputBytes) throw new Error("provider output exceeds maxOutputBytes");
  if (state === "PASS" && (exit.code !== 0 || exit.signal !== null || exit.timedOut || exit.cancelled)) {
    throw new Error("PASS execution has inconsistent exit state");
  }
  if (state === "TIMED_OUT" && !exit.timedOut) throw new Error("TIMED_OUT execution lacks timeout evidence");
  if (state === "CANCELLED" && !exit.cancelled) throw new Error("CANCELLED execution lacks cancellation evidence");
  return {
    state,
    exit,
    stdoutBytes,
    stderrBytes,
    detail: portableDetail(execution.detail, "runtime execution result.detail"),
  };
}

function workspaceRelativePath(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 255 || value.startsWith("/") || value.includes("\\")) {
    throw new Error(`${name} is not a bounded workspace-relative path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === ".." || /\p{Cc}/u.test(segment))) {
    throw new Error(`${name} is not normalized or traversal-free`);
  }
  return value;
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export function normalizeCollection(value: unknown, request: RuntimeRequest): RuntimeCollectionResult {
  const collection = record(value, "runtime collection result");
  exactKeys(collection, ["state", "artifacts", "touchedPaths", "detail"], "runtime collection result");
  const state = enumValue(collection.state, "runtime collection result.state", ["PASS", "FAIL"] as const);

  if (!Array.isArray(collection.touchedPaths) || collection.touchedPaths.length > request.limits.maxTouchedPaths) {
    throw new Error("provider touched too many paths");
  }
  const touchedPaths = collection.touchedPaths.map((path, index) => workspaceRelativePath(path, `runtime collection result.touchedPaths[${index}]`));
  if (new Set(touchedPaths).size !== touchedPaths.length) throw new Error("provider returned duplicate touched paths");
  for (const path of touchedPaths) {
    if (!request.mutation.writableRoots.some((root) => path === root || path.startsWith(`${root}/`))) {
      throw new Error("provider touched a path outside mutation.writableRoots");
    }
  }

  if (!Array.isArray(collection.artifacts) || collection.artifacts.length > request.artifacts.length) {
    throw new Error("provider returned too many artifacts");
  }
  const requested = new Map(request.artifacts.map((artifact) => [artifact.kind, artifact]));
  const observedKinds = new Set<string>();
  let total = 0;
  const artifacts = collection.artifacts.map((value, index): RuntimeArtifactRef => {
    const artifact = record(value, `runtime collection result.artifacts[${index}]`);
    exactKeys(artifact, ["kind", "sha256", "bytes", "mediaType"], `runtime collection result.artifacts[${index}]`);
    const kind = typeof artifact.kind === "string" ? artifact.kind : "";
    if (observedKinds.has(kind)) throw new Error(`provider returned duplicate artifact kind: ${kind}`);
    observedKinds.add(kind);
    const contract = requested.get(kind);
    if (!contract) throw new Error(`provider returned an unrequested artifact kind: ${kind}`);
    if (typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
      throw new Error("provider returned an invalid artifact digest");
    }
    const bytes = nonNegativeInteger(artifact.bytes, `runtime collection result.artifacts[${index}].bytes`, request.limits.maxArtifactBytes);
    if (bytes > contract.maxBytes) throw new Error(`provider artifact exceeds per-kind limit: ${kind}`);
    if (typeof artifact.mediaType !== "string" || !contract.mediaTypes.includes(artifact.mediaType)) {
      throw new Error(`provider artifact media type is not allowed: ${kind}`);
    }
    total += bytes;
    return { kind, sha256: artifact.sha256, bytes, mediaType: artifact.mediaType };
  });
  if (total > request.limits.maxArtifactBytes) throw new Error("provider artifacts exceed maxArtifactBytes");
  if (state === "PASS") {
    for (const required of request.artifacts.filter((entry) => entry.required)) {
      if (!observedKinds.has(required.kind)) throw new Error(`required artifact is missing: ${required.kind}`);
    }
  }

  return {
    state,
    artifacts,
    touchedPaths,
    detail: portableDetail(collection.detail, "runtime collection result.detail"),
  };
}

export function normalizeCleanup(value: unknown, request: RuntimeRequest): RuntimeCleanupReceipt {
  const cleanup = record(value, "runtime cleanup receipt");
  exactKeys(
    cleanup,
    ["state", "durationMs", "processesChecked", "workspaceChecked", "sessionsChecked", "residue", "detail"],
    "runtime cleanup receipt",
  );
  const state = enumValue(cleanup.state, "runtime cleanup receipt.state", ["PASS", "FAIL", "NOT_EXERCISED"] as const);
  const durationMs = nonNegativeInteger(cleanup.durationMs, "runtime cleanup receipt.durationMs", request.cleanup.maxDurationMs);
  const processesChecked = boolean(cleanup.processesChecked, "runtime cleanup receipt.processesChecked");
  const workspaceChecked = boolean(cleanup.workspaceChecked, "runtime cleanup receipt.workspaceChecked");
  const sessionsChecked = boolean(cleanup.sessionsChecked, "runtime cleanup receipt.sessionsChecked");
  if (!Array.isArray(cleanup.residue) || cleanup.residue.length > 128) throw new Error("runtime cleanup residue is not bounded");
  const residue = cleanup.residue.map((entry, index) => {
    if (typeof entry !== "string" || !SAFE_LOGICAL_ID.test(entry)) throw new Error(`runtime cleanup residue[${index}] is not a logical identifier`);
    return entry;
  });
  if (new Set(residue).size !== residue.length) throw new Error("runtime cleanup residue contains duplicates");
  if (state === "PASS" && (!processesChecked || !workspaceChecked || !sessionsChecked || residue.length > 0)) {
    throw new Error("PASS cleanup receipt has unchecked or residual state");
  }
  if (state === "NOT_EXERCISED" && (durationMs !== 0 || processesChecked || workspaceChecked || sessionsChecked || residue.length > 0)) {
    throw new Error("NOT_EXERCISED cleanup receipt contains exercised state");
  }
  return {
    state,
    durationMs,
    processesChecked,
    workspaceChecked,
    sessionsChecked,
    residue,
    detail: portableDetail(cleanup.detail, "runtime cleanup receipt.detail"),
  };
}

export function descriptorForRequest(provider: RuntimeProviderSpi, request: RuntimeRequest): RuntimeProviderDescriptor {
  const descriptor = normalizeDescriptor(provider.descriptor);
  if (descriptor.id !== request.providerId) throw new Error("provider descriptor does not match request.providerId");
  if (descriptor.scope !== request.scope) throw new Error("provider descriptor scope does not match request.scope");
  for (const capability of request.requiredCapabilities) {
    if (!descriptor.capabilities.includes(capability)) throw new Error(`provider lacks required capability: ${capability}`);
  }
  if (descriptor.credentialBoundary === "none" && request.secrets.length > 0) {
    throw new Error("provider with credentialBoundary=none cannot receive secret references");
  }
  if (descriptor.credentialBoundary === "host-only" && request.secrets.some((entry) => entry.class !== "host-only")) {
    throw new Error("host-only provider cannot receive broker-only secret references");
  }
  if (descriptor.credentialBoundary === "broker-only" && request.secrets.some((entry) => entry.class !== "broker-only")) {
    throw new Error("broker-only provider cannot receive host-only secret references");
  }
  return descriptor;
}

function assertSourceMatches(left: RuntimeReceipt["source"], right: RuntimeRequest["source"]): void {
  if (canonical(left) !== canonical(right)) throw new Error("runtime receipt source mismatch");
}

function assertOutcome(value: unknown, name: string): asserts value is RuntimeOutcomeState {
  if (typeof value !== "string" || !OUTCOMES.has(value as RuntimeOutcomeState)) throw new Error(`${name} is invalid`);
}

export function assertRuntimeReceiptMatchesRequest(receipt: RuntimeReceipt, value: unknown): void {
  const request = validateRuntimeRequest(value);
  if (receipt.schema !== RUNTIME_RECEIPT_SCHEMA) throw new Error("runtime receipt schema mismatch");
  if (receipt.requestId !== request.requestId) throw new Error("runtime receipt requestId mismatch");
  if (receipt.requestDigest !== runtimeRequestDigest(request)) throw new Error("runtime receipt request digest mismatch");
  if (receipt.provider.id !== request.providerId || receipt.provider.scope !== request.scope) {
    throw new Error("runtime receipt provider mismatch");
  }
  if (!Array.isArray(receipt.provider.capabilities) || new Set(receipt.provider.capabilities).size !== receipt.provider.capabilities.length) {
    throw new Error("runtime receipt provider capabilities are invalid");
  }
  for (const capability of request.requiredCapabilities) {
    if (!receipt.provider.capabilities.includes(capability) && receipt.provider.version !== "unresolved") {
      throw new Error(`runtime receipt provider lacks required capability: ${capability}`);
    }
  }
  assertSourceMatches(receipt.source, request.source);
  if (receipt.workspaceIdentity !== null) validateWorkspaceIdentity(receipt.workspaceIdentity);
  validateRuntimeLifecycleTrace(receipt.lifecycle);
  assertOutcome(receipt.taskOutcome, "runtime receipt taskOutcome");
  assertOutcome(receipt.outcome, "runtime receipt outcome");
  if (receipt.outcome !== receipt.lifecycle[receipt.lifecycle.length - 1]) {
    throw new Error("runtime receipt outcome does not match lifecycle terminal state");
  }
  if (receipt.outcome !== "FAILED_CLEANUP" && receipt.taskOutcome !== receipt.outcome) {
    throw new Error("runtime receipt taskOutcome and outcome disagree without cleanup failure");
  }
  if (receipt.outcome === "FAILED_CLEANUP" && receipt.taskOutcome === "FAILED_CLEANUP") {
    throw new Error("runtime receipt lost the pre-cleanup task outcome");
  }
  if (receipt.state !== runtimeEvidenceForOutcome(receipt.outcome)) {
    throw new Error("runtime receipt evidence state does not match outcome");
  }
  const admission = record(receipt.admission, "runtime receipt admission");
  exactKeys(admission, ["state", "detail"], "runtime receipt admission");
  enumValue(admission.state, "runtime receipt admission.state", ["PASS", "FAIL", "NOT_EXERCISED"] as const);
  portableDetail(admission.detail, "runtime receipt admission.detail");
  const exit = normalizeExit(receipt.exit);
  const stdoutBytes = nonNegativeInteger(receipt.output.stdoutBytes, "runtime receipt output.stdoutBytes", request.limits.maxOutputBytes);
  const stderrBytes = nonNegativeInteger(receipt.output.stderrBytes, "runtime receipt output.stderrBytes", request.limits.maxOutputBytes);
  if (stdoutBytes + stderrBytes > request.limits.maxOutputBytes) throw new Error("runtime receipt output exceeds request limit");
  if (receipt.taskOutcome === "COMPLETED" && (exit.code !== 0 || exit.signal !== null || exit.timedOut || exit.cancelled)) {
    throw new Error("completed runtime receipt has inconsistent exit state");
  }
  if (receipt.taskOutcome === "TIMED_OUT" && !exit.timedOut) throw new Error("timed-out runtime receipt lacks timeout evidence");
  if (receipt.taskOutcome === "CANCELLED" && !exit.cancelled) throw new Error("cancelled runtime receipt lacks cancellation evidence");
  normalizeCollection(
    {
      state: receipt.taskOutcome === "COMPLETED" ? "PASS" : "FAIL",
      artifacts: receipt.artifacts,
      touchedPaths: receipt.touchedPaths,
      detail: "receipt collection validation",
    },
    request,
  );
  const cleanup = normalizeCleanup(receipt.cleanup, request);
  if (receipt.outcome === "FAILED_CLEANUP" && cleanup.state === "PASS") {
    throw new Error("FAILED_CLEANUP runtime receipt contains PASS cleanup");
  }
  if (receipt.outcome !== "FAILED_CLEANUP" && receipt.workspaceIdentity !== null && cleanup.state !== "PASS") {
    throw new Error("runtime receipt completed a materialized lifecycle without PASS cleanup");
  }
  if (receipt.exclusions.join("\u0000") !== request.exclusions.join("\u0000")) {
    throw new Error("runtime receipt exclusions mismatch");
  }
  portableDetail(receipt.detail, "runtime receipt detail");
}
