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
  type RuntimeImmutableSubjectRef,
  type RuntimeOutcomeState,
  type RuntimeProviderDescriptor,
  type RuntimeReceipt,
  type RuntimeRequest,
  type RuntimeStage,
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
const STAGES = new Set<RuntimeStage>([
  "admission",
  "materialization",
  "execution",
  "collection",
  "cleanup",
]);
const SAFE_LOGICAL_ID = /^[a-z0-9][a-z0-9._:/-]{0,255}$/;
const SAFE_SIGNAL = /^SIG[A-Z0-9_]{1,28}$/;
const SAFE_KIND = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_MEDIA = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${name} must be a plain data object`);
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) throw new Error(`${name}.${key} is forbidden`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(`${name}.${key} is not allowed`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) throw new Error(`${name}.${key} is required`);
  }
}

function portableDetail(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 1024 ||
    /\p{Cc}/u.test(value)
  ) {
    throw new Error(`${name} must be printable metadata no longer than 1024 characters`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, name: string, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  ) {
    throw new Error(`${name} must be an integer between 0 and ${max}`);
  }
  return value;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

function enumValue<T extends string>(
  value: unknown,
  name: string,
  values: readonly T[],
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`${name} is invalid`);
  }
  return value as T;
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("runtime canonical value is not JSON");
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  }
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

export function timeoutExit(): RuntimeExit {
  return { code: null, signal: null, timedOut: true, cancelled: false };
}

export function cancelledExit(): RuntimeExit {
  return { code: null, signal: null, timedOut: false, cancelled: true };
}

export function unexercisedAdmission(detail: string): RuntimeAdmissionReceipt {
  return { state: "NOT_EXERCISED", detail };
}

export function unexercisedCleanup(detail: string): RuntimeCleanupReceipt {
  return {
    state: "NOT_EXERCISED",
    durationMs: 0,
    timedOut: false,
    cancelled: false,
    processesChecked: false,
    workspaceChecked: false,
    sessionsChecked: false,
    workspaceDisposition: "ABSENT",
    preservationRef: null,
    residue: [],
    detail,
  };
}

export function failedCleanup(
  detail: string,
  options: { timedOut?: boolean; cancelled?: boolean; residue?: string[] } = {},
): RuntimeCleanupReceipt {
  return {
    state: "FAIL",
    durationMs: 0,
    timedOut: options.timedOut ?? false,
    cancelled: options.cancelled ?? false,
    processesChecked: false,
    workspaceChecked: false,
    sessionsChecked: false,
    workspaceDisposition: "UNKNOWN",
    preservationRef: null,
    residue: options.residue ?? ["cleanup-failure"],
    detail,
  };
}

export function normalizeAdmission(value: unknown): RuntimeAdmissionResult {
  const admission = record(value, "runtime admission result");
  exactKeys(admission, ["state", "detail"], "runtime admission result");
  return {
    state: enumValue(
      admission.state,
      "runtime admission result.state",
      ["PASS", "FAIL", "REFUSED_POLICY"] as const,
    ),
    detail: portableDetail(admission.detail, "runtime admission result.detail"),
  };
}

export function validateWorkspaceIdentity(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    /[\s\\]/.test(value) ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
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
  exactKeys(
    materialization,
    ["workspaceIdentity", "handle"],
    "runtime materialization",
  );
  if (materialization.handle === undefined) {
    throw new Error("runtime materialization.handle is required");
  }
  return {
    workspaceIdentity: validateWorkspaceIdentity(materialization.workspaceIdentity),
    handle: materialization.handle,
  };
}

export function normalizeExit(value: unknown): RuntimeExit {
  const exit = record(value, "runtime exit");
  exactKeys(exit, ["code", "signal", "timedOut", "cancelled"], "runtime exit");
  const code =
    exit.code === null
      ? null
      : nonNegativeInteger(exit.code, "runtime exit.code", 255);
  const signal = exit.signal === null ? null : enumSignal(exit.signal);
  const timedOut = boolean(exit.timedOut, "runtime exit.timedOut");
  const cancelled = boolean(exit.cancelled, "runtime exit.cancelled");
  if (timedOut && cancelled) {
    throw new Error("runtime exit cannot be both timed out and cancelled");
  }
  return { code, signal, timedOut, cancelled };
}

function enumSignal(value: unknown): string {
  if (typeof value !== "string" || !SAFE_SIGNAL.test(value)) {
    throw new Error("runtime exit.signal is invalid");
  }
  return value;
}

export function normalizeExecution(
  value: unknown,
  request: RuntimeRequest,
): RuntimeExecutionResult {
  const execution = record(value, "runtime execution result");
  exactKeys(
    execution,
    ["state", "exit", "stdoutBytes", "stderrBytes", "detail"],
    "runtime execution result",
  );
  const state = enumValue(
    execution.state,
    "runtime execution result.state",
    ["PASS", "FAIL", "CANCELLED", "TIMED_OUT"] as const,
  );
  const exit = normalizeExit(execution.exit);
  const stdoutBytes = nonNegativeInteger(
    execution.stdoutBytes,
    "runtime execution result.stdoutBytes",
    request.limits.maxOutputBytes,
  );
  const stderrBytes = nonNegativeInteger(
    execution.stderrBytes,
    "runtime execution result.stderrBytes",
    request.limits.maxOutputBytes,
  );
  if (stdoutBytes + stderrBytes > request.limits.maxOutputBytes) {
    throw new Error("provider output exceeds maxOutputBytes");
  }
  if (
    state === "PASS" &&
    (exit.code !== 0 || exit.signal !== null || exit.timedOut || exit.cancelled)
  ) {
    throw new Error("PASS execution has inconsistent exit state");
  }
  if (state === "TIMED_OUT" && !exit.timedOut) {
    throw new Error("TIMED_OUT execution lacks timeout evidence");
  }
  if (state === "CANCELLED" && !exit.cancelled) {
    throw new Error("CANCELLED execution lacks cancellation evidence");
  }
  if (
    state === "FAIL" &&
    exit.code === 0 &&
    exit.signal === null &&
    !exit.timedOut &&
    !exit.cancelled
  ) {
    throw new Error("FAIL execution has a success exit");
  }
  return {
    state,
    exit,
    stdoutBytes,
    stderrBytes,
    detail: portableDetail(execution.detail, "runtime execution result.detail"),
  };
}

function workspaceRelativePath(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 255 ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:/.test(value) ||
    value.includes("\\") ||
    value.includes(":")
  ) {
    throw new Error(`${name} is not a bounded workspace-relative path`);
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        /\p{Cc}/u.test(segment),
    )
  ) {
    throw new Error(`${name} is not normalized or traversal-free`);
  }
  return value;
}

function normalizeArtifactRef(
  value: unknown,
  name: string,
  request: RuntimeRequest,
  contract?: { kind: string; maxBytes: number; mediaTypes: string[] },
): RuntimeArtifactRef {
  const artifact = record(value, name);
  exactKeys(artifact, ["kind", "sha256", "bytes", "mediaType"], name);
  const kind = typeof artifact.kind === "string" ? artifact.kind : "";
  if (!SAFE_KIND.test(kind)) throw new Error(`${name}.kind is invalid`);
  if (contract && kind !== contract.kind) {
    throw new Error(`${name}.kind does not match its contract`);
  }
  if (typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
    throw new Error(`${name}.sha256 is invalid`);
  }
  const bytes = nonNegativeInteger(
    artifact.bytes,
    `${name}.bytes`,
    request.limits.maxArtifactBytes,
  );
  if (contract && bytes > contract.maxBytes) {
    throw new Error(`${name} exceeds its per-kind byte limit`);
  }
  if (
    typeof artifact.mediaType !== "string" ||
    !SAFE_MEDIA.test(artifact.mediaType) ||
    (contract && !contract.mediaTypes.includes(artifact.mediaType))
  ) {
    throw new Error(`${name}.mediaType is not allowed`);
  }
  return { kind, sha256: artifact.sha256, bytes, mediaType: artifact.mediaType };
}

export function normalizeCollection(
  value: unknown,
  request: RuntimeRequest,
): RuntimeCollectionResult {
  const collection = record(value, "runtime collection result");
  exactKeys(
    collection,
    ["state", "artifacts", "touchedPaths", "detail"],
    "runtime collection result",
  );
  const state = enumValue(
    collection.state,
    "runtime collection result.state",
    ["PASS", "FAIL"] as const,
  );

  if (
    !Array.isArray(collection.touchedPaths) ||
    collection.touchedPaths.length > request.limits.maxTouchedPaths
  ) {
    throw new Error("provider touched too many paths");
  }
  const touchedPaths = collection.touchedPaths.map((path, index) =>
    workspaceRelativePath(
      path,
      `runtime collection result.touchedPaths[${index}]`,
    ),
  );
  if (new Set(touchedPaths).size !== touchedPaths.length) {
    throw new Error("provider returned duplicate touched paths");
  }
  for (const path of touchedPaths) {
    if (
      !request.mutation.writableRoots.some(
        (root) => path === root || path.startsWith(`${root}/`),
      )
    ) {
      throw new Error("provider touched a path outside mutation.writableRoots");
    }
  }

  if (
    !Array.isArray(collection.artifacts) ||
    collection.artifacts.length > request.artifacts.length
  ) {
    throw new Error("provider returned too many artifacts");
  }
  const requested = new Map(
    request.artifacts.map((artifact) => [artifact.kind, artifact]),
  );
  const observedKinds = new Set<string>();
  let total = 0;
  const artifacts = collection.artifacts.map(
    (value, index): RuntimeArtifactRef => {
      const raw = record(
        value,
        `runtime collection result.artifacts[${index}]`,
      );
      const kind = typeof raw.kind === "string" ? raw.kind : "";
      if (observedKinds.has(kind)) {
        throw new Error(`provider returned duplicate artifact kind: ${kind}`);
      }
      observedKinds.add(kind);
      const contract = requested.get(kind);
      if (!contract) {
        throw new Error(`provider returned an unrequested artifact kind: ${kind}`);
      }
      const artifact = normalizeArtifactRef(
        raw,
        `runtime collection result.artifacts[${index}]`,
        request,
        contract,
      );
      total += artifact.bytes;
      return artifact;
    },
  );
  if (total > request.limits.maxArtifactBytes) {
    throw new Error("provider artifacts exceed maxArtifactBytes");
  }
  if (state === "PASS") {
    for (const required of request.artifacts.filter((entry) => entry.required)) {
      if (!observedKinds.has(required.kind)) {
        throw new Error(`required artifact is missing: ${required.kind}`);
      }
    }
  }

  return {
    state,
    artifacts,
    touchedPaths,
    detail: portableDetail(collection.detail, "runtime collection result.detail"),
  };
}

export function normalizeCleanup(
  value: unknown,
  request: RuntimeRequest,
  taskOutcome: RuntimeOutcomeState,
  workspaceExpected: boolean,
): RuntimeCleanupReceipt {
  const cleanup = record(value, "runtime cleanup receipt");
  exactKeys(
    cleanup,
    [
      "state",
      "durationMs",
      "timedOut",
      "cancelled",
      "processesChecked",
      "workspaceChecked",
      "sessionsChecked",
      "workspaceDisposition",
      "preservationRef",
      "residue",
      "detail",
    ],
    "runtime cleanup receipt",
  );
  const state = enumValue(
    cleanup.state,
    "runtime cleanup receipt.state",
    ["PASS", "FAIL", "NOT_EXERCISED"] as const,
  );
  const durationMs = nonNegativeInteger(
    cleanup.durationMs,
    "runtime cleanup receipt.durationMs",
    request.cleanup.maxDurationMs,
  );
  const timedOut = boolean(cleanup.timedOut, "runtime cleanup receipt.timedOut");
  const cancelled = boolean(cleanup.cancelled, "runtime cleanup receipt.cancelled");
  if (timedOut && cancelled) {
    throw new Error("runtime cleanup cannot be both timed out and cancelled");
  }
  const processesChecked = boolean(
    cleanup.processesChecked,
    "runtime cleanup receipt.processesChecked",
  );
  const workspaceChecked = boolean(
    cleanup.workspaceChecked,
    "runtime cleanup receipt.workspaceChecked",
  );
  const sessionsChecked = boolean(
    cleanup.sessionsChecked,
    "runtime cleanup receipt.sessionsChecked",
  );
  const workspaceDisposition = enumValue(
    cleanup.workspaceDisposition,
    "runtime cleanup receipt.workspaceDisposition",
    ["DELETED", "PRESERVED_BY_POLICY", "ABSENT", "UNKNOWN"] as const,
  );

  const preservationRef =
    cleanup.preservationRef === null
      ? null
      : normalizeArtifactRef(
          cleanup.preservationRef,
          "runtime cleanup receipt.preservationRef",
          request,
        );

  if (!Array.isArray(cleanup.residue) || cleanup.residue.length > 128) {
    throw new Error("runtime cleanup residue is not bounded");
  }
  const residue = cleanup.residue.map((entry, index) => {
    if (typeof entry !== "string" || !SAFE_LOGICAL_ID.test(entry)) {
      throw new Error(
        `runtime cleanup residue[${index}] is not a logical identifier`,
      );
    }
    return entry;
  });
  if (new Set(residue).size !== residue.length) {
    throw new Error("runtime cleanup residue contains duplicates");
  }

  if (
    state === "PASS" &&
    (!processesChecked || !workspaceChecked || !sessionsChecked || residue.length > 0)
  ) {
    throw new Error("PASS cleanup receipt has unchecked or residual state");
  }
  if (state === "PASS" && (timedOut || cancelled || workspaceDisposition === "UNKNOWN")) {
    throw new Error("PASS cleanup receipt contains timeout, cancellation, or unknown disposition");
  }
  if (
    state === "NOT_EXERCISED" &&
    (
      durationMs !== 0 ||
      timedOut ||
      cancelled ||
      processesChecked ||
      workspaceChecked ||
      sessionsChecked ||
      workspaceDisposition !== "ABSENT" ||
      preservationRef !== null ||
      residue.length > 0
    )
  ) {
    throw new Error("NOT_EXERCISED cleanup receipt contains exercised state");
  }
  if (!workspaceExpected && workspaceDisposition === "UNKNOWN" && state === "PASS") {
    throw new Error("recovery cleanup cannot PASS with unknown workspace disposition");
  }
  if (
    workspaceDisposition === "PRESERVED_BY_POLICY" &&
    (
      preservationRef === null ||
      request.cleanup.workspaceCleanup !== "preserve-on-failure" ||
      taskOutcome === "COMPLETED"
    )
  ) {
    throw new Error("workspace preservation is not authorized by the cleanup policy");
  }
  if (
    workspaceDisposition !== "PRESERVED_BY_POLICY" &&
    preservationRef !== null
  ) {
    throw new Error("cleanup preservationRef exists without preserved disposition");
  }
  if (
    state === "PASS" &&
    request.cleanup.workspaceCleanup === "delete" &&
    workspaceDisposition !== "DELETED" &&
    !(workspaceDisposition === "ABSENT" && !workspaceExpected)
  ) {
    throw new Error("delete cleanup policy did not delete the workspace");
  }
  if (
    state === "PASS" &&
    workspaceExpected &&
    workspaceDisposition === "ABSENT"
  ) {
    throw new Error("materialized workspace became absent without deletion evidence");
  }

  return {
    state,
    durationMs,
    timedOut,
    cancelled,
    processesChecked,
    workspaceChecked,
    sessionsChecked,
    workspaceDisposition,
    preservationRef,
    residue,
    detail: portableDetail(cleanup.detail, "runtime cleanup receipt.detail"),
  };
}

function subjectsEqual(
  left: RuntimeImmutableSubjectRef,
  right: RuntimeImmutableSubjectRef,
): boolean {
  return canonical(left) === canonical(right);
}

export function descriptorForRequest(
  provider: RuntimeProviderSpi,
  request: RuntimeRequest,
): RuntimeProviderDescriptor {
  const descriptor = normalizeDescriptor(provider.descriptor);
  if (descriptor.id !== request.providerId) {
    throw new Error("provider descriptor does not match request.providerId");
  }
  if (descriptor.version !== request.providerVersion) {
    throw new Error("provider descriptor does not match request.providerVersion");
  }
  if (!subjectsEqual(descriptor.subject, request.providerSubject)) {
    throw new Error("provider descriptor subject does not match request.providerSubject");
  }
  if (!subjectsEqual(descriptor.environmentSubject, request.environmentSubject)) {
    throw new Error(
      "provider descriptor environment subject does not match request.environmentSubject",
    );
  }
  if (descriptor.scope !== request.scope) {
    throw new Error("provider descriptor scope does not match request.scope");
  }
  for (const capability of request.requiredCapabilities) {
    if (!descriptor.capabilities.includes(capability)) {
      throw new Error(`provider lacks required capability: ${capability}`);
    }
  }
  if (descriptor.credentialBoundary === "none" && request.secrets.length > 0) {
    throw new Error(
      "provider with credentialBoundary=none cannot receive secret references",
    );
  }
  if (
    descriptor.credentialBoundary === "host-only" &&
    request.secrets.some((entry) => entry.class !== "host-only")
  ) {
    throw new Error(
      "host-only provider cannot receive broker-only secret references",
    );
  }
  if (
    descriptor.credentialBoundary === "broker-only" &&
    request.secrets.some((entry) => entry.class !== "broker-only")
  ) {
    throw new Error(
      "broker-only provider cannot receive host-only secret references",
    );
  }
  return descriptor;
}

function assertSourceMatches(
  left: RuntimeReceipt["source"],
  right: RuntimeRequest["source"],
): void {
  if (canonical(left) !== canonical(right)) {
    throw new Error("runtime receipt source mismatch");
  }
}

function assertOutcome(
  value: unknown,
  name: string,
): asserts value is RuntimeOutcomeState {
  if (typeof value !== "string" || !OUTCOMES.has(value as RuntimeOutcomeState)) {
    throw new Error(`${name} is invalid`);
  }
}

function assertStage(
  value: unknown,
  name: string,
  nullable: boolean,
): asserts value is RuntimeStage | null {
  if (value === null && nullable) return;
  if (typeof value !== "string" || !STAGES.has(value as RuntimeStage)) {
    throw new Error(`${name} is invalid`);
  }
}

function expectedTaskStage(
  outcome: RuntimeOutcomeState,
): RuntimeStage | null | "DYNAMIC" | "OPTIONAL_ADMISSION" {
  switch (outcome) {
    case "COMPLETED":
    case "ABSENT":
    case "NOT_IMPLEMENTED":
    case "NOT_EXERCISED":
      return null;
    case "REFUSED_POLICY":
      return "OPTIONAL_ADMISSION";
    case "FAILED_ADMISSION":
      return "admission";
    case "FAILED_MATERIALIZATION":
      return "materialization";
    case "FAILED_EXECUTION":
      return "execution";
    case "FAILED_ARTIFACT":
      return "collection";
    case "CANCELLED":
    case "TIMED_OUT":
      return "DYNAMIC";
    case "FAILED_CLEANUP":
      throw new Error("FAILED_CLEANUP cannot be a taskOutcome");
  }
}

function assertEmptyExit(exit: RuntimeExit, message: string): void {
  if (
    exit.code !== null ||
    exit.signal !== null ||
    exit.timedOut ||
    exit.cancelled
  ) {
    throw new Error(message);
  }
}

export function assertRuntimeReceiptMatchesRequest(
  receipt: RuntimeReceipt,
  value: unknown,
): void {
  const request = validateRuntimeRequest(value);
  if (receipt.schema !== RUNTIME_RECEIPT_SCHEMA) {
    throw new Error("runtime receipt schema mismatch");
  }
  if (receipt.requestId !== request.requestId) {
    throw new Error("runtime receipt requestId mismatch");
  }
  if (receipt.requestDigest !== runtimeRequestDigest(request)) {
    throw new Error("runtime receipt request digest mismatch");
  }

  if (
    receipt.provider.id !== request.providerId ||
    receipt.provider.version !== request.providerVersion ||
    receipt.provider.scope !== request.scope
  ) {
    throw new Error("runtime receipt provider identity mismatch");
  }
  if (!subjectsEqual(receipt.provider.subject, request.providerSubject)) {
    throw new Error("runtime receipt provider subject mismatch");
  }
  if (
    !subjectsEqual(
      receipt.provider.environmentSubject,
      request.environmentSubject,
    )
  ) {
    throw new Error("runtime receipt environment subject mismatch");
  }
  if (
    !Array.isArray(receipt.provider.capabilities) ||
    new Set(receipt.provider.capabilities).size !==
      receipt.provider.capabilities.length
  ) {
    throw new Error("runtime receipt provider capabilities are invalid");
  }
  for (const capability of request.requiredCapabilities) {
    if (
      !receipt.provider.capabilities.includes(capability) &&
      receipt.outcome !== "ABSENT"
    ) {
      throw new Error(
        `runtime receipt provider lacks required capability: ${capability}`,
      );
    }
  }

  assertSourceMatches(receipt.source, request.source);
  if (receipt.workspaceIdentity !== null) {
    validateWorkspaceIdentity(receipt.workspaceIdentity);
  }
  validateRuntimeLifecycleTrace(receipt.lifecycle);
  assertOutcome(receipt.taskOutcome, "runtime receipt taskOutcome");
  assertOutcome(receipt.outcome, "runtime receipt outcome");
  assertStage(receipt.taskStage, "runtime receipt taskStage", true);
  assertStage(receipt.terminalStage, "runtime receipt terminalStage", true);

  if (receipt.outcome !== receipt.lifecycle[receipt.lifecycle.length - 1]) {
    throw new Error("runtime receipt outcome does not match lifecycle terminal state");
  }
  if (receipt.taskOutcome === "FAILED_CLEANUP") {
    throw new Error("runtime receipt taskOutcome cannot be FAILED_CLEANUP");
  }
  if (
    receipt.outcome !== "FAILED_CLEANUP" &&
    receipt.taskOutcome !== receipt.outcome
  ) {
    throw new Error(
      "runtime receipt taskOutcome and outcome disagree without cleanup failure",
    );
  }
  if (
    receipt.outcome === "FAILED_CLEANUP" &&
    receipt.taskOutcome === "FAILED_CLEANUP"
  ) {
    throw new Error("runtime receipt lost the pre-cleanup task outcome");
  }
  if (receipt.state !== runtimeEvidenceForOutcome(receipt.outcome)) {
    throw new Error("runtime receipt evidence state does not match outcome");
  }

  const expected = expectedTaskStage(receipt.taskOutcome);
  if (expected === "DYNAMIC") {
    if (receipt.taskStage === null || receipt.taskStage === "cleanup") {
      throw new Error("timed-out/cancelled task lacks a valid task stage");
    }
  } else if (expected === "OPTIONAL_ADMISSION") {
    if (receipt.taskStage !== null && receipt.taskStage !== "admission") {
      throw new Error("policy refusal has an invalid task stage");
    }
  } else if (receipt.taskStage !== expected) {
    throw new Error("runtime receipt taskStage does not match taskOutcome");
  }

  if (receipt.outcome === "FAILED_CLEANUP") {
    if (receipt.terminalStage !== "cleanup") {
      throw new Error("FAILED_CLEANUP receipt terminalStage must be cleanup");
    }
  } else if (receipt.terminalStage !== receipt.taskStage) {
    throw new Error("runtime receipt terminalStage does not match taskStage");
  }

  const admission = record(receipt.admission, "runtime receipt admission");
  exactKeys(admission, ["state", "detail"], "runtime receipt admission");
  enumValue(
    admission.state,
    "runtime receipt admission.state",
    ["PASS", "FAIL", "NOT_EXERCISED"] as const,
  );
  portableDetail(admission.detail, "runtime receipt admission.detail");

  const exit = normalizeExit(receipt.exit);
  const stdoutBytes = nonNegativeInteger(
    receipt.output.stdoutBytes,
    "runtime receipt output.stdoutBytes",
    request.limits.maxOutputBytes,
  );
  const stderrBytes = nonNegativeInteger(
    receipt.output.stderrBytes,
    "runtime receipt output.stderrBytes",
    request.limits.maxOutputBytes,
  );
  if (stdoutBytes + stderrBytes > request.limits.maxOutputBytes) {
    throw new Error("runtime receipt output exceeds request limit");
  }

  if (
    receipt.taskStage === null ||
    receipt.taskStage === "admission" ||
    receipt.taskStage === "materialization"
  ) {
    assertEmptyExit(
      exit,
      "pre-execution runtime receipt contains execution evidence",
    );
  }
  if (
    receipt.taskStage === "execution" &&
    receipt.taskOutcome === "TIMED_OUT" &&
    !exit.timedOut
  ) {
    throw new Error("execution timeout receipt lacks execution timeout evidence");
  }
  if (
    receipt.taskStage === "execution" &&
    receipt.taskOutcome === "CANCELLED" &&
    !exit.cancelled
  ) {
    throw new Error(
      "execution cancellation receipt lacks execution cancellation evidence",
    );
  }
  if (
    receipt.taskStage !== "execution" &&
    (receipt.taskOutcome === "TIMED_OUT" ||
      receipt.taskOutcome === "CANCELLED") &&
    (exit.timedOut || exit.cancelled)
  ) {
    throw new Error(
      "non-execution timeout/cancellation incorrectly altered execution exit",
    );
  }
  if (
    receipt.taskOutcome === "COMPLETED" &&
    (exit.code !== 0 ||
      exit.signal !== null ||
      exit.timedOut ||
      exit.cancelled)
  ) {
    throw new Error("completed runtime receipt has inconsistent exit state");
  }
  if (
    receipt.taskStage === "collection" &&
    (exit.code !== 0 ||
      exit.signal !== null ||
      exit.timedOut ||
      exit.cancelled)
  ) {
    throw new Error("collection-stage failure lacks successful execution evidence");
  }

  normalizeCollection(
    {
      state: receipt.taskOutcome === "COMPLETED" ? "PASS" : "FAIL",
      artifacts: receipt.artifacts,
      touchedPaths: receipt.touchedPaths,
      detail: "receipt collection validation",
    },
    request,
  );

  const workspaceExpected =
    receipt.workspaceIdentity !== null ||
    receipt.taskStage === "execution" ||
    receipt.taskStage === "collection" ||
    receipt.terminalStage === "cleanup";
  const cleanup = normalizeCleanup(
    receipt.cleanup,
    request,
    receipt.taskOutcome,
    workspaceExpected,
  );

  if (receipt.outcome === "FAILED_CLEANUP" && cleanup.state !== "FAIL") {
    throw new Error("FAILED_CLEANUP runtime receipt lacks FAIL cleanup");
  }
  if (
    receipt.outcome !== "FAILED_CLEANUP" &&
    (
      receipt.taskStage === "materialization" ||
      receipt.taskStage === "execution" ||
      receipt.taskStage === "collection" ||
      receipt.taskOutcome === "COMPLETED"
    ) &&
    cleanup.state !== "PASS"
  ) {
    throw new Error("runtime receipt completed a cleanup-required lifecycle without PASS cleanup");
  }
  if (
    (receipt.taskStage === null || receipt.taskStage === "admission") &&
    cleanup.state !== "NOT_EXERCISED"
  ) {
    throw new Error("pre-materialization receipt contains cleanup evidence");
  }
  if (
    receipt.workspaceIdentity === null &&
    (receipt.taskStage === "execution" || receipt.taskStage === "collection")
  ) {
    throw new Error("materialized task receipt lacks workspace identity");
  }

  if (
    receipt.exclusions.join("\u0000") !==
    request.exclusions.join("\u0000")
  ) {
    throw new Error("runtime receipt exclusions mismatch");
  }
  portableDetail(receipt.detail, "runtime receipt detail");
}
