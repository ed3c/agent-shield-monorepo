import {
  assertRuntimeExchangeReceiptMatchesRequest,
  planRuntimeExchange,
  runtimeExchangeRequestDigest,
  validateRuntimeExchangeRequest,
} from "./index.ts";
import { assertRuntimeExchangeTransition } from "./state-machine.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`RT-XCHG ${message}`);
}

function red(action: () => unknown, message: string): void {
  let failed = false;
  try { action(); } catch { failed = true; }
  ok(failed, `${message} stayed green`);
}

function sourceRequest(): Record<string, unknown> {
  return {
    schema: "agent-shield/runtime-exchange-request/v1",
    requestId: "rt-xchg-source",
    observedAtEpochMs: 1_000,
    sourcePlane: "local",
    targetPlane: "cloud",
    dataClass: "source",
    strategy: "git-patch",
    source: {
      repository: "https://github.com/ed3c/agent-shield-monorepo",
      commit: "a".repeat(40),
      tree: "b".repeat(40),
    },
    lease: {
      leaseId: "lease-1",
      writerId: "worker-1",
      branch: "feat/p3-hybrid-exchange",
      repository: "https://github.com/ed3c/agent-shield-monorepo",
      baseCommit: "a".repeat(40),
      baseTree: "b".repeat(40),
      writableRoots: ["services/runtime-fabric/src/exchange"],
      issuedAtEpochMs: 900,
      expiresAtEpochMs: 2_000,
    },
    envelope: {
      kind: "git-patch",
      artifact: { sha256: "c".repeat(64), bytes: 128, mediaType: "text/x-diff" },
      baseCommit: "a".repeat(40),
      baseTree: "b".repeat(40),
      resultTree: "d".repeat(40),
      changedPaths: ["services/runtime-fabric/src/exchange/planner.ts"],
    },
    review: null,
    exclusions: ["secrets", "sessions", "timestamp-authority"],
  };
}

function artifactRequest(): Record<string, unknown> {
  return {
    schema: "agent-shield/runtime-exchange-request/v1",
    requestId: "rt-xchg-artifact",
    observedAtEpochMs: 1_000,
    sourcePlane: "cloud",
    targetPlane: "local",
    dataClass: "artifact",
    strategy: "content-addressed-artifact",
    source: { sha256: "1".repeat(64), bytes: 64, mediaType: "application/json" },
    lease: null,
    envelope: {
      kind: "content-addressed-artifact",
      artifact: { sha256: "1".repeat(64), bytes: 64, mediaType: "application/json" },
    },
    review: null,
    exclusions: ["mutable-reference"],
  };
}

function policyRequest(): Record<string, unknown> {
  return {
    schema: "agent-shield/runtime-exchange-request/v1",
    requestId: "rt-xchg-policy",
    observedAtEpochMs: 1_000,
    sourcePlane: "local",
    targetPlane: "cloud",
    dataClass: "policy",
    strategy: "policy-epoch",
    source: { sha256: "2".repeat(64), bytes: 32, mediaType: "application/json" },
    lease: null,
    envelope: {
      kind: "policy-epoch",
      artifact: { sha256: "3".repeat(64), bytes: 48, mediaType: "application/json" },
      currentEpoch: 4,
      nextEpoch: 5,
    },
    review: null,
    exclusions: ["secret-values"],
  };
}

function databaseRequest(): Record<string, unknown> {
  return {
    schema: "agent-shield/runtime-exchange-request/v1",
    requestId: "rt-xchg-database",
    observedAtEpochMs: 1_000,
    sourcePlane: "cloud",
    targetPlane: "local",
    dataClass: "database",
    strategy: "api-event",
    source: { sha256: "4".repeat(64), bytes: 16, mediaType: "application/json" },
    lease: null,
    envelope: {
      kind: "api-event",
      artifact: { sha256: "5".repeat(64), bytes: 24, mediaType: "application/json" },
      stream: "runtime-events",
      sequence: 7,
    },
    review: null,
    exclusions: ["folder-replication"],
  };
}

