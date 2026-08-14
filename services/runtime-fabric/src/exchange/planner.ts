import {
  RUNTIME_EXCHANGE_RECEIPT_SCHEMA,
  type RuntimeExchangeOutcome,
  type RuntimeExchangeReceipt,
  type RuntimeExchangeRequest,
  type RuntimePatchEnvelope,
} from "./types.ts";
import { RuntimeExchangeLifecycle } from "./state-machine.ts";
import {
  assertRuntimeExchangeReceiptMatchesRequest,
  deepFreeze,
  evidenceForRuntimeExchangeOutcome,
  runtimeExchangeRequestDigest,
  runtimeWriterLeaseDigest,
  validateRuntimeExchangeRequest,
} from "./validation.ts";

const forbiddenStrategies = new Set([
  "newest-wins",
  "prefer-cloud",
  "prefer-beta",
  "bidirectional-folder-sync",
]);

const expectedStrategies = {
  source: "git-patch",
  artifact: "content-addressed-artifact",
  policy: "policy-epoch",
  database: "api-event",
} as const;

function portableDetail(detail: string): string {
  return detail.length <= 1024 ? detail : `${detail.slice(0, 1021)}...`;
}

function receipt(
  request: RuntimeExchangeRequest,
  lifecycle: RuntimeExchangeLifecycle,
  outcome: RuntimeExchangeOutcome,
  detail: string,
): RuntimeExchangeReceipt {
  lifecycle.transition(outcome);
  const result: RuntimeExchangeReceipt = {
    schema: RUNTIME_EXCHANGE_RECEIPT_SCHEMA,
    requestId: request.requestId,
    requestDigest: runtimeExchangeRequestDigest(request),
    lifecycle: [...lifecycle.trace],
    outcome,
    state: evidenceForRuntimeExchangeOutcome(outcome),
    sourcePlane: request.sourcePlane,
    targetPlane: request.targetPlane,
    dataClass: request.dataClass,
    strategy: request.strategy,
    source: request.source,
    leaseDigest: request.lease ? runtimeWriterLeaseDigest(request.lease) : null,
    envelope: request.envelope,
    review: request.review,
    applicationState: "NOT_EXERCISED",
    exclusions: [...request.exclusions],
    detail: portableDetail(detail),
  };
  assertRuntimeExchangeReceiptMatchesRequest(result, request);
  return deepFreeze(result);
}

function pathWithinRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function validateSourceLease(
  request: RuntimeExchangeRequest,
  envelope: RuntimePatchEnvelope,
): RuntimeExchangeOutcome | null {
  const source = request.source;
  const lease = request.lease;
  if (!("commit" in source) || !lease) return "LEASE_MISMATCH";
  if (
    lease.repository !== source.repository ||
    lease.baseCommit !== source.commit ||
    lease.baseTree !== source.tree ||
    envelope.baseCommit !== source.commit ||
    envelope.baseTree !== source.tree
  ) {
    return "STALE_BASE";
  }
  if (lease.expiresAtEpochMs <= request.observedAtEpochMs) return "LEASE_EXPIRED";
  if (lease.issuedAtEpochMs > request.observedAtEpochMs) return "LEASE_MISMATCH";
  if (lease.branch === "main" || lease.branch === "master") return "LEASE_MISMATCH";
  if (envelope.changedPaths.some((path) => !lease.writableRoots.some((root) => pathWithinRoot(path, root)))) {
    return "PATH_OUT_OF_SCOPE";
  }
  return null;
}

function validatePayload(request: RuntimeExchangeRequest): RuntimeExchangeOutcome | null {
  const envelope = request.envelope;
  if (!envelope || envelope.kind !== request.strategy) return "INVALID_PAYLOAD";

  if (request.dataClass === "source") {
    if (envelope.kind !== "git-patch") return "INVALID_PAYLOAD";
    return validateSourceLease(request, envelope);
  }

  if (request.lease !== null) return "LEASE_MISMATCH";
  if (!("sha256" in request.source)) return "INVALID_PAYLOAD";

  if (request.dataClass === "artifact") {
    if (envelope.kind !== "content-addressed-artifact") return "INVALID_PAYLOAD";
    if (
      envelope.artifact.sha256 !== request.source.sha256 ||
      envelope.artifact.bytes !== request.source.bytes ||
      envelope.artifact.mediaType !== request.source.mediaType
    ) {
      return "INVALID_PAYLOAD";
    }
  }
  if (request.dataClass === "policy" && envelope.kind !== "policy-epoch") return "INVALID_PAYLOAD";
  if (request.dataClass === "database" && envelope.kind !== "api-event") return "INVALID_PAYLOAD";
  return null;
}

function approvalSubjectDigest(request: RuntimeExchangeRequest): string {
  return runtimeExchangeRequestDigest({ ...request, review: null });
}

function validateReview(request: RuntimeExchangeRequest): RuntimeExchangeOutcome | null {
  if (!request.review) return null;
  if (request.review.requestDigest !== approvalSubjectDigest(request)) return "INVALID_REVIEW";
  if (
    request.review.approvalRef.bytes === 0 ||
    request.review.approvalRef.mediaType !== "application/json"
  ) {
    return "INVALID_REVIEW";
  }
  return null;
}

export function planRuntimeExchange(value: unknown): RuntimeExchangeReceipt {
  const request = validateRuntimeExchangeRequest(value);
  const lifecycle = new RuntimeExchangeLifecycle();
  lifecycle.transition("CLASSIFIED");

  if (request.dataClass === "secret" || request.dataClass === "session") {
    return receipt(
      request,
      lifecycle,
      "REFUSED_DATA_CLASS",
      "secret and session bytes remain broker/host owned and cannot enter portable exchange",
    );
  }

  if (forbiddenStrategies.has(request.strategy)) {
    return receipt(
      request,
      lifecycle,
      "REFUSED_STRATEGY",
      "timestamp, preferred-plane, and bidirectional-folder source authority are forbidden",
    );
  }

  const expected = expectedStrategies[request.dataClass];
  if (request.strategy !== expected) {
    return receipt(request, lifecycle, "REFUSED_STRATEGY", `data class ${request.dataClass} requires ${expected}`);
  }

  lifecycle.transition("SUBJECT_VERIFIED");
  const payloadFailure = validatePayload(request);
  if (payloadFailure === "STALE_BASE") {
    return receipt(request, lifecycle, payloadFailure, "patch, lease, and immutable source base do not agree");
  }

  lifecycle.transition("LEASE_VERIFIED");
  if (payloadFailure) {
    return receipt(request, lifecycle, payloadFailure, "writer lease, path scope, or exchange payload is invalid");
  }

  lifecycle.transition("STRATEGY_VERIFIED");
  lifecycle.transition("PAYLOAD_VERIFIED");

  const reviewFailure = validateReview(request);
  if (reviewFailure) return receipt(request, lifecycle, reviewFailure, "review approval does not bind the exact request subject");

  const reviewRequired = request.dataClass === "source" || request.dataClass === "policy";
  if (reviewRequired && request.review === null) {
    lifecycle.transition("REVIEW_PENDING");
    return receipt(
      request,
      lifecycle,
      "READY_FOR_REVIEW",
      "deterministic exchange plan is valid; application remains blocked pending a subject-bound review approval",
    );
  }

  return receipt(
    request,
    lifecycle,
    "READY_FOR_APPLY",
    "deterministic exchange plan is valid; actual application remains NOT_EXERCISED and belongs to an admitted consumer",
  );
}
