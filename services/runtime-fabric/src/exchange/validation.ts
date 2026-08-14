import { createHash } from "node:crypto";
import type { EvidenceState } from "../../../../packages/contracts/src/index.ts";
import { validateRuntimeExchangeLifecycle } from "./state-machine.ts";
import {
  RUNTIME_EXCHANGE_RECEIPT_SCHEMA,
  RUNTIME_EXCHANGE_REQUEST_SCHEMA,
  type RuntimeApiEventEnvelope,
  type RuntimeArtifactSubject,
  type RuntimeExchangeEnvelope,
  type RuntimeExchangeOutcome,
  type RuntimeExchangeReceipt,
  type RuntimeExchangeRequest,
  type RuntimeGitSubject,
  type RuntimeImmutableArtifactEnvelope,
  type RuntimePatchEnvelope,
  type RuntimePolicyEnvelope,
  type RuntimeReviewApproval,
  type RuntimeWriterLease,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const SAFE_MEDIA = /^[A-Za-z0-9][A-Za-z0-9.+-]*\/[A-Za-z0-9][A-Za-z0-9.+-]*$/;
const MAX_BYTES = 1_073_741_824;
const MAX_PATHS = 10_000;
const MAX_LEASE_MS = 86_400_000;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const FORBIDDEN_PATH_SEGMENTS = new Set([
  ".env",
  ".git",
  ".ssh",
  "browser-profile",
  "cookies",
  "credentials",
  "device-session",
  "keychain",
  "private-key",
  "secrets",
  "session",
]);

function fail(message: string): never {
  throw new Error(`invalid runtime exchange contract: ${message}`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${name} must be a plain own-key object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) fail(`${name}.${key} is forbidden`);
    if (!allowedSet.has(key)) fail(`${name}.${key} is not allowed`);
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) fail(`${name}.${key} is required as an own property`);
  }
}

function requiredString(value: unknown, name: string, pattern: RegExp, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || !pattern.test(value)) {
    fail(`${name} is invalid`);
  }
  if (/\p{Cc}/u.test(value)) fail(`${name} contains control characters`);
  return value;
}

function enumValue<T extends string>(value: unknown, name: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail(`${name} is invalid`);
  return value as T;
}

function safeInteger(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function portableRepository(value: unknown, name: string): string {
  const repository = requiredString(value, name, /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/, 512);
  const parsed = new URL(repository);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) fail(`${name} must not contain credentials or query state`);
  return repository;
}

function normalizedPath(value: unknown, name: string): string {
  const path = requiredString(value, name, /^[A-Za-z0-9._/-]+$/, 512);
  if (path.startsWith("/") || path.startsWith("~") || /^[A-Za-z]:/.test(path) || path.includes("\\")) {
    fail(`${name} must be repository-relative`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    fail(`${name} must be normalized and traversal-free`);
  }
  for (const segment of segments) {
    const lowered = segment.toLowerCase();
    if (
      FORBIDDEN_PATH_SEGMENTS.has(lowered) ||
      lowered.endsWith(".pem") ||
      lowered.endsWith(".key") ||
      lowered.endsWith(".p12") ||
      lowered.endsWith(".pfx")
    ) {
      fail(`${name} enters a forbidden secret/session path class`);
    }
  }
  return path;
}

function sortedUniqueStrings(
  value: unknown,
  name: string,
  maxItems: number,
  validator: (entry: unknown, name: string) => string,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(`${name} must contain at most ${maxItems} items`);
  const result = value.map((entry, index) => validator(entry, `${name}[${index}]`));
  if (new Set(result).size !== result.length) fail(`${name} contains duplicates`);
  return result.sort();
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function assertNonOverlappingRoots(roots: readonly string[], name: string): void {
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (pathsOverlap(roots[left], roots[right])) fail(`${name} contains overlapping roots`);
    }
  }
}

function validateArtifact(value: unknown, name: string): RuntimeArtifactSubject {
  const artifact = record(value, name);
  exactKeys(artifact, ["sha256", "bytes", "mediaType"], name);
  return {
    sha256: requiredString(artifact.sha256, `${name}.sha256`, SHA_256, 64),
    bytes: safeInteger(artifact.bytes, `${name}.bytes`, 0, MAX_BYTES),
    mediaType: requiredString(artifact.mediaType, `${name}.mediaType`, SAFE_MEDIA, 255),
  };
}

