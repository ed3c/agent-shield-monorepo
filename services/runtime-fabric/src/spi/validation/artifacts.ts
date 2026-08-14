import {
  type RuntimeArtifactRef,
  type RuntimeCleanupReceipt,
  type RuntimeOutcomeState,
  type RuntimeRequest,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import type { RuntimeCollectionResult } from "../types.ts";
import {
  SAFE_LOGICAL_ID,
  SAFE_MEDIA,
  boolean,
  enumValue,
  exactKeys,
  nonNegativeInteger,
  portableDetail,
  record,
} from "./common.ts";

function workspaceRelativePath(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 255 ||
    value.startsWith("/") ||
    value.startsWith("~") ||
    /^[A-Za-z]:/.test(value) ||
    value.includes("\\")
  ) {
    throw new Error(`${name} is not a bounded workspace-relative path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === ".." || /\p{Cc}/u.test(segment))) {
    throw new Error(`${name} is not normalized or traversal-free`);
  }
  return value;
}

function normalizeArtifactRef(value: unknown, name: string, maxBytes: number): RuntimeArtifactRef {
  const artifact = record(value, name);
  exactKeys(artifact, ["kind", "sha256", "bytes", "mediaType"], name);
  if (typeof artifact.kind !== "string" || !SAFE_LOGICAL_ID.test(artifact.kind)) throw new Error(`${name}.kind is invalid`);
  if (typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error(`${name}.sha256 is invalid`);
  if (typeof artifact.mediaType !== "string" || !SAFE_MEDIA.test(artifact.mediaType)) throw new Error(`${name}.mediaType is invalid`);
  return {
    kind: artifact.kind,
    sha256: artifact.sha256,
    bytes: nonNegativeInteger(artifact.bytes, `${name}.bytes`, maxBytes),
    mediaType: artifact.mediaType,
  };
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
    const artifact = normalizeArtifactRef(value, `runtime collection result.artifacts[${index}]`, request.limits.maxArtifactBytes);
    if (observedKinds.has(artifact.kind)) throw new Error(`provider returned duplicate artifact kind: ${artifact.kind}`);
    observedKinds.add(artifact.kind);
    const contract = requested.get(artifact.kind);
    if (!contract) throw new Error(`provider returned an unrequested artifact kind: ${artifact.kind}`);
    if (artifact.bytes > contract.maxBytes) throw new Error(`provider artifact exceeds per-kind limit: ${artifact.kind}`);
    if (!contract.mediaTypes.includes(artifact.mediaType)) throw new Error(`provider artifact media type is not allowed: ${artifact.kind}`);
    total += artifact.bytes;
    return artifact;
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

export function normalizeCleanup(
  value: unknown,
  request: RuntimeRequest,
  taskOutcome: RuntimeOutcomeState,
  mode: "materialized" | "recovery" = "materialized",
): RuntimeCleanupReceipt {
  const cleanup = record(value, "runtime cleanup receipt");
  exactKeys(
    cleanup,
    [
      "state",
      "durationMs",
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
  const state = enumValue(cleanup.state, "runtime cleanup receipt.state", ["PASS", "FAIL", "NOT_EXERCISED"] as const);
  const durationMs = nonNegativeInteger(cleanup.durationMs, "runtime cleanup receipt.durationMs", request.cleanup.maxDurationMs);
  const processesChecked = boolean(cleanup.processesChecked, "runtime cleanup receipt.processesChecked");
  const workspaceChecked = boolean(cleanup.workspaceChecked, "runtime cleanup receipt.workspaceChecked");
  const sessionsChecked = boolean(cleanup.sessionsChecked, "runtime cleanup receipt.sessionsChecked");
  const workspaceDisposition = enumValue(
    cleanup.workspaceDisposition,
    "runtime cleanup receipt.workspaceDisposition",
    ["DELETED", "PRESERVED_BY_POLICY", "ABSENT", "UNKNOWN"] as const,
  );
  const preservationRef = cleanup.preservationRef === null
    ? null
    : normalizeArtifactRef(cleanup.preservationRef, "runtime cleanup receipt.preservationRef", request.limits.maxArtifactBytes);
  if (!Array.isArray(cleanup.residue) || cleanup.residue.length > 128) throw new Error("runtime cleanup residue is not bounded");
  const residue = cleanup.residue.map((entry, index) => {
    if (typeof entry !== "string" || !SAFE_LOGICAL_ID.test(entry)) throw new Error(`runtime cleanup residue[${index}] is not a logical identifier`);
    return entry;
  });
  if (new Set(residue).size !== residue.length) throw new Error("runtime cleanup residue contains duplicates");

  if (workspaceDisposition === "PRESERVED_BY_POLICY" && preservationRef === null) {
    throw new Error("preserved workspace lacks a content-addressed preservationRef");
  }
  if (workspaceDisposition !== "PRESERVED_BY_POLICY" && preservationRef !== null) {
    throw new Error("non-preserved workspace contains a preservationRef");
  }
  if (state === "PASS") {
    if (!processesChecked || !workspaceChecked || !sessionsChecked || residue.length > 0 || workspaceDisposition === "UNKNOWN") {
      throw new Error("PASS cleanup receipt has unchecked, unknown, or residual state");
    }
    if (mode === "materialized" && workspaceDisposition === "ABSENT") {
      throw new Error("materialized workspace cannot disappear as ABSENT");
    }
    if (request.cleanup.workspaceCleanup === "delete" && workspaceDisposition !== "DELETED" && !(mode === "recovery" && workspaceDisposition === "ABSENT")) {
      throw new Error("delete cleanup policy did not delete or prove absence of the workspace");
    }
    if (taskOutcome === "COMPLETED" && workspaceDisposition === "PRESERVED_BY_POLICY") {
      throw new Error("successful task cannot preserve a failure workspace");
    }
    if (workspaceDisposition === "PRESERVED_BY_POLICY" && request.cleanup.workspaceCleanup !== "preserve-on-failure") {
      throw new Error("workspace preservation was not authorized by policy");
    }
  }
  if (state === "NOT_EXERCISED") {
    if (
      durationMs !== 0 ||
      processesChecked ||
      workspaceChecked ||
      sessionsChecked ||
      workspaceDisposition !== "ABSENT" ||
      preservationRef !== null ||
      residue.length > 0
    ) {
      throw new Error("NOT_EXERCISED cleanup receipt contains exercised state");
    }
  }
  return {
    state,
    durationMs,
    processesChecked,
    workspaceChecked,
    sessionsChecked,
    workspaceDisposition,
    preservationRef,
    residue,
    detail: portableDetail(cleanup.detail, "runtime cleanup receipt.detail"),
  };
}

