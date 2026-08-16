import {
  PRODUCT_OBSERVATION_STATES,
  convergeProduct,
  invalidatedProductModules,
  productActionRefusal,
  productConvergenceState,
  productReleaseDigest,
  productStatusRefusal,
  type ExpectedProductChild,
  type ProductChildReceipt,
  type ProductConvergenceRequest,
  type ProductModuleNode,
  type ProductPlatform,
  type ProductRole,
  type ProductTrustPlane,
  type ProposedProductStatus,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`UX-CONV ${message}`);
}

function red(action: () => unknown, message: string): void {
  let thrown = false;
  try { action(); } catch { thrown = true; }
  ok(thrown, `${message} stayed green`);
}

const MODULES: ProductModuleNode[] = [
  { id: "bettor-consumer", provides: ["bettor.consumer/v1", "bettor.browser-contract/v2"], requires: [] },
  { id: "document-ingest", provides: ["document.ingest/v1"], requires: [] },
  { id: "product-adapters", provides: ["product.mobile/v1", "product.dashboard/v1", "product.automation/v1"], requires: ["runtime.provider/v1"] },
  { id: "research-orchestrator", provides: ["research.route/v1"], requires: ["document.ingest/v1", "bettor.browser-contract/v2"] },
  { id: "runtime-fabric", provides: ["runtime.provider/v1"], requires: [] },
  { id: "security-boundaries", provides: ["security.intent/v1", "security.provider-boundaries/v1"], requires: [] },
];

const CHILDREN: readonly [number, string, ProductPlatform[], ProductRole, ProductTrustPlane][] = [
  [45, "product-contracts", ["web"], "contract", "none"],
  [46, "dashboard-genui", ["web"], "surface", "none"],
  [47, "terminal-projection", ["terminal"], "surface", "none"],
  [48, "expo-mobile", ["ios-simulator", "android-emulator"], "surface", "none"],
  [49, "inapp-bridge", ["ios-simulator", "android-emulator"], "bridge", "in-app"],
  [50, "maestro", ["ios-simulator", "android-emulator"], "automation", "external-mcp"],
  [51, "wda", ["ios-device"], "projection", "none"],
  [52, "scrcpy", ["android-device"], "projection", "none"],
];

const CONTRACT = "c".repeat(64);
const EXPECTED: ExpectedProductChild[] = CHILDREN.map(([issue, adapterId, platforms, role, trustPlane], index) => ({
  issue,
  adapterId,
  interfaceVersion: "1.0.0",
  subjectSha256: (index + 1).toString(16).repeat(64),
  platforms: [...platforms],
  role,
  trustPlane,
}));

function receipts(overrides: Partial<ProductChildReceipt>[] = []): ProductChildReceipt[] {
  return CHILDREN.map(([issue, adapterId, platforms, role, trustPlane], index) => ({
    issue,
    adapterId,
    interfaceVersion: "1.0.0",
    subjectSha256: EXPECTED[index]!.subjectSha256,
    contractSha256: CONTRACT,
    actionIds: [`action-${issue}`],
    accessibilityIds: role === "contract" ? [] : [`a11y-${issue}`],
    platforms: [...platforms],
    role,
    trustPlane,
    state: "PASS",
    observedStates: role === "contract" ? [] : [...PRODUCT_OBSERVATION_STATES],
    authCleared: true,
    publicCapabilityOnly: true,
    genericToolExposed: false,
    listenerAuthenticated: true,
    artifactsAccounted: true,
    cleanupCleared: true,
    ...(overrides[index] ?? {}),
  }));
}

const INVALIDATED = ["product-adapters"];

function status(overrides: Partial<ProposedProductStatus> = {}): ProposedProductStatus {
  return {
    platforms: {
      web: "PASS",
      terminal: "PASS",
      "ios-simulator": "PASS",
      "android-emulator": "PASS",
      "ios-device": "PASS",
      "android-device": "PASS",
      "cloud-ios": "NOT_IMPLEMENTED",
    },
    invalidatedModules: [...INVALIDATED],
    ...overrides,
  };
}

function run(overrides: Partial<ProductConvergenceRequest> = {}) {
  return convergeProduct({
    receipts: receipts(),
    expected: EXPECTED,
    modules: MODULES,
    status: status(),
    contractSha256: CONTRACT,
    ...overrides,
  }).receipt;
}

function subjectCompatibility(): void {
  ok(run().outcome === "HUMAN_REVIEW", "a supported product aggregate did not stop at Human review");
  ok(run({ receipts: receipts().slice(0, -1) }).outcome === "CHILD_ABSENT", "a missing child was admitted");
  ok(run({ receipts: receipts([{ subjectSha256: "f".repeat(64) }]) }).outcome === "SUBJECT_MISMATCH", "a stale child subject was admitted");
  ok(run({ receipts: receipts([{ contractSha256: "f".repeat(64) }]) }).outcome === "SUBJECT_MISMATCH", "a mixed product contract was admitted");
  ok(run({ receipts: [...receipts(), receipts()[0]!] }).outcome === "SUBJECT_MISMATCH", "a duplicate child receipt was admitted");
}