function validateGitSubject(value: unknown, name: string): RuntimeGitSubject {
  const subject = record(value, name);
  exactKeys(subject, ["repository", "commit", "tree"], name);
  return {
    repository: portableRepository(subject.repository, `${name}.repository`),
    commit: requiredString(subject.commit, `${name}.commit`, GIT_OID, 40),
    tree: requiredString(subject.tree, `${name}.tree`, GIT_OID, 40),
  };
}

function validateLease(value: unknown, name: string): RuntimeWriterLease {
  const lease = record(value, name);
  exactKeys(
    lease,
    [
      "leaseId",
      "writerId",
      "branch",
      "repository",
      "baseCommit",
      "baseTree",
      "writableRoots",
      "issuedAtEpochMs",
      "expiresAtEpochMs",
    ],
    name,
  );
  const writableRoots = sortedUniqueStrings(lease.writableRoots, `${name}.writableRoots`, 256, normalizedPath);
  if (writableRoots.length === 0) fail(`${name}.writableRoots must not be empty`);
  assertNonOverlappingRoots(writableRoots, `${name}.writableRoots`);
  const issuedAtEpochMs = safeInteger(lease.issuedAtEpochMs, `${name}.issuedAtEpochMs`, 0, Number.MAX_SAFE_INTEGER);
  const expiresAtEpochMs = safeInteger(lease.expiresAtEpochMs, `${name}.expiresAtEpochMs`, 1, Number.MAX_SAFE_INTEGER);
  if (expiresAtEpochMs <= issuedAtEpochMs || expiresAtEpochMs - issuedAtEpochMs > MAX_LEASE_MS) {
    fail(`${name} has an invalid or overlong lifetime`);
  }
  return {
    leaseId: requiredString(lease.leaseId, `${name}.leaseId`, SAFE_ID, 128),
    writerId: requiredString(lease.writerId, `${name}.writerId`, SAFE_ID, 128),
    branch: requiredString(lease.branch, `${name}.branch`, SAFE_BRANCH, 255),
    repository: portableRepository(lease.repository, `${name}.repository`),
    baseCommit: requiredString(lease.baseCommit, `${name}.baseCommit`, GIT_OID, 40),
    baseTree: requiredString(lease.baseTree, `${name}.baseTree`, GIT_OID, 40),
    writableRoots,
    issuedAtEpochMs,
    expiresAtEpochMs,
  };
}