export function runtimeExchangeSelftest(): void {
  const source = sourceRequest();
  const reviewPending = planRuntimeExchange(source);
  ok(
    reviewPending.outcome === "READY_FOR_REVIEW" &&
    reviewPending.state === "PASS" &&
    reviewPending.applicationState === "NOT_EXERCISED" &&
    Object.isFrozen(reviewPending),
    "source plan did not stop at subject-bound review",
  );
  assertRuntimeExchangeReceiptMatchesRequest(reviewPending, source);

  const normalizedSource = validateRuntimeExchangeRequest(source);
  const approvalDigest = runtimeExchangeRequestDigest({ ...normalizedSource, review: null });
  const approvedSource = structuredClone(source);
  approvedSource.review = {
    schema: "agent-shield/exchange-review-approval/v1",
    requestDigest: approvalDigest,
    reviewerClass: "human",
    approvalRef: { sha256: "6".repeat(64), bytes: 96, mediaType: "application/json" },
  };
  const approved = planRuntimeExchange(approvedSource);
  ok(approved.outcome === "READY_FOR_APPLY" && approved.applicationState === "NOT_EXERCISED", "approved source plan failed");
  assertRuntimeExchangeReceiptMatchesRequest(approved, approvedSource);

  const artifact = planRuntimeExchange(artifactRequest());
  ok(artifact.outcome === "READY_FOR_APPLY" && artifact.state === "PASS", "immutable artifact exchange failed");
  const policy = planRuntimeExchange(policyRequest());
  ok(policy.outcome === "READY_FOR_REVIEW", "policy epoch bypassed review");
  const database = planRuntimeExchange(databaseRequest());
  ok(database.outcome === "READY_FOR_APPLY", "database event exchange failed");

  for (const strategy of ["newest-wins", "prefer-cloud", "prefer-beta", "bidirectional-folder-sync"]) {
    const forbidden = structuredClone(source);
    forbidden.strategy = strategy;
    forbidden.envelope = null;
    ok(planRuntimeExchange(forbidden).outcome === "REFUSED_STRATEGY", `${strategy} was admitted`);
  }

  for (const dataClass of ["secret", "session"]) {
    const forbidden = artifactRequest();
    forbidden.dataClass = dataClass;
    ok(planRuntimeExchange(forbidden).outcome === "REFUSED_DATA_CLASS", `${dataClass} entered portable exchange`);
  }

  const expired = structuredClone(source);
  (expired.lease as Record<string, unknown>).expiresAtEpochMs = 1_000;
  ok(planRuntimeExchange(expired).outcome === "LEASE_EXPIRED", "expired lease stayed green");

  const futureLease = structuredClone(source);
  (futureLease.lease as Record<string, unknown>).issuedAtEpochMs = 1_100;
  ok(planRuntimeExchange(futureLease).outcome === "LEASE_MISMATCH", "future lease stayed green");

  const staleBase = structuredClone(source);
  ((staleBase.envelope as Record<string, unknown>).baseTree as string) = "e".repeat(40);
  ok(planRuntimeExchange(staleBase).outcome === "STALE_BASE", "stale patch base stayed green");

  const escapedPath = structuredClone(source);
  (escapedPath.envelope as Record<string, unknown>).changedPaths = ["apps/mobile-app/src/index.ts"];
  ok(planRuntimeExchange(escapedPath).outcome === "PATH_OUT_OF_SCOPE", "path lease escape stayed green");

  const secretPath = structuredClone(source);
  (secretPath.envelope as Record<string, unknown>).changedPaths = ["services/runtime-fabric/.env"];
  red(() => validateRuntimeExchangeRequest(secretPath), "secret path");

  const perennialBranch = structuredClone(source);
  (perennialBranch.lease as Record<string, unknown>).branch = "main";
  ok(planRuntimeExchange(perennialBranch).outcome === "LEASE_MISMATCH", "perennial branch writer stayed green");

  const badReview = structuredClone(approvedSource);
  (badReview.review as Record<string, unknown>).requestDigest = "7".repeat(64);
  ok(planRuntimeExchange(badReview).outcome === "INVALID_REVIEW", "stale review stayed green");

  const badEpoch = policyRequest();
  (badEpoch.envelope as Record<string, unknown>).nextEpoch = 7;
  red(() => validateRuntimeExchangeRequest(badEpoch), "policy epoch skip");

  const openRequest = sourceRequest();
  openRequest.unexpected = true;
  red(() => validateRuntimeExchangeRequest(openRequest), "open request schema");

  const inheritedRequest = Object.create(sourceRequest()) as Record<string, unknown>;
  red(() => validateRuntimeExchangeRequest(inheritedRequest), "inherited request fields");

  red(() => assertRuntimeExchangeTransition("REQUESTED", "READY_FOR_APPLY"), "state-machine skip");
  red(
    () => assertRuntimeExchangeReceiptMatchesRequest({ ...reviewPending, requestDigest: "8".repeat(64) }, source),
    "stale receipt digest",
  );
  red(
    () => assertRuntimeExchangeReceiptMatchesRequest({ ...reviewPending, applicationState: "PASS" }, source),
    "application overclaim",
  );
  red(
    () => assertRuntimeExchangeReceiptMatchesRequest({ ...reviewPending, unexpected: true }, source),
    "open receipt schema",
  );

  const reordered = sourceRequest();
  reordered.exclusions = [...(reordered.exclusions as string[])].reverse();
  const reorderedLease = reordered.lease as Record<string, unknown>;
  reorderedLease.writableRoots = [...(reorderedLease.writableRoots as string[])].reverse();
  ok(
    runtimeExchangeRequestDigest(validateRuntimeExchangeRequest(source)) ===
      runtimeExchangeRequestDigest(validateRuntimeExchangeRequest(reordered)),
    "canonical exchange digest depends on set order",
  );

  console.log("SELFTEST GREEN: RT-XCHG immutable exchange and repair contracts");
}

runtimeExchangeSelftest();
