import {
  convergeSecurity,
  invalidatedSecurityModules,
  securityCapabilityRefusal,
  securityConvergenceState,
  securityReleaseDigest,
  securityStatusRefusal,
  type ExpectedSecurityChild,
  type ProposedSecurityStatus,
  type SecurityChildReceipt,
  type SecurityConvergenceControls,
  type SecurityConvergenceRequest,
  type SecurityLane,
  type SecurityModuleNode,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SEC-CONV ${message}`);
}

function red(action: () => unknown, message: string): void {
  let thrown = false;
  try { action(); } catch { thrown = true; }
  ok(thrown, `${message} stayed green`);
}

const MODULES: SecurityModuleNode[] = [
  { id: "bettor-consumer", provides: ["bettor.consumer/v1", "bettor.browser-contract/v2"], requires: [] },
  { id: "document-ingest", provides: ["document.ingest/v1"], requires: [] },
  { id: "product-adapters", provides: ["product.mobile/v1", "product.dashboard/v1", "product.automation/v1"], requires: ["runtime.provider/v1"] },
  { id: "research-orchestrator", provides: ["research.route/v1"], requires: ["document.ingest/v1", "bettor.browser-contract/v2"] },
  { id: "runtime-fabric", provides: ["runtime.provider/v1"], requires: [] },
  { id: "security-boundaries", provides: ["security.intent/v1", "security.provider-boundaries/v1"], requires: [] },
];

const CHILDREN: readonly [number, string, SecurityLane][] = [
  [54, "security-contracts", "policy"],
  [55, "opa-policy", "policy"],
  [56, "durable-workflow", "policy"],
  [57, "openbao-broker", "policy"],
  [58, "verified-ledger", "ledger"],
  [59, "secure-enclave", "hardware"],
  [60, "core-nfc", "hardware"],
  [61, "mpc-tss", "signing"],
  [62, "smart-account", "contract"],
  [63, "testnet-submission", "testnet"],
];

const CEREMONY = "c".repeat(64);
const EXPECTED: ExpectedSecurityChild[] = CHILDREN.map(([issue, providerId, lane], index) => ({
  issue,
  providerId,
  interfaceVersion: "1.0.0",
  subjectSha256: (index + 1).toString(16).repeat(64),
  lane,
}));

function receipts(overrides: Partial<SecurityChildReceipt>[] = []): SecurityChildReceipt[] {
  return CHILDREN.map(([issue, providerId, lane], index) => ({
    issue,
    providerId,
    interfaceVersion: "1.0.0",
    subjectSha256: EXPECTED[index]!.subjectSha256,
    ceremonySha256: CEREMONY,
    capabilities: [`security.capability.${issue}`],
    lane,
    state: "PASS",
    cleanupCleared: true,
    ...(overrides[index] ?? {}),
  }));
}

function controls(overrides: Partial<SecurityConvergenceControls> = {}): SecurityConvergenceControls {
  return {
    ceremonyAdmitSha256: "d".repeat(64),
    lowRiskSessionLimitsCleared: true,
    highRiskHardwareEnforced: true,
    replayAndStalenessCleared: true,
    compromisedComponentCleared: true,
    threatModelMeasured: true,
    lostSubjectRecoveryCleared: true,
    automaticUnsafeRecoveryDisabled: true,
    ledgerChainConsistencyCleared: true,
    confirmationStatesDistinct: true,
    adversarialInputsCleared: true,
    secrecyPrivacyCleared: true,
    cleanupRevocationCleared: true,
    auditScopesRecorded: true,
    residualRisksRecorded: true,
    claimLanguageCleared: true,
    ...overrides,
  };
}

const INVALIDATED = ["security-boundaries"];

function status(overrides: Partial<ProposedSecurityStatus> = {}): ProposedSecurityStatus {
  return {
    lanes: {
      policy: "PASS",
      hardware: "PASS",
      signing: "PASS",
      ledger: "PASS",
      contract: "PASS",
      testnet: "PASS",
    },
    invalidatedModules: [...INVALIDATED],
    ...overrides,
  };
}

function run(overrides: Partial<SecurityConvergenceRequest> = {}) {
  return convergeSecurity({
    receipts: receipts(),
    expected: EXPECTED,
    modules: MODULES,
    status: status(),
    ceremonySha256: CEREMONY,
    controls: controls(),
    ...overrides,
  }).receipt;
}

function subjectClosureAndOwnership(): void {
  ok(run().outcome === "HUMAN_REVIEW", "a supported security aggregate did not stop at Human review");
  ok(run({ receipts: receipts().slice(0, -1) }).outcome === "CHILD_ABSENT", "a missing security child was admitted");
  ok(run({ receipts: receipts([{ subjectSha256: "f".repeat(64) }]) }).outcome === "SUBJECT_MISMATCH", "a stale security subject was admitted");
  ok(run({ receipts: receipts([{ ceremonySha256: "f".repeat(64) }]) }).outcome === "SUBJECT_MISMATCH", "a mixed ceremony subject was admitted");
  ok(run({ receipts: receipts([{ lane: "hardware" }]) }).outcome === "SUBJECT_MISMATCH", "a policy child proxied a hardware lane");
  ok(run({ receipts: [...receipts(), receipts()[0]!] }).outcome === "SUBJECT_MISMATCH", "a duplicate security receipt was admitted");
  const duplicate = receipts([{}, { capabilities: ["security.capability.54"] }]);
  ok(securityCapabilityRefusal(duplicate) !== null, "two providers owning one capability were admitted");
  ok(run({ receipts: duplicate }).outcome === "CAPABILITY_CONFLICT", "a capability collision reached a ceremony");
}

function routeReplayAndLaneControls(): void {
  ok(run({ controls: controls({ ceremonyAdmitSha256: null }) }).outcome === "CEREMONY_REFUSED", "a ceremony without Human receipt ran");
  ok(run({ controls: controls({ replayAndStalenessCleared: false }) }).outcome === "CEREMONY_REFUSED", "stale/replayed authority ran");
  ok(run({ controls: controls({ lowRiskSessionLimitsCleared: false }) }).outcome === "POLICY_FAIL", "low-risk privilege expansion passed");
  ok(run({ controls: controls({ highRiskHardwareEnforced: false }) }).outcome === "HARDWARE_FAIL", "high-risk hardware bypass passed");

  const firstByLane: Record<SecurityLane, number> = {
    policy: 0,
    ledger: 4,
    hardware: 5,
    signing: 7,
    contract: 8,
    testnet: 9,
  };
  const terminal: Record<SecurityLane, string> = {
    policy: "POLICY_FAIL",
    hardware: "HARDWARE_FAIL",
    signing: "SIGNING_FAIL",
    ledger: "LEDGER_FAIL",
    contract: "CONTRACT_FAIL",
    testnet: "TESTNET_FAIL",
  };
  for (const lane of Object.keys(firstByLane) as SecurityLane[]) {
    const overrides = Array.from({ length: CHILDREN.length }, () => ({} as Partial<SecurityChildReceipt>));
    overrides[firstByLane[lane]] = { state: "FAIL" };
    ok(run({ receipts: receipts(overrides) }).outcome === terminal[lane], `${lane} failure lost its terminal`);
  }
}

function adversarialRecoveryConsistencyAndAudit(): void {
  ok(run({ controls: controls({ adversarialInputsCleared: false }) }).outcome === "POLICY_FAIL", "an adversarial invalid-input control stayed green");
  ok(run({ controls: controls({ compromisedComponentCleared: false }) }).outcome === "SIGNING_FAIL", "one compromised component authorized end to end");
  ok(run({ controls: controls({ threatModelMeasured: false }) }).outcome === "AUDIT_GAP", "an unmeasured threat model was admitted");
  ok(run({ controls: controls({ secrecyPrivacyCleared: false }) }).outcome === "AUDIT_GAP", "secret/privacy leakage was admitted");
  ok(run({ controls: controls({ ledgerChainConsistencyCleared: false }) }).outcome === "LEDGER_FAIL", "inconsistent ledger/chain receipts were admitted");
  ok(run({ controls: controls({ confirmationStatesDistinct: false }) }).outcome === "TESTNET_FAIL", "included/confirmed/recorded were collapsed");
  ok(run({ controls: controls({ lostSubjectRecoveryCleared: false }) }).outcome === "RECOVERY_FAIL", "lost-subject recovery gap was admitted");
  ok(run({ controls: controls({ automaticUnsafeRecoveryDisabled: false }) }).outcome === "RECOVERY_FAIL", "automatic unsafe recovery was admitted");
  ok(run({ controls: controls({ cleanupRevocationCleared: false }) }).outcome === "CLEANUP_FAIL", "uncleared stale authority was admitted");
  ok(run({ receipts: receipts([{ cleanupCleared: false }]) }).outcome === "CLEANUP_FAIL", "retained security residue was admitted");
  ok(run({ controls: controls({ auditScopesRecorded: false }) }).outcome === "AUDIT_GAP", "missing audit scope was admitted");
  ok(run({ controls: controls({ residualRisksRecorded: false }) }).outcome === "AUDIT_GAP", "missing residual risks were admitted");
  ok(run({ controls: controls({ claimLanguageCleared: false }) }).outcome === "AUDIT_GAP", "absolute/unmeasured security language was admitted");
}

function releaseHonesty(): void {
  ok(JSON.stringify(invalidatedSecurityModules("security-boundaries", MODULES)) === JSON.stringify(INVALIDATED), "security invalidation left its graph closure");
  const base = securityReleaseDigest(receipts(), status(), CEREMONY, controls());
  ok(base === securityReleaseDigest([...receipts()].reverse(), status(), CEREMONY, controls()), "security digest depends on receipt order");
  ok(base !== securityReleaseDigest(receipts([{ capabilities: ["changed"] }]), status(), CEREMONY, controls()), "security capability ownership is not bound into release digest");

  const absentNative = receipts([{}, {}, {}, {}, {}, { state: "NOT_IMPLEMENTED" }, { state: "NOT_IMPLEMENTED" }]);
  ok(securityStatusRefusal(absentNative, status(), MODULES) !== null, "native hardware PASS lacked evidence");
  ok(run({ receipts: absentNative }).outcome === "AUDIT_GAP", "unreceipted native hardware PASS rendered a release");
  const honest = status({ lanes: { ...status().lanes, hardware: "NOT_IMPLEMENTED" } });
  ok(run({ receipts: absentNative, status: honest }).outcome === "HUMAN_REVIEW", "an honest security downgrade was refused");

  red(() => securityStatusRefusal(receipts(), {
    ...status(),
    lanes: { ...status().lanes, shadow: "NOT_EXERCISED" } as ProposedSecurityStatus["lanes"],
  }, MODULES), "an unknown security status lane");
}

function evidenceBoundary(): void {
  type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
  const neverPasses: NeverPass<typeof securityConvergenceState> = true;
  void neverPasses;
  ok(securityConvergenceState.nativeHardware === "NOT_IMPLEMENTED", "native hardware was overclaimed");
  ok(securityConvergenceState.testnetSubmission === "NOT_IMPLEMENTED", "testnet was overclaimed");
  ok(securityConvergenceState.productionCustody === "ABSENT", "production custody was invented");
  ok(securityConvergenceState.mainnetAuthority === "ABSENT", "mainnet authority was invented");
}

subjectClosureAndOwnership();
routeReplayAndLaneControls();
adversarialRecoveryConsistencyAndAudit();
releaseHonesty();
evidenceBoundary();

console.log("SEC-CONV GREEN: exact ceremony/children, route and adversarial controls, recovery, consistency, secrecy, cleanup, audit and honest release");