function validateEnvelope(value: unknown, name: string): RuntimeExchangeEnvelope {
  const envelope = record(value, name);
  const kind = enumValue(
    envelope.kind,
    `${name}.kind`,
    ["git-patch", "content-addressed-artifact", "policy-epoch", "api-event"] as const,
  );
  if (kind === "git-patch") {
    exactKeys(envelope, ["kind", "artifact", "baseCommit", "baseTree", "resultTree", "changedPaths"], name);
    const result: RuntimePatchEnvelope = {
      kind,
      artifact: validateArtifact(envelope.artifact, `${name}.artifact`),
      baseCommit: requiredString(envelope.baseCommit, `${name}.baseCommit`, GIT_OID, 40),
      baseTree: requiredString(envelope.baseTree, `${name}.baseTree`, GIT_OID, 40),
      resultTree: requiredString(envelope.resultTree, `${name}.resultTree`, GIT_OID, 40),
      changedPaths: sortedUniqueStrings(envelope.changedPaths, `${name}.changedPaths`, MAX_PATHS, normalizedPath),
    };
    if (result.changedPaths.length === 0) fail(`${name}.changedPaths must not be empty`);
    if (!new Set(["text/x-diff", "text/x-patch"]).has(result.artifact.mediaType)) {
      fail(`${name}.artifact must be a patch media type`);
    }
    if (result.baseTree === result.resultTree) fail(`${name}.resultTree must differ from baseTree`);
    return result;
  }
  if (kind === "content-addressed-artifact") {
    exactKeys(envelope, ["kind", "artifact"], name);
    const result: RuntimeImmutableArtifactEnvelope = {
      kind,
      artifact: validateArtifact(envelope.artifact, `${name}.artifact`),
    };
    return result;
  }
  if (kind === "policy-epoch") {
    exactKeys(envelope, ["kind", "artifact", "currentEpoch", "nextEpoch"], name);
    const currentEpoch = safeInteger(envelope.currentEpoch, `${name}.currentEpoch`, 0, Number.MAX_SAFE_INTEGER - 1);
    const nextEpoch = safeInteger(envelope.nextEpoch, `${name}.nextEpoch`, 1, Number.MAX_SAFE_INTEGER);
    if (nextEpoch !== currentEpoch + 1) fail(`${name}.nextEpoch must advance exactly one epoch`);
    const result: RuntimePolicyEnvelope = {
      kind,
      artifact: validateArtifact(envelope.artifact, `${name}.artifact`),
      currentEpoch,
      nextEpoch,
    };
    return result;
  }
  exactKeys(envelope, ["kind", "artifact", "stream", "sequence"], name);
  const result: RuntimeApiEventEnvelope = {
    kind,
    artifact: validateArtifact(envelope.artifact, `${name}.artifact`),
    stream: requiredString(envelope.stream, `${name}.stream`, SAFE_ID, 128),
    sequence: safeInteger(envelope.sequence, `${name}.sequence`, 1, Number.MAX_SAFE_INTEGER),
  };
  return result;
}

function validateReview(value: unknown, name: string): RuntimeReviewApproval {
  const review = record(value, name);
  exactKeys(review, ["schema", "requestDigest", "reviewerClass", "approvalRef"], name);
  if (review.schema !== "agent-shield/exchange-review-approval/v1") fail(`${name}.schema is unsupported`);
  return {
    schema: "agent-shield/exchange-review-approval/v1",
    requestDigest: requiredString(review.requestDigest, `${name}.requestDigest`, SHA_256, 64),
    reviewerClass: enumValue(review.reviewerClass, `${name}.reviewerClass`, ["human", "trusted-automation"] as const),
    approvalRef: validateArtifact(review.approvalRef, `${name}.approvalRef`),
  };
}

