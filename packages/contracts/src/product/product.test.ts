import {
  PRODUCT_ACTION_RECEIPT_SCHEMA,
  PRODUCT_ACTION_SCHEMA,
  PRODUCT_AUTOMATION_REQUEST_SCHEMA,
  admitProductAction,
  assertProductReceiptMatchesAction,
  productActionDigest,
  productEvidenceForOutcome,
  validateProductAction,
  validateProductActionCatalog,
  validateProductActionReceipt,
  validateProductAdapterSubject,
  validateProductAutomationRequest,
  validateProjectionLimits,
  validateProjectionSequence,
  type ProductAction,
  type ProductOutcome,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`UX-FND ${message}`);
}

// A control that only asserts "something threw" also passes when a later line throws a
// TypeError for an unrelated reason, which makes a dead guard look load-bearing under a plant
// check. Every control must fail through this family's own contract error.
function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid product contract: "), `${message} threw "${text}" rather than a product contract error`);
}

const NONCE = "a".repeat(64);
const ISSUED = 1_700_000_000_000;
const EXPIRES = ISSUED + 60_000;
const NOW = ISSUED + 1_000;
const TARGET = { targetId: "dashboard.approve-run", role: "button", label: "Approve run" };

function definition(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "dashboard.approve-run",
    version: "1.0.0",
    surface: "web",
    target: { ...TARGET },
    allowedArgumentKeys: ["runId"],
    requiredScopes: ["dashboard.write"],
    riskClass: "write",
    humanAdmitRequired: false,
    ...overrides,
  };
}

function authorization(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actorKind: "human",
    actorId: "owner",
    scopes: ["dashboard.write"],
    nonce: NONCE,
    issuedAtEpochMs: ISSUED,
    expiresAtEpochMs: EXPIRES,
    ...overrides,
  };
}

function actionValue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: PRODUCT_ACTION_SCHEMA,
    requestId: "ux-fixture",
    actionId: "dashboard.approve-run",
    actionVersion: "1.0.0",
    surface: "web",
    environment: "local",
    target: { ...TARGET },
    arguments: { runId: "run-1" },
    authorization: authorization(),
    exclusions: ["device", "production", "store"],
    ...overrides,
  };
}

const LIMITS = validateProjectionLimits({
  maxFrameBytes: 65_536,
  maxFrames: 16,
  maxDurationMs: 10_000,
  maxFramesPerSecond: 30,
  mediaTypes: ["image/png"],
});

function frame(sequence: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sequence,
    capturedAtEpochMs: ISSUED + sequence * 100,
    mediaType: "image/png",
    bytes: 1_024,
    sha256: "b".repeat(64),
    ...overrides,
  };
}

function adapter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "web-dashboard",
    version: "0.1.0",
    sha256: "c".repeat(64),
    implementation: "IMPLEMENTED",
    availability: "AVAILABLE",
    liveEvidence: "NOT_EXERCISED",
    ...overrides,
  };
}

const GREEN_LIFECYCLE = [
  "UNRESOLVED", "ACTION_VALIDATED", "AUTH_CHECKED", "RISK_CHECKED", "ROUTED", "EXECUTING", "OBSERVING", "COMPLETED",
];

function receiptValue(action: ProductAction, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: PRODUCT_ACTION_RECEIPT_SCHEMA,
    requestId: action.requestId,
    actionDigest: productActionDigest(action),
    adapter: adapter(),
    environment: action.environment,
    lifecycle: [...GREEN_LIFECYCLE],
    outcome: "COMPLETED",
    state: "PASS",
    frames: 2,
    artifacts: [{ kind: "view-state", sha256: "d".repeat(64) }],
    cleanup: { state: "PASS", sessionClosed: true, projectionStopped: true, residue: [], detail: "fixture cleanup verified" },
    exclusions: action.exclusions,
    detail: "deterministic fixture only; no web, device or store evidence",
    ...overrides,
  };
}