function actionUniqueness(): void {
  ok(productActionRefusal(receipts()) === null, "unique product claims were refused");
  const duplicateAction = receipts([{}, { actionIds: ["action-45"] }]);
  ok(run({ receipts: duplicateAction }).outcome === "ACTION_CONFLICT", "a duplicate action reached execution");
  const duplicateAccessibility = receipts([{}, { accessibilityIds: ["a11y-48"] }]);
  ok(run({ receipts: duplicateAccessibility }).outcome === "ACTION_CONFLICT", "a duplicate accessibility ID reached execution");
}

function stateFidelityAndPlatformMatrix(): void {
  const missingState = PRODUCT_OBSERVATION_STATES.filter((state) => state !== "denied");
  ok(run({ receipts: receipts([{}, { observedStates: missingState }]) }).outcome === "ACCESSIBILITY_FAIL", "a surface that merged denied with another state was admitted");
  ok(run({ receipts: receipts([{}, { accessibilityIds: [] }]) }).outcome === "ACCESSIBILITY_FAIL", "a surface with no stable accessibility ID was admitted");
  ok(run({ receipts: receipts([{}, {}, {}, {}, {}, {}, { platforms: ["android-device"] }]) }).outcome === "PLATFORM_ABSENT", "an Android lane proxied an iOS device lane");
  ok(run({ receipts: receipts([{}, {}, {}, {}, {}, {}, { state: "ABSENT" }]) }).outcome === "PLATFORM_ABSENT", "an absent mandatory device subject was admitted");
}

function automationProjectionAndBridge(): void {
  ok(run({ receipts: receipts([{}, {}, {}, {}, {}, { publicCapabilityOnly: false }]) }).outcome === "AUTOMATION_FAIL", "Maestro bypassed public capabilities");
  ok(run({ receipts: receipts([{}, {}, {}, {}, {}, { genericToolExposed: true }]) }).outcome === "AUTOMATION_FAIL", "a generic External MCP tool was admitted");
  ok(run({ receipts: receipts([{}, {}, {}, {}, {}, {}, { publicCapabilityOnly: false }]) }).outcome === "PROJECTION_FAIL", "raw WDA/private projection was admitted");
  ok(run({ receipts: receipts([{}, {}, {}, {}, { trustPlane: "external-mcp" }]) }).outcome === "AUTH_FAIL", "In-App and External MCP were collapsed into one expected subject");
  ok(run({ receipts: receipts([{}, {}, {}, {}, {}, { listenerAuthenticated: false }]) }).outcome === "AUTH_FAIL", "an unauthenticated External MCP listener was admitted");
  ok(run({ receipts: receipts([{}, {}, {}, {}, { authCleared: false }]) }).outcome === "AUTH_FAIL", "an unauthenticated In-App action was admitted");
}

function cleanupAndReleaseHonesty(): void {
  ok(run({ receipts: receipts([{ artifactsAccounted: false }]) }).outcome === "CLEANUP_FAIL", "an unaccounted product artifact was admitted");
  ok(run({ receipts: receipts([{ cleanupCleared: false }]) }).outcome === "CLEANUP_FAIL", "retained product residue was admitted");
  ok(JSON.stringify(invalidatedProductModules("product-adapters", MODULES)) === JSON.stringify(INVALIDATED), "product invalidation left its graph closure");
  const base = productReleaseDigest(receipts(), status(), CONTRACT);
  ok(base === productReleaseDigest([...receipts()].reverse(), status(), CONTRACT), "product digest depends on receipt order");
  ok(base !== productReleaseDigest(receipts([{ actionIds: ["changed"] }]), status(), CONTRACT), "product action ownership is not bound into release digest");

  const deviceUnexercised = receipts([{}, {}, {}, {}, {}, {}, { state: "NOT_EXERCISED" }]);
  ok(productStatusRefusal(deviceUnexercised, status(), MODULES) !== null, "an unreceipted iOS-device PASS was admitted");
  ok(run({ receipts: deviceUnexercised }).outcome === "RELEASE_DRIFT", "an unreceipted device PASS rendered a release");
  const honest = status({ platforms: { ...status().platforms, "ios-device": "NOT_EXERCISED" } });
  ok(run({ receipts: deviceUnexercised, status: honest }).outcome === "HUMAN_REVIEW", "an honest device downgrade was refused");

  red(() => productStatusRefusal(receipts(), {
    ...status(),
    platforms: { ...status().platforms, shadow: "NOT_EXERCISED" } as ProposedProductStatus["platforms"],
  }, MODULES), "an unknown product status lane");
}

function evidenceBoundary(): void {
  type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
  const neverPasses: NeverPass<typeof productConvergenceState> = true;
  void neverPasses;
  ok(productConvergenceState.cloudIos === "NOT_IMPLEMENTED", "cloud iOS was overclaimed");
  ok(productConvergenceState.storeApproval === "ABSENT", "store approval was invented");
}

subjectCompatibility();
actionUniqueness();
stateFidelityAndPlatformMatrix();
automationProjectionAndBridge();
cleanupAndReleaseHonesty();
evidenceBoundary();

console.log("UX-CONV GREEN: exact contracts/children, unique actions, faithful states, separated platforms/trust planes, cleanup and honest release");