export function validateRuntimeExchangeRequest(value: unknown): RuntimeExchangeRequest {
  const request = record(value, "exchange request");
  exactKeys(
    request,
    [
      "schema",
      "requestId",
      "observedAtEpochMs",
      "sourcePlane",
      "targetPlane",
      "dataClass",
      "strategy",
      "source",
      "lease",
      "envelope",
      "review",
      "exclusions",
    ],
    "exchange request",
  );
  if (request.schema !== RUNTIME_EXCHANGE_REQUEST_SCHEMA) fail("exchange request.schema is unsupported");
  const sourcePlane = enumValue(request.sourcePlane, "exchange request.sourcePlane", ["local", "cloud"] as const);
  const targetPlane = enumValue(request.targetPlane, "exchange request.targetPlane", ["local", "cloud"] as const);
  if (sourcePlane === targetPlane) fail("exchange request must cross planes");
  const dataClass = enumValue(
    request.dataClass,
    "exchange request.dataClass",
    ["source", "artifact", "policy", "database", "secret", "session"] as const,
  );
  const strategy = enumValue(
    request.strategy,
    "exchange request.strategy",
    [
      "git-patch",
      "content-addressed-artifact",
      "policy-epoch",
      "api-event",
      "newest-wins",
      "prefer-cloud",
      "prefer-beta",
      "bidirectional-folder-sync",
    ] as const,
  );
  const source = dataClass === "source"
    ? validateGitSubject(request.source, "exchange request.source")
    : validateArtifact(request.source, "exchange request.source");
  const lease = request.lease === null ? null : validateLease(request.lease, "exchange request.lease");
  const envelope = request.envelope === null ? null : validateEnvelope(request.envelope, "exchange request.envelope");
  const review = request.review === null ? null : validateReview(request.review, "exchange request.review");
  const exclusions = sortedUniqueStrings(request.exclusions, "exchange request.exclusions", 64, (entry, name) =>
    requiredString(entry, name, SAFE_ID, 128));
  return deepFreeze({
    schema: RUNTIME_EXCHANGE_REQUEST_SCHEMA,
    requestId: requiredString(request.requestId, "exchange request.requestId", SAFE_ID, 128),
    observedAtEpochMs: safeInteger(request.observedAtEpochMs, "exchange request.observedAtEpochMs", 0, Number.MAX_SAFE_INTEGER),
    sourcePlane,
    targetPlane,
    dataClass,
    strategy,
    source,
    lease,
    envelope,
    review,
    exclusions,
  });
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
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

export function runtimeExchangeRequestDigest(request: RuntimeExchangeRequest): string {
  return createHash("sha256").update(canonical(request)).digest("hex");
}

export function runtimeWriterLeaseDigest(lease: RuntimeWriterLease): string {
  return createHash("sha256").update(canonical(lease)).digest("hex");
}

export function evidenceForRuntimeExchangeOutcome(outcome: RuntimeExchangeOutcome): EvidenceState {
  return outcome === "READY_FOR_REVIEW" || outcome === "READY_FOR_APPLY" ? "PASS" : "FAIL";
}

export function assertRuntimeExchangeReceiptMatchesRequest(value: unknown, requestValue: unknown): void {
  const request = validateRuntimeExchangeRequest(requestValue);
  const receipt = record(value, "exchange receipt");
  exactKeys(
    receipt,
    [
      "schema",
      "requestId",
      "requestDigest",
      "lifecycle",
      "outcome",
      "state",
      "sourcePlane",
      "targetPlane",
      "dataClass",
      "strategy",
      "source",
      "leaseDigest",
      "envelope",
      "review",
      "applicationState",
      "exclusions",
      "detail",
    ],
    "exchange receipt",
  );
  if (receipt.schema !== RUNTIME_EXCHANGE_RECEIPT_SCHEMA) fail("exchange receipt.schema mismatch");
  if (receipt.requestId !== request.requestId) fail("exchange receipt.requestId mismatch");
  if (receipt.requestDigest !== runtimeExchangeRequestDigest(request)) fail("exchange receipt.requestDigest mismatch");
  if (receipt.sourcePlane !== request.sourcePlane || receipt.targetPlane !== request.targetPlane) fail("exchange receipt plane mismatch");
  if (receipt.dataClass !== request.dataClass || receipt.strategy !== request.strategy) fail("exchange receipt classification mismatch");
  if (canonical(receipt.source) !== canonical(request.source)) fail("exchange receipt source mismatch");
  const expectedLeaseDigest = request.lease ? runtimeWriterLeaseDigest(request.lease) : null;
  if (receipt.leaseDigest !== expectedLeaseDigest) fail("exchange receipt lease digest mismatch");
  if (canonical(receipt.envelope) !== canonical(request.envelope)) fail("exchange receipt envelope mismatch");
  if (canonical(receipt.review) !== canonical(request.review)) fail("exchange receipt review mismatch");
  if (!Array.isArray(receipt.lifecycle)) fail("exchange receipt.lifecycle must be an array");
  const lifecycle = receipt.lifecycle as RuntimeExchangeReceipt["lifecycle"];
  const outcome = validateRuntimeExchangeLifecycle(lifecycle);
  if (receipt.outcome !== outcome) fail("exchange receipt outcome mismatch");
  if (receipt.state !== evidenceForRuntimeExchangeOutcome(outcome)) fail("exchange receipt evidence state mismatch");
  if (receipt.applicationState !== "NOT_EXERCISED") fail("exchange receipt cannot claim patch application");
  if (!Array.isArray(receipt.exclusions) || canonical(receipt.exclusions) !== canonical(request.exclusions)) {
    fail("exchange receipt exclusions mismatch");
  }
  if (typeof receipt.detail !== "string" || receipt.detail.length === 0 || receipt.detail.length > 1024 || /\p{Cc}/u.test(receipt.detail)) {
    fail("exchange receipt detail is not portable bounded metadata");
  }
}
