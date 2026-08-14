import type { JsonObject, RuntimeArtifactRequest, RuntimeLimits, RuntimeRequest } from "../types.ts";
import {
  MAX_RUNTIME_BYTES, MAX_RUNTIME_TIMEOUT_MS, MAX_TOUCHED_PATHS, SAFE_ID, SAFE_MEDIA, boundedStringArray,
  enumValue, exactKeys, fail, positiveInteger, record, relativePath, requiredBoolean, requiredString,
} from "./common.ts";

export interface RequestBoundParts {
  limits: RuntimeLimits;
  mutation: RuntimeRequest["mutation"];
  artifacts: RuntimeArtifactRequest[];
  cleanup: RuntimeRequest["cleanup"];
  exclusions: string[];
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
function assertNonOverlappingRoots(values: string[], name: string): void {
  for (let left = 0; left < values.length; left += 1) for (let right = left + 1; right < values.length; right += 1) {
    if (pathsOverlap(values[left], values[right])) fail(`${name} contains overlapping roots`);
  }
}

export function parseRequestBoundParts(request: Record<string, unknown>, input: JsonObject): RequestBoundParts {
  const limitsValue = record(request.limits, "limits");
  exactKeys(limitsValue, ["timeoutMs", "cancellationGraceMs", "maxInputBytes", "maxOutputBytes", "maxArtifactBytes", "maxTouchedPaths"], "limits");
  const limits: RuntimeLimits = {
    timeoutMs: positiveInteger(limitsValue.timeoutMs, "limits.timeoutMs", MAX_RUNTIME_TIMEOUT_MS),
    cancellationGraceMs: positiveInteger(limitsValue.cancellationGraceMs, "limits.cancellationGraceMs", 300_000),
    maxInputBytes: positiveInteger(limitsValue.maxInputBytes, "limits.maxInputBytes", MAX_RUNTIME_BYTES),
    maxOutputBytes: positiveInteger(limitsValue.maxOutputBytes, "limits.maxOutputBytes", MAX_RUNTIME_BYTES),
    maxArtifactBytes: positiveInteger(limitsValue.maxArtifactBytes, "limits.maxArtifactBytes", MAX_RUNTIME_BYTES),
    maxTouchedPaths: positiveInteger(limitsValue.maxTouchedPaths, "limits.maxTouchedPaths", MAX_TOUCHED_PATHS),
  };
  if (limits.cancellationGraceMs > limits.timeoutMs) {
    fail("limits.cancellationGraceMs must not exceed limits.timeoutMs");
  }
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > limits.maxInputBytes) fail("workload.input exceeds limits.maxInputBytes");

  const mutationValue = record(request.mutation, "mutation");
  exactKeys(mutationValue, ["writableRoots", "readOnlyRoots"], "mutation");
  const writableRoots = boundedStringArray(mutationValue.writableRoots, "mutation.writableRoots", 128, (entry, index) => relativePath(entry, `mutation.writableRoots[${index}]`)).sort();
  const readOnlyRoots = boundedStringArray(mutationValue.readOnlyRoots, "mutation.readOnlyRoots", 128, (entry, index) => relativePath(entry, `mutation.readOnlyRoots[${index}]`)).sort();
  assertNonOverlappingRoots(writableRoots, "mutation.writableRoots");
  assertNonOverlappingRoots(readOnlyRoots, "mutation.readOnlyRoots");
  for (const writable of writableRoots) for (const readOnly of readOnlyRoots) if (pathsOverlap(writable, readOnly)) fail("mutation writable and read-only roots overlap");

  if (!Array.isArray(request.artifacts) || request.artifacts.length > 64) fail("artifacts must contain at most 64 items");
  const artifacts = request.artifacts.map((entry, index): RuntimeArtifactRequest => {
    const artifact = record(entry, `artifacts[${index}]`);
    exactKeys(artifact, ["kind", "required", "maxBytes", "mediaTypes"], `artifacts[${index}]`);
    const mediaTypes = boundedStringArray(artifact.mediaTypes, `artifacts[${index}].mediaTypes`, 32, (item, mediaIndex) => {
      if (!SAFE_MEDIA.test(item)) fail(`artifacts[${index}].mediaTypes[${mediaIndex}] is invalid`);
    }).sort();
    if (mediaTypes.length === 0) fail(`artifacts[${index}].mediaTypes must not be empty`);
    return {
      kind: requiredString(artifact.kind, `artifacts[${index}].kind`, SAFE_ID, 128),
      required: requiredBoolean(artifact.required, `artifacts[${index}].required`),
      maxBytes: positiveInteger(artifact.maxBytes, `artifacts[${index}].maxBytes`, limits.maxArtifactBytes),
      mediaTypes,
    };
  }).sort((left, right) => left.kind.localeCompare(right.kind));
  if (new Set(artifacts.map((entry) => entry.kind)).size !== artifacts.length) fail("artifacts contain duplicate kinds");
  if (artifacts.reduce((sum, artifact) => sum + artifact.maxBytes, 0) > limits.maxArtifactBytes) fail("artifact contracts exceed limits.maxArtifactBytes");

  const cleanupValue = record(request.cleanup, "cleanup");
  exactKeys(cleanupValue, ["processCleanup", "workspaceCleanup", "sessionCleanup", "maxDurationMs"], "cleanup");
  const cleanup: RuntimeRequest["cleanup"] = {
    processCleanup: enumValue(cleanupValue.processCleanup, "cleanup.processCleanup", ["required"] as const),
    workspaceCleanup: enumValue(cleanupValue.workspaceCleanup, "cleanup.workspaceCleanup", ["delete", "preserve-on-failure"] as const),
    sessionCleanup: enumValue(cleanupValue.sessionCleanup, "cleanup.sessionCleanup", ["required"] as const),
    maxDurationMs: positiveInteger(cleanupValue.maxDurationMs, "cleanup.maxDurationMs", 300_000),
  };
  if (limits.cancellationGraceMs > cleanup.maxDurationMs) {
    fail("limits.cancellationGraceMs must not exceed cleanup.maxDurationMs");
  }

  const exclusions = boundedStringArray(request.exclusions, "exclusions", 64, (entry, index) => {
    if (!SAFE_ID.test(entry)) fail(`exclusions[${index}] is invalid`);
  }).sort();
  return {
    limits,
    mutation: { writableRoots, readOnlyRoots },
    artifacts,
    cleanup,
    exclusions,
  };
}
