import { createHash } from "node:crypto";
import type { ArtifactRef } from "../index.ts";
import { productEvidenceForOutcome, validateProductLifecycle } from "./state-machine.ts";
import {
  PRODUCT_ACTION_RECEIPT_SCHEMA,
  PRODUCT_ACTION_SCHEMA,
  PRODUCT_AUTOMATION_REQUEST_SCHEMA,
  type AccessibilityTarget,
  type JsonObject,
  type JsonValue,
  type ProductAction,
  type ProductActionDefinition,
  type ProductActionReceipt,
  type ProductAdapterSubject,
  type ProductAuthorization,
  type ProductAutomationRequest,
  type ProductCleanupReceipt,
  type ProductState,
  type ProjectionFrame,
  type ProjectionLimits,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const SAFE_TARGET_ID = /^[a-z0-9][a-z0-9.:_-]{0,127}$/;
const SAFE_SCOPE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const SAFE_MEDIA = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i;
const MAX_JSON_DEPTH = 16;
const MAX_JSON_ENTRIES = 512;
const MAX_AUTHORIZATION_MS = 900_000;
const MAX_PROJECTION_BYTES = 33_554_432;
const MAX_PROJECTION_MS = 3_600_000;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// UX-FND-001. A product action must never carry a generic control surface, and UX-FND-008
// keeps the shipped mobile runtime out of the argument space -- Bun is tooling only.
const FORBIDDEN_ARGUMENT_KEYS = new Set([
  "args", "arguments", "argv", "bun", "cmd", "command", "cwd", "deeplink", "entrypoint",
  "env", "environment", "eval", "executable", "file", "hostpath", "href", "javascript",
  "navigate", "path", "program", "route", "script", "selector", "shell", "sql", "url",
  "workdir", "workingdirectory", "xpath",
]);

export function fail(message: string): never {
  throw new Error(`invalid product contract: ${message}`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${name} must be a plain own-key object`);
  for (const key of Object.keys(value)) {
    if (key.length === 0 || key.length > 128 || /\p{Cc}/u.test(key) || FORBIDDEN_OBJECT_KEYS.has(key)) {
      fail(`${name} contains an unsafe object key`);
    }
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) fail(`${name}.${key} is not allowed`);
  for (const key of allowed) if (!Object.hasOwn(value, key)) fail(`${name}.${key} is required`);
}

function text(value: unknown, name: string, pattern?: RegExp, maxLength = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    fail(`${name} must be a non-empty bounded string`);
  }
  if (/\p{Cc}/u.test(value)) fail(`${name} contains control characters`);
  if (pattern && !pattern.test(value)) fail(`${name} has an invalid format`);
  return value;
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") fail(`${name} must be a boolean`);
  return value;
}

function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function enumValue<T extends string>(value: unknown, name: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail(`${name} is invalid`);
  return value as T;
}

function sortedUnique(
  value: unknown,
  name: string,
  maxItems: number,
  validate: (entry: string, index: number) => void,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(`${name} must be an array of at most ${maxItems} items`);
  const result = value.map((entry, index) => {
    const item = text(entry, `${name}[${index}]`, undefined, 256);
    validate(item, index);
    return item;
  });
  if (new Set(result).size !== result.length) fail(`${name} contains duplicates`);
  return result.sort();
}

function json(value: unknown, name: string, depth = 0): JsonValue {
  if (depth > MAX_JSON_DEPTH) fail(`${name} exceeds maximum nesting depth`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${name} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ENTRIES) fail(`${name} contains too many entries`);
    return value.map((entry, index) => json(entry, `${name}[${index}]`, depth + 1));
  }
  const entries = Object.entries(record(value, name));
  if (entries.length > MAX_JSON_ENTRIES) fail(`${name} contains too many entries`);
  const result: JsonObject = {};
  for (const [key, entry] of entries) {
    if (FORBIDDEN_ARGUMENT_KEYS.has(key.toLowerCase().replace(/[_-]/g, ""))) {
      fail(`${name}.${key} would expose a generic product control`);
    }
    result[key] = json(entry, `${name}.${key}`, depth + 1);
  }
  return result;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

export function validateAccessibilityTarget(value: unknown, name = "target"): AccessibilityTarget {
  const target = record(value, name);
  exactKeys(target, ["targetId", "role", "label"], name);
  return {
    targetId: text(target.targetId, `${name}.targetId`, SAFE_TARGET_ID, 128),
    role: enumValue(target.role, `${name}.role`, ["button", "link", "field", "list", "region", "surface", "terminal"] as const),
    label: text(target.label, `${name}.label`, undefined, 256),
  };
}

export function validateProductActionDefinition(value: unknown): ProductActionDefinition {
  const definition = record(value, "actionDefinition");
  exactKeys(
    definition,
    ["id", "version", "surface", "target", "allowedArgumentKeys", "requiredScopes", "riskClass", "humanAdmitRequired"],
    "actionDefinition",
  );
  const allowedArgumentKeys = sortedUnique(definition.allowedArgumentKeys, "actionDefinition.allowedArgumentKeys", 32, (entry, index) => {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(entry)) fail(`actionDefinition.allowedArgumentKeys[${index}] is invalid`);
    if (FORBIDDEN_ARGUMENT_KEYS.has(entry.toLowerCase().replace(/[_-]/g, ""))) {
      fail(`actionDefinition.allowedArgumentKeys[${index}] would expose a generic product control`);
    }
  });
  const riskClass = enumValue(definition.riskClass, "actionDefinition.riskClass", ["read", "write", "privileged"] as const);
  const humanAdmitRequired = bool(definition.humanAdmitRequired, "actionDefinition.humanAdmitRequired");
  // The human boundary is a property of the catalog, not of a caller flag: a privileged
  // action cannot be published as self-admitting.
  if (riskClass === "privileged" && !humanAdmitRequired) fail("a privileged action must require Human Admit");
  return {
    id: text(definition.id, "actionDefinition.id", SAFE_ID, 128),
    version: text(definition.version, "actionDefinition.version", SAFE_VERSION, 64),
    surface: enumValue(definition.surface, "actionDefinition.surface", ["web", "mobile", "terminal", "qa-automation"] as const),
    target: validateAccessibilityTarget(definition.target, "actionDefinition.target"),
    allowedArgumentKeys,
    requiredScopes: sortedUnique(definition.requiredScopes, "actionDefinition.requiredScopes", 32, (entry, index) => {
      if (!SAFE_SCOPE.test(entry)) fail(`actionDefinition.requiredScopes[${index}] is invalid`);
    }),
    riskClass,
    humanAdmitRequired,
  };
}

// UX-FND-002. Duplicate or missing target identities fail closed, so a catalog cannot ship
// two elements that address the same platform-neutral ID.
export function validateProductActionCatalog(values: readonly unknown[]): Map<string, ProductActionDefinition> {
  if (values.length === 0 || values.length > 512) fail("action catalog is empty or unbounded");
  const catalog = new Map<string, ProductActionDefinition>();
  const targets = new Set<string>();
  for (const value of values) {
    const definition = validateProductActionDefinition(value);
    if (catalog.has(definition.id)) fail(`duplicate action ID: ${definition.id}`);
    if (targets.has(definition.target.targetId)) fail(`duplicate accessibility target: ${definition.target.targetId}`);
    catalog.set(definition.id, definition);
    targets.add(definition.target.targetId);
  }
  return catalog;
}

export function validateProductAuthorization(value: unknown, name = "authorization"): ProductAuthorization {
  const authorization = record(value, name);
  exactKeys(authorization, ["actorKind", "actorId", "scopes", "nonce", "issuedAtEpochMs", "expiresAtEpochMs"], name);
  const issuedAtEpochMs = integer(authorization.issuedAtEpochMs, `${name}.issuedAtEpochMs`, 1, Number.MAX_SAFE_INTEGER);
  const expiresAtEpochMs = integer(authorization.expiresAtEpochMs, `${name}.expiresAtEpochMs`, 1, Number.MAX_SAFE_INTEGER);
  if (expiresAtEpochMs <= issuedAtEpochMs) fail(`${name} must expire after it is issued`);
  if (expiresAtEpochMs - issuedAtEpochMs > MAX_AUTHORIZATION_MS) fail(`${name} exceeds the maximum authorization window`);
  return {
    actorKind: enumValue(authorization.actorKind, `${name}.actorKind`, ["human", "agent"] as const),
    actorId: text(authorization.actorId, `${name}.actorId`, SAFE_ID, 128),
    scopes: sortedUnique(authorization.scopes, `${name}.scopes`, 32, (entry, index) => {
      if (!SAFE_SCOPE.test(entry)) fail(`${name}.scopes[${index}] is invalid`);
    }),
    nonce: text(authorization.nonce, `${name}.nonce`, SHA_256, 64),
    issuedAtEpochMs,
    expiresAtEpochMs,
  };
}

export function validateProductAction(value: unknown): ProductAction {
  const action = record(value, "productAction");
  exactKeys(
    action,
    ["schema", "requestId", "actionId", "actionVersion", "surface", "environment", "target", "arguments", "authorization", "exclusions"],
    "productAction",
  );
  if (action.schema !== PRODUCT_ACTION_SCHEMA) fail("productAction.schema is unsupported");
  const argumentsRecord = record(action.arguments, "productAction.arguments");
  return {
    schema: PRODUCT_ACTION_SCHEMA,
    requestId: text(action.requestId, "productAction.requestId", SAFE_ID, 128),
    actionId: text(action.actionId, "productAction.actionId", SAFE_ID, 128),
    actionVersion: text(action.actionVersion, "productAction.actionVersion", SAFE_VERSION, 64),
    surface: enumValue(action.surface, "productAction.surface", ["web", "mobile", "terminal", "qa-automation"] as const),
    environment: enumValue(action.environment, "productAction.environment", ["local", "cloud", "local-cloud"] as const),
    target: validateAccessibilityTarget(action.target, "productAction.target"),
    arguments: json(argumentsRecord, "productAction.arguments") as JsonObject,
    authorization: validateProductAuthorization(action.authorization),
    exclusions: sortedUnique(action.exclusions, "productAction.exclusions", 32, (entry, index) => {
      if (!SAFE_ID.test(entry)) fail(`productAction.exclusions[${index}] is invalid`);
    }),
  };
}

// UX-FND-001 and UX-FND-003 together: the action must exist in the catalog with the exact
// version, its argument keys must be admitted, its target must match, the actor must hold
// every required scope, and the authorization must still be live at the observed instant.
export function admitProductAction(
  action: ProductAction,
  catalog: ReadonlyMap<string, ProductActionDefinition>,
  nowEpochMs: number,
): ProductActionDefinition {
  const definition = catalog.get(action.actionId);
  if (!definition) fail("productAction.actionId is not an admitted action");
  if (definition.version !== action.actionVersion) fail("productAction.actionVersion does not match the admitted action");
  if (definition.surface !== action.surface) fail("productAction.surface does not match the admitted action");
  if (
    definition.target.targetId !== action.target.targetId ||
    definition.target.role !== action.target.role ||
    definition.target.label !== action.target.label
  ) {
    fail("productAction.target does not match the admitted accessibility identity");
  }
  for (const key of Object.keys(action.arguments)) {
    if (!definition.allowedArgumentKeys.includes(key)) fail(`productAction.arguments.${key} is not admitted`);
  }
  for (const scope of definition.requiredScopes) {
    if (!action.authorization.scopes.includes(scope)) fail(`productAction.authorization is missing scope: ${scope}`);
  }
  if (nowEpochMs < action.authorization.issuedAtEpochMs) fail("productAction.authorization is not yet valid");
  if (nowEpochMs >= action.authorization.expiresAtEpochMs) fail("productAction.authorization has expired");
  return definition;
}

export function productActionDigest(action: ProductAction): string {
  return createHash("sha256").update(canonical(action)).digest("hex");
}

export function validateProjectionLimits(value: unknown, name = "projection"): ProjectionLimits {
  const projection = record(value, name);
  exactKeys(projection, ["maxFrameBytes", "maxFrames", "maxDurationMs", "maxFramesPerSecond", "mediaTypes"], name);
  return {
    maxFrameBytes: integer(projection.maxFrameBytes, `${name}.maxFrameBytes`, 1, MAX_PROJECTION_BYTES),
    maxFrames: integer(projection.maxFrames, `${name}.maxFrames`, 1, 100_000),
    maxDurationMs: integer(projection.maxDurationMs, `${name}.maxDurationMs`, 1, MAX_PROJECTION_MS),
    maxFramesPerSecond: integer(projection.maxFramesPerSecond, `${name}.maxFramesPerSecond`, 1, 120),
    mediaTypes: sortedUnique(projection.mediaTypes, `${name}.mediaTypes`, 8, (entry, index) => {
      if (!SAFE_MEDIA.test(entry)) fail(`${name}.mediaTypes[${index}] is invalid`);
    }),
  };
}

export function validateProductAdapterSubject(value: unknown, name = "adapter"): ProductAdapterSubject {
  const adapter = record(value, name);
  exactKeys(adapter, ["id", "version", "sha256", "implementation", "availability", "liveEvidence"], name);
  const implementation = enumValue(adapter.implementation, `${name}.implementation`, ["IMPLEMENTED", "NOT_IMPLEMENTED"] as const);
  const availability = enumValue(adapter.availability, `${name}.availability`, ["AVAILABLE", "ABSENT", "REFUSED_POLICY"] as const);
  const liveEvidence = enumValue(adapter.liveEvidence, `${name}.liveEvidence`, ["PASS", "FAIL", "NOT_EXERCISED"] as const);
  // UX-FND-005. Neither shipped source nor an available adapter is live evidence.
  if (implementation === "NOT_IMPLEMENTED" && liveEvidence !== "NOT_EXERCISED") {
    fail(`${name} cannot report live evidence for an unimplemented adapter`);
  }
  if (availability !== "AVAILABLE" && liveEvidence === "PASS") {
    fail(`${name} cannot report PASS live evidence while unavailable`);
  }
  return {
    id: text(adapter.id, `${name}.id`, SAFE_ID, 128),
    version: text(adapter.version, `${name}.version`, SAFE_VERSION, 64),
    sha256: text(adapter.sha256, `${name}.sha256`, SHA_256, 64),
    implementation,
    availability,
    liveEvidence,
  };
}

export function validateProductAutomationRequest(value: unknown): ProductAutomationRequest {
  const request = record(value, "automationRequest");
  exactKeys(request, ["schema", "requestId", "actionDigest", "adapter", "projection", "artifactKinds", "exclusions"], "automationRequest");
  if (request.schema !== PRODUCT_AUTOMATION_REQUEST_SCHEMA) fail("automationRequest.schema is unsupported");
  return {
    schema: PRODUCT_AUTOMATION_REQUEST_SCHEMA,
    requestId: text(request.requestId, "automationRequest.requestId", SAFE_ID, 128),
    actionDigest: text(request.actionDigest, "automationRequest.actionDigest", SHA_256, 64),
    adapter: validateProductAdapterSubject(request.adapter, "automationRequest.adapter"),
    projection: validateProjectionLimits(request.projection, "automationRequest.projection"),
    artifactKinds: sortedUnique(request.artifactKinds, "automationRequest.artifactKinds", 16, (entry, index) => {
      if (!SAFE_ID.test(entry)) fail(`automationRequest.artifactKinds[${index}] is invalid`);
    }),
    exclusions: sortedUnique(request.exclusions, "automationRequest.exclusions", 32, (entry, index) => {
      if (!SAFE_ID.test(entry)) fail(`automationRequest.exclusions[${index}] is invalid`);
    }),
  };
}

// UX-FND-006. Frames are checked against the admitted bounds as a whole sequence, so an
// unbounded or rate-exceeding stream fails instead of being truncated silently.
export function validateProjectionSequence(
  frames: readonly unknown[],
  limits: ProjectionLimits,
): ProjectionFrame[] {
  if (frames.length > limits.maxFrames) fail("projection exceeds its admitted frame count");
  const result: ProjectionFrame[] = frames.map((value, index) => {
    const frame = record(value, `projectionFrame[${index}]`);
    exactKeys(frame, ["sequence", "capturedAtEpochMs", "mediaType", "bytes", "sha256"], `projectionFrame[${index}]`);
    const mediaType = text(frame.mediaType, `projectionFrame[${index}].mediaType`, SAFE_MEDIA, 128);
    if (!limits.mediaTypes.includes(mediaType)) fail(`projectionFrame[${index}].mediaType is not admitted`);
    return {
      sequence: integer(frame.sequence, `projectionFrame[${index}].sequence`, 0, limits.maxFrames - 1),
      capturedAtEpochMs: integer(frame.capturedAtEpochMs, `projectionFrame[${index}].capturedAtEpochMs`, 1, Number.MAX_SAFE_INTEGER),
      mediaType,
      bytes: integer(frame.bytes, `projectionFrame[${index}].bytes`, 1, limits.maxFrameBytes),
      sha256: text(frame.sha256, `projectionFrame[${index}].sha256`, SHA_256, 64),
    };
  });
  for (let index = 1; index < result.length; index += 1) {
    if (result[index].sequence !== result[index - 1].sequence + 1) fail("projection frames are not contiguous");
    if (result[index].capturedAtEpochMs < result[index - 1].capturedAtEpochMs) fail("projection frames move backwards in time");
  }
  if (result.length >= 2) {
    const spanMs = result[result.length - 1].capturedAtEpochMs - result[0].capturedAtEpochMs;
    if (spanMs > limits.maxDurationMs) fail("projection exceeds its admitted duration");
    // A single-millisecond span still has to respect the rate ceiling, so compare against a
    // floor of one millisecond rather than dividing by zero.
    if (result.length > (Math.max(spanMs, 1) / 1000) * limits.maxFramesPerSecond + 1) {
      fail("projection exceeds its admitted frame rate");
    }
  }
  return result;
}

export function validateProductCleanupReceipt(value: unknown, name = "cleanup"): ProductCleanupReceipt {
  const cleanup = record(value, name);
  exactKeys(cleanup, ["state", "sessionClosed", "projectionStopped", "residue", "detail"], name);
  const state = enumValue(cleanup.state, `${name}.state`, ["PASS", "FAIL", "NOT_EXERCISED"] as const);
  const residue = sortedUnique(cleanup.residue, `${name}.residue`, 64, (entry, index) => {
    if (entry.length > 256) fail(`${name}.residue[${index}] is unbounded`);
  });
  if (state === "PASS" && residue.length > 0) fail(`${name} cannot pass while residue remains`);
  return {
    state,
    sessionClosed: bool(cleanup.sessionClosed, `${name}.sessionClosed`),
    projectionStopped: bool(cleanup.projectionStopped, `${name}.projectionStopped`),
    residue,
    detail: text(cleanup.detail, `${name}.detail`, undefined, 512),
  };
}

function artifacts(value: unknown, name: string): ArtifactRef[] {
  if (!Array.isArray(value) || value.length > 32) fail(`${name} must be an array of at most 32 items`);
  return value.map((entry, index) => {
    const artifact = record(entry, `${name}[${index}]`);
    for (const key of Object.keys(artifact)) {
      if (!["kind", "sha256", "path"].includes(key)) fail(`${name}[${index}].${key} is not allowed`);
    }
    const result: ArtifactRef = {
      kind: text(artifact.kind, `${name}[${index}].kind`, SAFE_ID, 128),
      sha256: text(artifact.sha256, `${name}[${index}].sha256`, SHA_256, 64),
    };
    if (Object.hasOwn(artifact, "path")) result.path = text(artifact.path, `${name}[${index}].path`, undefined, 255);
    return result;
  });
}

export function validateProductActionReceipt(value: unknown): ProductActionReceipt {
  const receipt = record(value, "productReceipt");
  exactKeys(
    receipt,
    ["schema", "requestId", "actionDigest", "adapter", "environment", "lifecycle", "outcome", "state", "frames", "artifacts", "cleanup", "exclusions", "detail"],
    "productReceipt",
  );
  if (receipt.schema !== PRODUCT_ACTION_RECEIPT_SCHEMA) fail("productReceipt.schema is unsupported");
  if (!Array.isArray(receipt.lifecycle)) fail("productReceipt.lifecycle must be an array");
  const lifecycle = receipt.lifecycle as ProductState[];
  const outcome = validateProductLifecycle(lifecycle);
  if (receipt.outcome !== outcome) fail("productReceipt.outcome does not match its own lifecycle");
  // UX-FND-004. The evidence state is derived, never asserted by the producer.
  if (receipt.state !== productEvidenceForOutcome(outcome)) fail("productReceipt.state does not match its outcome");
  const cleanup = validateProductCleanupReceipt(receipt.cleanup, "productReceipt.cleanup");
  if (outcome === "COMPLETED" && cleanup.state !== "PASS") fail("a completed product action requires verified cleanup");
  return {
    schema: PRODUCT_ACTION_RECEIPT_SCHEMA,
    requestId: text(receipt.requestId, "productReceipt.requestId", SAFE_ID, 128),
    actionDigest: text(receipt.actionDigest, "productReceipt.actionDigest", SHA_256, 64),
    adapter: validateProductAdapterSubject(receipt.adapter, "productReceipt.adapter"),
    environment: enumValue(receipt.environment, "productReceipt.environment", ["local", "cloud", "local-cloud"] as const),
    lifecycle: [...lifecycle],
    outcome,
    state: productEvidenceForOutcome(outcome),
    frames: integer(receipt.frames, "productReceipt.frames", 0, 100_000),
    artifacts: artifacts(receipt.artifacts, "productReceipt.artifacts"),
    cleanup,
    exclusions: sortedUnique(receipt.exclusions, "productReceipt.exclusions", 32, (entry, index) => {
      if (!SAFE_ID.test(entry)) fail(`productReceipt.exclusions[${index}] is invalid`);
    }),
    detail: text(receipt.detail, "productReceipt.detail", undefined, 512),
  };
}

// UX-FND-007. A receipt for a different or stale action cannot be presented as this one's.
export function assertProductReceiptMatchesAction(receiptValue: unknown, actionValue: unknown): void {
  const receipt = validateProductActionReceipt(receiptValue);
  const action = validateProductAction(actionValue);
  if (receipt.requestId !== action.requestId) fail("productReceipt.requestId does not match the action");
  if (receipt.actionDigest !== productActionDigest(action)) fail("productReceipt.actionDigest does not match the action");
  if (receipt.environment !== action.environment) fail("productReceipt.environment does not match the action");
  if (receipt.exclusions.join(" ") !== action.exclusions.join(" ")) {
    fail("productReceipt.exclusions do not match the action");
  }
}
