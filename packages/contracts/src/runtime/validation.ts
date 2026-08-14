import type { EvidenceState } from "../index.ts";
import {
  RUNTIME_REQUEST_SCHEMA,
  type JsonObject,
  type JsonValue,
  type RuntimeArtifactRequest,
  type RuntimeLimits,
  type RuntimeOutcomeState,
  type RuntimeProviderDescriptor,
  type RuntimeRequest,
  type RuntimeSecretRef,
  type RuntimeSourceRef,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const SAFE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::(?:[1-9][0-9]{0,4}))?$/;
const SAFE_MEDIA = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i;
const SAFE_ENVIRONMENT_VARIABLE = /^[A-Z_][A-Z0-9_]{0,127}$/;
const FORBIDDEN_WORKLOAD_KEYS = new Set([
  "argv",
  "command",
  "cwd",
  "env",
  "environment",
  "hostpath",
  "privateflags",
  "shell",
]);
const MAX_RUNTIME_TIMEOUT_MS = 86_400_000;
const MAX_RUNTIME_BYTES = 1_073_741_824;
const MAX_TOUCHED_PATHS = 100_000;

function fail(message: string): never {
  throw new Error(`invalid runtime contract: ${message}`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) fail(`${name}.${key} is not allowed`);
  for (const key of allowed) if (!(key in value)) fail(`${name}.${key} is required`);
}

function requiredString(value: unknown, name: string, pattern?: RegExp, maxLength = 1024): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    fail(`${name} must be a non-empty bounded string`);
  }
  if (/\p{Cc}/u.test(value)) fail(`${name} contains control characters`);
  if (pattern && !pattern.test(value)) fail(`${name} has an invalid format`);
  return value;
}

function requiredBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") fail(`${name} must be a boolean`);
  return value;
}

function positiveInteger(value: unknown, name: string, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > max) {
    fail(`${name} must be an integer between 1 and ${max}`);
  }
  return value;
}

function enumValue<T extends string>(value: unknown, name: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail(`${name} is invalid`);
  return value as T;
}

function boundedStringArray(
  value: unknown,
  name: string,
  maxItems: number,
  validator: (entry: string, index: number) => void,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(`${name} must be an array with at most ${maxItems} items`);
  const result = value.map((entry, index) => {
    const item = requiredString(entry, `${name}[${index}]`, undefined, 512);
    validator(item, index);
    return item;
  });
  if (new Set(result).size !== result.length) fail(`${name} contains duplicates`);
  return result;
}