// UX-FND-001 closed actions
function closedActions(): void {
  const catalog = validateProductActionCatalog([definition()]);
  ok(admitProductAction(validateProductAction(actionValue()), catalog, NOW).id === "dashboard.approve-run", "admitted action failed");

  for (const [label, overrides] of [
    ["unknown action", { actionId: "dashboard.unknown" }],
    ["drifted version", { actionVersion: "9.9.9" }],
    ["drifted surface", { surface: "mobile" }],
    ["undeclared argument", { arguments: { runId: "run-1", note: "x" } }],
  ] as const) {
    red(() => admitProductAction(validateProductAction(actionValue(overrides)), catalog, NOW), label);
  }

  for (const [label, args] of [
    ["shell", { shell: "/bin/sh" }],
    ["argv", { argv: ["ls"] }],
    ["navigation", { url: "https://example.com" }],
    ["selector", { selector: "#root > button" }],
    ["file path", { path: "workspace/x" }],
    ["nested script", { runId: "run-1", nested: { script: "rm -rf /" } }],
  ] as const) {
    red(() => validateProductAction(actionValue({ arguments: args })), `generic ${label} control`);
  }
}

// UX-FND-002 accessibility identity
function accessibilityIdentity(): void {
  red(() => validateProductActionCatalog([definition(), definition({ id: "dashboard.other" })]), "duplicate target ID");
  red(
    () => validateProductActionCatalog([definition(), definition({ target: { ...TARGET, targetId: "dashboard.other" } })]),
    "duplicate action ID",
  );
  red(() => validateProductAction(actionValue({ target: { role: "button", label: "Approve run" } })), "missing target ID");
  const catalog = validateProductActionCatalog([definition()]);
  red(
    () => admitProductAction(validateProductAction(actionValue({ target: { ...TARGET, label: "Approve" } })), catalog, NOW),
    "drifted accessibility identity",
  );
}

// UX-FND-003 authorization
function authorizationControls(): void {
  const catalog = validateProductActionCatalog([definition()]);
  red(
    () => admitProductAction(validateProductAction(actionValue({ authorization: authorization({ scopes: ["dashboard.read"] }) })), catalog, NOW),
    "missing scope",
  );
  red(() => admitProductAction(validateProductAction(actionValue()), catalog, EXPIRES), "replayed request at expiry");
  red(() => admitProductAction(validateProductAction(actionValue()), catalog, ISSUED - 1), "request before issue");
  red(
    () => validateProductAction(actionValue({ authorization: authorization({ expiresAtEpochMs: ISSUED + 86_400_000 }) })),
    "unbounded authorization window",
  );
  red(() => validateProductActionCatalog([definition({ riskClass: "privileged" })]), "self-admitting privileged action");
}

// UX-FND-004 risk-state fidelity
function riskStateFidelity(): void {
  for (const [outcome, evidence] of [
    ["COMPLETED", "PASS"],
    ["WAITING_FOR_HUMAN", "NOT_EXERCISED"],
    ["WAITING_FOR_HARDWARE", "NOT_EXERCISED"],
    ["NOT_EXERCISED", "NOT_EXERCISED"],
    ["DENIED", "FAIL"],
    ["ABSENT_ADAPTER", "ABSENT"],
    ["NOT_IMPLEMENTED", "NOT_IMPLEMENTED"],
    ["FAILED_PROVIDER", "FAIL"],
  ] as const) {
    ok(productEvidenceForOutcome(outcome as ProductOutcome) === evidence, `${outcome} projected as the wrong evidence state`);
  }

  const action = validateProductAction(actionValue());
  const waiting = ["UNRESOLVED", "ACTION_VALIDATED", "AUTH_CHECKED", "RISK_CHECKED", "WAITING_FOR_HARDWARE"];
  red(
    () => validateProductActionReceipt(receiptValue(action, { lifecycle: waiting, outcome: "COMPLETED" })),
    "WAITING_FOR_HARDWARE collapsed into COMPLETED",
  );
  red(
    () => validateProductActionReceipt(receiptValue(action, { lifecycle: waiting, outcome: "WAITING_FOR_HARDWARE", state: "PASS" })),
    "waiting outcome claiming PASS",
  );
  red(
    () => validateProductActionReceipt(receiptValue(action, {
      lifecycle: ["UNRESOLVED", "ACTION_VALIDATED", "RISK_CHECKED", "ROUTED", "EXECUTING", "OBSERVING", "COMPLETED"],
    })),
    "lifecycle skipping authorization",
  );
  red(
    () => validateProductActionReceipt(receiptValue(action, { lifecycle: [...GREEN_LIFECYCLE, "FAILED_CLEANUP"] })),
    "lifecycle continuing past an outcome",
  );
}

