import { RUNTIME_REQUEST_SCHEMA, type JsonObject, type RuntimeArtifactRequest, type RuntimeLimits, type RuntimeRequest, type RuntimeSecretRef } from "../types.ts";
import {
  MAX_RUNTIME_BYTES,
  MAX_RUNTIME_TIMEOUT_MS,
  MAX_TOUCHED_PATHS,
  SAFE_ENVIRONMENT_VARIABLE,
  SAFE_HOST,
  SAFE_ID,
  SAFE_MEDIA,
  SAFE_VERSION,
  boundedStringArray,
  enumValue,
  exactKeys,
  fail,
  json,
  positiveInteger,
  record,
  rejectGenericControls,
  relativePath,
  requiredBoolean,
  requiredString,
} from "./common.ts";
import { validateRuntimeEnvironmentSubject, validateRuntimeProviderSubject, validateSource } from "./subjects.ts";

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function assertNonOverlappingRoots(values: string[], name: string): void {
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      if (pathsOverlap(values[left], values[right])) fail(`${name} contains overlapping roots`);
    }
  }
}

export function validateRuntimeRequest(value: unknown): RuntimeRequest {
  const request = record(value, "request");
  exactKeys(
    request,
    [
      "schema",
      "requestId",
      "providerId",
      "providerVersion",
      "providerSubject",
      "environmentSubject",
      "scope",
      "requiredCapabilities",
      "source",
      "workload",
      "environment",
      "network",
      "secrets",
      "limits",
      "mutation",
      "artifacts",
      "cleanup",
      "exclusions",
    ],
    "request",
  );
  if (request.schema !== RUNTIME_REQUEST_SCHEMA) fail("request.schema is unsupported");

  const providerId = requiredString(request.providerId, "request.providerId", SAFE_ID, 128);
  const providerVersion = requiredString(request.providerVersion, "request.providerVersion", SAFE_VERSION, 64);
  const providerSubject = validateRuntimeProviderSubject(request.providerSubject, "request.providerSubject");
  const environmentSubject = validateRuntimeEnvironmentSubject(request.environmentSubject, "request.environmentSubject");
  if (providerSubject.id !== providerId || providerSubject.version !== providerVersion) {
    fail("request.providerSubject must bind request.providerId and request.providerVersion");
  }

  const requiredCapabilities = boundedStringArray(request.requiredCapabilities, "requiredCapabilities", 64, (entry, index) => {
    if (!SAFE_ID.test(entry)) fail(`requiredCapabilities[${index}] is invalid`);
  });
  if (requiredCapabilities.length === 0) fail("requiredCapabilities must not be empty");
  requiredCapabilities.sort();

  const workload = record(request.workload, "workload");
  exactKeys(workload, ["id", "version", "input"], "workload");
  const workloadInput = record(workload.input, "workload.input");
  rejectGenericControls(workloadInput, "workload.input");
  const input = json(workloadInput, "workload.input") as JsonObject;

  const environmentValue = record(request.environment, "environment");
  exactKeys(environmentValue, ["allowedVariables"], "environment");
  const allowedVariables = boundedStringArray(
    environmentValue.allowedVariables,
    "environment.allowedVariables",
    128,
    (entry, index) => {
      if (!SAFE_ENVIRONMENT_VARIABLE.test(entry)) fail(`environment.allowedVariables[${index}] is invalid`);
    },
  );
  allowedVariables.sort();

  const network = record(request.network, "network");
  exactKeys(network, ["mode", "allowlist"], "network");
  const networkMode = enumValue(network.mode, "network.mode", ["deny-all", "allowlist"] as const);
  const allowlist = boundedStringArray(network.allowlist, "network.allowlist", 128, (entry, index) => {
    if (!SAFE_HOST.test(entry)) fail(`network.allowlist[${index}] must be an exact host or host:port`);
    const port = entry.includes(":") ? Number(entry.slice(entry.lastIndexOf(":") + 1)) : null;
    if (port !== null && port > 65535) fail(`network.allowlist[${index}] has an invalid port`);
  });
  allowlist.sort();
  if (networkMode === "deny-all" && allowlist.length > 0) fail("network.allowlist must be empty in deny-all mode");
  if (networkMode === "allowlist" && allowlist.length === 0) fail("network.allowlist is required in allowlist mode");

  if (!Array.isArray(request.secrets) || request.secrets.length > 64) fail("secrets must contain at most 64 items");
  const secrets = request.secrets.map((entry, index): RuntimeSecretRef => {
    const secret = record(entry, `secrets[${index}]`);
    exactKeys(secret, ["name", "brokerRef", "class", "delivery"], `secrets[${index}]`);
    const name = requiredString(secret.name, `secrets[${index}].name`, SAFE_ENVIRONMENT_VARIABLE, 128);
    const brokerRef = requiredString(secret.brokerRef, `secrets[${index}].brokerRef`, undefined, 320);
    if (
      !/^[a-z][a-z0-9.-]{0,31}:[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/.test(brokerRef) ||
      brokerRef.includes("..") ||
      brokerRef.includes("://") ||
      brokerRef.includes("\\") ||
      /^[A-Za-z]:/.test(brokerRef)
    ) {
      fail(`secrets[${index}].brokerRef must be an opaque logical broker reference`);
    }
    const delivery = enumValue(secret.delivery, `secrets[${index}].delivery`, ["environment", "opaque-handle"] as const);
    if (delivery === "environment" && !allowedVariables.includes(name)) {
      fail(`secrets[${index}] environment delivery is not declared in environment.allowedVariables`);
    }
    return {
      name,
      brokerRef,
      class: enumValue(secret.class, `secrets[${index}].class`, ["host-only", "broker-only"] as const),
      delivery,
    };
  });
  if (new Set(secrets.map((entry) => entry.name)).size !== secrets.length) fail("secrets contain duplicate names");
  secrets.sort((left, right) => left.name.localeCompare(right.name));

  const limitsValue = record(request.limits, "limits");
  exactKeys(
    limitsValue,
    ["timeoutMs", "cancellationGraceMs", "maxInputBytes", "maxOutputBytes", "maxArtifactBytes", "maxTouchedPaths"],
    "limits",
  );
  const limits: RuntimeLimits = {
    timeoutMs: positiveInteger(limitsValue.timeoutMs, "limits.timeoutMs", MAX_RUNTIME_TIMEOUT_MS),
    cancellationGraceMs: positiveInteger(limitsValue.cancellationGraceMs, "limits.cancellationGraceMs", 300_000),
    maxInputBytes: positiveInteger(limitsValue.maxInputBytes, "limits.maxInputBytes", MAX_RUNTIME_BYTES),
    maxOutputBytes: positiveInteger(limitsValue.maxOutputBytes, "limits.maxOutputBytes", MAX_RUNTIME_BYTES),
    maxArtifactBytes: positiveInteger(limitsValue.maxArtifactBytes, "limits.maxArtifactBytes", MAX_RUNTIME_BYTES),
    maxTouchedPaths: positiveInteger(limitsValue.maxTouchedPaths, "limits.maxTouchedPaths", MAX_TOUCHED_PATHS),
  };
  const inputBytes = new TextEncoder().encode(JSON.stringify(input)).byteLength;
  if (inputBytes > limits.maxInputBytes) fail("workload.input exceeds limits.maxInputBytes");

  const mutation = record(request.mutation, "mutation");
  exactKeys(mutation, ["writableRoots", "readOnlyRoots"], "mutation");
  const writableRoots = boundedStringArray(mutation.writableRoots, "mutation.writableRoots", 128, (entry, index) => {
    relativePath(entry, `mutation.writableRoots[${index}]`);
  });
  const readOnlyRoots = boundedStringArray(mutation.readOnlyRoots, "mutation.readOnlyRoots", 128, (entry, index) => {
    relativePath(entry, `mutation.readOnlyRoots[${index}]`);
  });
  writableRoots.sort();
  readOnlyRoots.sort();
  assertNonOverlappingRoots(writableRoots, "mutation.writableRoots");
  assertNonOverlappingRoots(readOnlyRoots, "mutation.readOnlyRoots");
  for (const writable of writableRoots) {
    for (const readOnly of readOnlyRoots) {
      if (pathsOverlap(writable, readOnly)) fail("mutation writable and read-only roots overlap");
    }
  }

  if (!Array.isArray(request.artifacts) || request.artifacts.length > 64) fail("artifacts must contain at most 64 items");
  const artifacts = request.artifacts.map((entry, index): RuntimeArtifactRequest => {
    const artifact = record(entry, `artifacts[${index}]`);
    exactKeys(artifact, ["kind", "required", "maxBytes", "mediaTypes"], `artifacts[${index}]`);
    const mediaTypes = boundedStringArray(artifact.mediaTypes, `artifacts[${index}].mediaTypes`, 32, (item, mediaIndex) => {
      if (!SAFE_MEDIA.test(item)) fail(`artifacts[${index}].mediaTypes[${mediaIndex}] is invalid`);
    });
    if (mediaTypes.length === 0) fail(`artifacts[${index}].mediaTypes must not be empty`);
    mediaTypes.sort();
    return {
      kind: requiredString(artifact.kind, `artifacts[${index}].kind`, SAFE_ID, 128),
      required: requiredBoolean(artifact.required, `artifacts[${index}].required`),
      maxBytes: positiveInteger(artifact.maxBytes, `artifacts[${index}].maxBytes`, limits.maxArtifactBytes),
      mediaTypes,
    };
  });
  if (new Set(artifacts.map((entry) => entry.kind)).size !== artifacts.length) fail("artifacts contain duplicate kinds");
  artifacts.sort((left, right) => left.kind.localeCompare(right.kind));
  if (artifacts.reduce((sum, artifact) => sum + artifact.maxBytes, 0) > limits.maxArtifactBytes) {
    fail("artifact contracts exceed limits.maxArtifactBytes");
  }

  const cleanup = record(request.cleanup, "cleanup");
  exactKeys(cleanup, ["processCleanup", "workspaceCleanup", "sessionCleanup", "maxDurationMs"], "cleanup");
  const exclusions = boundedStringArray(request.exclusions, "exclusions", 64, (entry, index) => {
    if (!SAFE_ID.test(entry)) fail(`exclusions[${index}] is invalid`);
  });
  exclusions.sort();

  return {
    schema: RUNTIME_REQUEST_SCHEMA,
    requestId: requiredString(request.requestId, "request.requestId", SAFE_ID, 128),
    providerId,
    providerVersion,
    providerSubject,
    environmentSubject,
    scope: enumValue(request.scope, "request.scope", ["local", "cloud"] as const),
    requiredCapabilities,
    source: validateSource(request.source),
    workload: {
      id: requiredString(workload.id, "workload.id", SAFE_ID, 128),
      version: requiredString(workload.version, "workload.version", SAFE_VERSION, 64),
      input,
    },
    environment: { allowedVariables },
    network: { mode: networkMode, allowlist },
    secrets,
    limits,
    mutation: { writableRoots, readOnlyRoots },
    artifacts,
    cleanup: {
      processCleanup: enumValue(cleanup.processCleanup, "cleanup.processCleanup", ["required"] as const),
      workspaceCleanup: enumValue(cleanup.workspaceCleanup, "cleanup.workspaceCleanup", ["delete", "preserve-on-failure"] as const),
      sessionCleanup: enumValue(cleanup.sessionCleanup, "cleanup.sessionCleanup", ["required"] as const),
      maxDurationMs: positiveInteger(cleanup.maxDurationMs, "cleanup.maxDurationMs", 300_000),
    },
    exclusions,
  };
}