function relativePath(value: string, name: string): void {
  if (value.startsWith("/") || value.startsWith("~") || value.includes("\\") || value.length > 255) {
    fail(`${name} must be a bounded workspace-relative path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    fail(`${name} must be normalized and traversal-free`);
  }
}

function portableRepository(value: string, name: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} must be an absolute repository URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail(`${name} must be credential-free immutable HTTPS identity`);
  }
  if (!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(parsed.pathname)) {
    fail(`${name} must identify one portable repository`);
  }
}

function rejectGenericControls(value: unknown, name: string, depth = 0): void {
  if (depth > 32) fail(`${name} exceeds maximum nesting depth`);
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) rejectGenericControls(value[index], `${name}[${index}]`, depth + 1);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_WORKLOAD_KEYS.has(key.toLowerCase())) {
      fail(`${name}.${key} would expose a generic runtime control`);
    }
    rejectGenericControls(entry, `${name}.${key}`, depth + 1);
  }
}

function json(value: unknown, name: string, depth = 0): JsonValue {
  if (depth > 32) fail(`${name} exceeds maximum nesting depth`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${name} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => json(entry, `${name}[${index}]`, depth + 1));
  const valueRecord = record(value, name);
  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(valueRecord)) result[key] = json(entry, `${name}.${key}`, depth + 1);
  return result;
}

function validateSource(value: unknown): RuntimeSourceRef {
  const source = record(value, "source");
  const kind = enumValue(source.kind, "source.kind", ["git", "artifact"] as const);
  if (kind === "git") {
    exactKeys(source, ["kind", "repository", "commit", "tree"], "source");
    const repository = requiredString(source.repository, "source.repository", undefined, 512);
    portableRepository(repository, "source.repository");
    return {
      kind,
      repository,
      commit: requiredString(source.commit, "source.commit", GIT_OID, 40),
      tree: requiredString(source.tree, "source.tree", GIT_OID, 40),
    };
  }
  exactKeys(source, ["kind", "sha256", "mediaType"], "source");
  return {
    kind,
    sha256: requiredString(source.sha256, "source.sha256", SHA_256, 64),
    mediaType: requiredString(source.mediaType, "source.mediaType", SAFE_MEDIA, 255),
  };
}

export function validateRuntimeProviderDescriptor(value: unknown): RuntimeProviderDescriptor {
  const descriptor = record(value, "providerDescriptor");
  exactKeys(
    descriptor,
    ["id", "version", "scope", "capabilities", "credentialBoundary", "implementation", "availability", "liveEvidence"],
    "providerDescriptor",
  );
  const capabilities = boundedStringArray(descriptor.capabilities, "providerDescriptor.capabilities", 64, (entry, index) => {
    if (!SAFE_ID.test(entry)) fail(`providerDescriptor.capabilities[${index}] is invalid`);
  });
  if (capabilities.length === 0) fail("providerDescriptor.capabilities must not be empty");
  capabilities.sort();

  const result: RuntimeProviderDescriptor = {
    id: requiredString(descriptor.id, "providerDescriptor.id", SAFE_ID, 128),
    version: requiredString(descriptor.version, "providerDescriptor.version", SAFE_VERSION, 64),
    scope: enumValue(descriptor.scope, "providerDescriptor.scope", ["local", "cloud"] as const),
    capabilities,
    credentialBoundary: enumValue(
      descriptor.credentialBoundary,
      "providerDescriptor.credentialBoundary",
      ["none", "host-only", "broker-only"] as const,
    ),
    implementation: enumValue(
      descriptor.implementation,
      "providerDescriptor.implementation",
      ["IMPLEMENTED", "NOT_IMPLEMENTED"] as const,
    ),
    availability: enumValue(
      descriptor.availability,
      "providerDescriptor.availability",
      ["AVAILABLE", "ABSENT", "REFUSED_POLICY"] as const,
    ),
    liveEvidence: enumValue(descriptor.liveEvidence, "providerDescriptor.liveEvidence", ["PASS", "FAIL", "NOT_EXERCISED"] as const),
  };

  if (result.implementation === "NOT_IMPLEMENTED" && result.liveEvidence !== "NOT_EXERCISED") {
    fail("providerDescriptor NOT_IMPLEMENTED state cannot have live evidence");
  }
  if (result.availability !== "AVAILABLE" && result.liveEvidence === "PASS") {
    fail("providerDescriptor unavailable provider cannot have PASS live evidence");
  }
  return result;
}

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
    if (!/^[a-z][a-z0-9.-]{0,63}:[A-Za-z0-9._/-]{1,255}$/.test(brokerRef) || brokerRef.includes("..")) {
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

  const cleanup = record(request.cleanup, "cleanup");
  exactKeys(cleanup, ["processCleanup", "workspaceCleanup", "sessionCleanup", "maxDurationMs"], "cleanup");
  const exclusions = boundedStringArray(request.exclusions, "exclusions", 64, (entry, index) => {
    if (!SAFE_ID.test(entry)) fail(`exclusions[${index}] is invalid`);
  });
  exclusions.sort();

  return {
    schema: RUNTIME_REQUEST_SCHEMA,
    requestId: requiredString(request.requestId, "request.requestId", SAFE_ID, 128),
    providerId: requiredString(request.providerId, "request.providerId", SAFE_ID, 128),
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
      workspaceCleanup: enumValue(
        cleanup.workspaceCleanup,
        "cleanup.workspaceCleanup",
        ["delete", "preserve-on-failure"] as const,
      ),
      sessionCleanup: enumValue(cleanup.sessionCleanup, "cleanup.sessionCleanup", ["required"] as const),
      maxDurationMs: positiveInteger(cleanup.maxDurationMs, "cleanup.maxDurationMs", 300_000),
    },
    exclusions,
  };
}

export function runtimeProviderCatalogEvidence(descriptor: RuntimeProviderDescriptor): EvidenceState {
  if (descriptor.implementation === "NOT_IMPLEMENTED") return "NOT_IMPLEMENTED";
  if (descriptor.availability === "ABSENT") return "ABSENT";
  if (descriptor.availability === "REFUSED_POLICY") return "FAIL";
  return descriptor.liveEvidence;
}

export function runtimeEvidenceForOutcome(outcome: RuntimeOutcomeState): EvidenceState {
  switch (outcome) {
    case "COMPLETED": return "PASS";
    case "ABSENT": return "ABSENT";
    case "NOT_IMPLEMENTED": return "NOT_IMPLEMENTED";
    case "NOT_EXERCISED": return "NOT_EXERCISED";
    default: return "FAIL";
  }
}