// UX-FND-005 provider separation
function providerSeparation(): void {
  // Two separate rules, so each control must isolate its own. An unimplemented adapter that is
  // also ABSENT would be caught by the availability rule first, which would leave the
  // implementation rule untested.
  red(
    () => validateProductAdapterSubject(adapter({ implementation: "NOT_IMPLEMENTED", availability: "AVAILABLE", liveEvidence: "PASS" })),
    "live evidence on an unimplemented adapter",
  );
  red(
    () => validateProductAdapterSubject(adapter({ implementation: "NOT_IMPLEMENTED", availability: "AVAILABLE", liveEvidence: "FAIL" })),
    "any live evidence on an unimplemented adapter",
  );
  red(() => validateProductAdapterSubject(adapter({ availability: "ABSENT", liveEvidence: "PASS" })), "PASS while unavailable");
  ok(
    validateProductAdapterSubject(adapter({ id: "maestro" })).liveEvidence === "NOT_EXERCISED",
    "package presence promoted to live evidence",
  );
}

// UX-FND-006 bounded projection
function boundedProjection(): void {
  ok(validateProjectionSequence([frame(0), frame(1), frame(2)], LIMITS).length === 3, "bounded projection failed");
  for (const [label, frames] of [
    ["frame count", Array.from({ length: 17 }, (_unused, index) => frame(index))],
    ["frame size", [frame(0, { bytes: 65_537 })]],
    ["media type", [frame(0, { mediaType: "video/mp4" })]],
    ["duration", [frame(0), frame(1, { capturedAtEpochMs: ISSUED + 20_000 })]],
    ["contiguity", [frame(0), frame(2)]],
    ["time order", [frame(0), frame(1, { capturedAtEpochMs: ISSUED - 1 })]],
    ["frame rate", Array.from({ length: 16 }, (_unused, index) => frame(index, { capturedAtEpochMs: ISSUED }))],
  ] as const) {
    red(() => validateProjectionSequence(frames, LIMITS), `unbounded ${label}`);
  }

  const action = validateProductAction(actionValue());
  const request = validateProductAutomationRequest({
    schema: PRODUCT_AUTOMATION_REQUEST_SCHEMA,
    requestId: action.requestId,
    actionDigest: productActionDigest(action),
    adapter: adapter({ id: "maestro" }),
    projection: { maxFrameBytes: 65_536, maxFrames: 16, maxDurationMs: 10_000, maxFramesPerSecond: 30, mediaTypes: ["image/png"] },
    artifactKinds: ["view-state"],
    exclusions: ["device", "production"],
  });
  ok(request.projection.maxFrames === 16, "automation request lost its projection bounds");
}

// UX-FND-007 receipts
function receipts(): void {
  const action = validateProductAction(actionValue());
  assertProductReceiptMatchesAction(receiptValue(action), actionValue());
  red(
    () => assertProductReceiptMatchesAction(receiptValue(action), actionValue({ arguments: { runId: "run-2" } })),
    "stale action receipt",
  );
  red(() => validateProductActionReceipt({ ...receiptValue(action), unexpected: true }), "open receipt shape");
  red(
    () => validateProductActionReceipt(receiptValue(action, {
      cleanup: { state: "NOT_EXERCISED", sessionClosed: false, projectionStopped: false, residue: [], detail: "unrun" },
    })),
    "completed action with unverified cleanup",
  );
  red(
    () => validateProductActionReceipt(receiptValue(action, {
      cleanup: { state: "PASS", sessionClosed: true, projectionStopped: true, residue: ["session-1"], detail: "leaked" },
    })),
    "cleanup passing with residue",
  );
}

// UX-FND-008 store/runtime boundary
function storeRuntimeBoundary(): void {
  red(() => validateProductAction(actionValue({ arguments: { bun: "1.3.14" } })), "Bun runtime claim in an action argument");
  red(() => validateProductActionCatalog([definition({ allowedArgumentKeys: ["bun"] })]), "published Bun argument key");
}

closedActions();
accessibilityIdentity();
authorizationControls();
riskStateFidelity();
providerSeparation();
boundedProjection();
receipts();
storeRuntimeBoundary();

console.log("SELFTEST GREEN: UX-FND closed actions, accessibility identity, authorization, risk fidelity, provider separation, bounded projection, receipts, runtime boundary");
