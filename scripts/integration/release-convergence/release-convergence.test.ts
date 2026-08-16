import {
  adjudicateRelease,
  convergeRelease,
  invalidatedReleaseModules,
  releaseClaimRefusal,
  releaseConvergenceDigest,
  releaseConvergenceState,
  releaseStatusRefusal,
  type ExpectedReleaseChild,
  type ProposedReleaseStatus,
  type ReleaseAttestation,
  type ReleaseChildReceipt,
  type ReleaseConvergenceControls,
  type ReleaseConvergenceRequest,
  type ReleaseLane,
  type ReleaseModuleNode,
} from "./index.ts";
import type { HumanAdmit } from "../../../packages/contracts/src/convergence/index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-REL ${message}`);
}

function red(action: () => unknown, message: string): void {
  let thrown = false;
  try { action(); } catch { thrown = true; }
  ok(thrown, `${message} stayed green`);
}

const MODULES: ReleaseModuleNode[] = [
  { id: "bettor-consumer", provides: ["bettor.consumer/v1", "bettor.browser-contract/v2"], requires: [] },
  { id: "document-ingest", provides: ["document.ingest/v1"], requires: [] },
  { id: "product-adapters", provides: ["product.mobile/v1", "product.dashboard/v1", "product.automation/v1"], requires: ["runtime.provider/v1"] },
  { id: "research-orchestrator", provides: ["research.route/v1"], requires: ["document.ingest/v1", "bettor.browser-contract/v2"] },
  { id: "runtime-fabric", provides: ["runtime.provider/v1"], requires: [] },
  { id: "security-boundaries", provides: ["security.intent/v1", "security.provider-boundaries/v1"], requires: [] },
];

const CHILDREN: readonly [number, string, ReleaseLane][] = [
  [65, "consumer-contracts", "offline"],
  [66, "module-closure", "offline"],
  [67, "skills-binding", "offline"],
  [68, "runtime-binding", "offline"],
  [69, "cli-mcp-parity", "offline"],
  [70, "claude-canary", "claude"],
  [71, "codex-canary", "codex"],
  [72, "github-origin", "github-origin"],
  [73, "forgejo-origin", "forgejo-origin"],
  [74, "origin-equivalence", "equivalence"],
];

const HEAD = "a".repeat(64);
const LOCK = "b".repeat(64);
const COMPOSITION = "c".repeat(64);
const EXPECTED: ExpectedReleaseChild[] = CHILDREN.map(([issue, ownerId, lane], index) => ({
  issue,
  ownerId,
  interfaceVersion: "1.0.0",
  subjectSha256: (index + 1).toString(16).repeat(64),
  lane,
}));

function receipts(overrides: Partial<ReleaseChildReceipt>[] = []): ReleaseChildReceipt[] {
  return CHILDREN.map(([issue, ownerId, lane], index) => ({
    issue,
    ownerId,
    interfaceVersion: "1.0.0",
    subjectSha256: EXPECTED[index]!.subjectSha256,
    headSha256: HEAD,
    lockSha256: LOCK,
    compositionSha256: COMPOSITION,
    claims: [`release.claim.${issue}`],
    lane,
    state: "PASS",
    cleanupCleared: true,
    ...(overrides[index] ?? {}),
  }));
}

function controls(overrides: Partial<ReleaseConvergenceControls> = {}): ReleaseConvergenceControls {
  return {
    deterministicCompositionCleared: true,
    hostParityCleared: true,
    carrierProxyFree: true,
    mcpDefaultDenyCleared: true,
    priorPinStable: true,
    selectedPolicyTools: ["loopctl_ctg_run", "loopctl_verify"],
    achievedOriginEquivalence: "behavioral",
    requiredOriginEquivalence: "artifact",
    orphanRemovalCleared: true,
    rollbackTargetUnchanged: true,
    rollbackControlsCleared: true,
    residualGapsNamed: true,
    ...overrides,
  };
}

const INVALIDATED = ["bettor-consumer", "research-orchestrator"];

function status(overrides: Partial<ProposedReleaseStatus> = {}): ProposedReleaseStatus {
  return {
    lanes: {
      offline: "PASS",
      claude: "PASS",
      codex: "PASS",
      "github-origin": "PASS",
      "forgejo-origin": "PASS",
      equivalence: "PASS",
    },
    invalidatedModules: [...INVALIDATED],
    publishedTools: ["loopctl_ctg_run", "loopctl_verify"],
    residualGaps: ["production-rollout-absent", "provider-permanence-not-proven"],
    ...overrides,
  };
}

function run(overrides: Partial<ReleaseConvergenceRequest> = {}) {
  return convergeRelease({
    receipts: receipts(),
    expected: EXPECTED,
    modules: MODULES,
    status: status(),
    headSha256: HEAD,
    lockSha256: LOCK,
    compositionSha256: COMPOSITION,
    controls: controls(),
    ...overrides,
  }).receipt;
}

function admitFor(receipt = run(), overrides: Partial<HumanAdmit> = {}): HumanAdmit {
  ok(receipt.releaseDigest !== null, "a Human Admit fixture has no release digest");
  return {
    approverId: "ed3c",
    approvedAtEpochMs: 9_500,
    headSha256: receipt.headSha256,
    lockSha256: receipt.lockSha256,
    releaseDigest: receipt.releaseDigest,
    ...overrides,
  };
}

function attestationFor(receipt = run(), overrides: Partial<ReleaseAttestation> = {}): ReleaseAttestation {
  ok(receipt.releaseDigest !== null, "an attestation fixture has no release digest");
  return {
    artifactSha256: "e".repeat(64),
    headSha256: receipt.headSha256,
    lockSha256: receipt.lockSha256,
    releaseDigest: receipt.releaseDigest,
    ...overrides,
  };
}

function decide(
  overrides: Partial<Parameters<typeof adjudicateRelease>[0]> = {},
  receipt = run(),
) {
  return adjudicateRelease({
    receipt,
    decision: "promote",
    admit: admitFor(receipt),
    approvers: ["ed3c"],
    nowEpochMs: 10_000,
    maxAdmitAgeMs: 1_000,
    attestationPolicy: "optional",
    attestation: null,
    rollbackCleared: true,
    ...overrides,
  }).receipt;
}

function completeSameSubjectEvidence(): void {
  ok(run().outcome === "HUMAN_REVIEW", "a supported release aggregate did not stop at Human review");
  ok(run({ receipts: receipts().slice(0, -1) }).outcome === "CHILD_ABSENT", "a missing release child was admitted");
  ok(run({ receipts: receipts([{ subjectSha256: "f".repeat(64) }]) }).outcome === "SUBJECT_MISMATCH", "a stale child subject was admitted");
  ok(run({ receipts: receipts([{ headSha256: "f".repeat(64) }]) }).outcome === "SUBJECT_MISMATCH", "mixed release heads were admitted");
  ok(run({ receipts: receipts([{ lockSha256: "f".repeat(64) }]) }).outcome === "SUBJECT_MISMATCH", "mixed consumer locks were admitted");
  ok(run({ receipts: receipts([{ compositionSha256: "f".repeat(64) }]) }).outcome === "SUBJECT_MISMATCH", "mixed selected compositions were admitted");
  ok(run({ receipts: receipts([{ lane: "codex" }]) }).outcome === "SUBJECT_MISMATCH", "one child proxied another evidence lane");
  ok(run({ receipts: [...receipts(), receipts()[0]!] }).outcome === "SUBJECT_MISMATCH", "a duplicate child receipt was admitted");
  const duplicate = receipts([{}, { claims: ["release.claim.65"] }]);
  ok(releaseClaimRefusal(duplicate) !== null, "two children owning one release claim were admitted");
  ok(run({ receipts: duplicate }).outcome === "LOCK_CONFLICT", "a release ownership conflict reached verification");
}

function deterministicCompositionAndMcpPolicy(): void {
  const base = releaseConvergenceDigest(receipts(), status(), HEAD, LOCK, COMPOSITION, controls());
  ok(base === releaseConvergenceDigest([...receipts()].reverse(), {
    ...status(),
    publishedTools: [...status().publishedTools].reverse(),
    residualGaps: [...status().residualGaps].reverse(),
  }, HEAD, LOCK, COMPOSITION, controls({ selectedPolicyTools: [...controls().selectedPolicyTools].reverse() })), "release digest depends on receipt/tool/gap order");
  ok(base !== releaseConvergenceDigest(receipts([{ claims: ["changed"] }]), status(), HEAD, LOCK, COMPOSITION, controls()), "release claim ownership is not bound into the digest");
  ok(run({ controls: controls({ deterministicCompositionCleared: false }) }).outcome === "LOCK_CONFLICT", "host/order-dependent composition was admitted");
  ok(run({ controls: controls({ mcpDefaultDenyCleared: false }) }).outcome === "LOCK_CONFLICT", "MCP default deny failure was admitted");
  ok(run({ controls: controls({ priorPinStable: false }) }).outcome === "LOCK_CONFLICT", "a mutable prior pin was admitted");
  ok(run({ status: status({ publishedTools: [...status().publishedTools, "loopctl_hidden"] }) }).outcome === "LOCK_CONFLICT", "a hidden MCP tool was published");
}

function carrierOriginAndEquivalence(): void {
  ok(run({ controls: controls({ hostParityCleared: false }) }).outcome === "CODEX_FAIL", "Claude/Codex subject parity failure was admitted");
  ok(run({ controls: controls({ carrierProxyFree: false }) }).outcome === "CODEX_FAIL", "one carrier proxied the other");
  ok(run({ receipts: receipts([{}, {}, {}, {}, {}, { state: "FAIL" }]) }).outcome === "CLAUDE_FAIL", "Claude failure lost its terminal");
  ok(run({ receipts: receipts([{}, {}, {}, {}, {}, {}, { state: "FAIL" }]) }).outcome === "CODEX_FAIL", "Codex failure lost its terminal");
  ok(run({ receipts: receipts([{}, {}, {}, {}, {}, {}, {}, { state: "FAIL" }]) }).outcome === "ORIGIN_FAIL", "GitHub origin failure was admitted");
  ok(run({ receipts: receipts([{}, {}, {}, {}, {}, {}, {}, {}, { state: "FAIL" }]) }).outcome === "ORIGIN_FAIL", "Forgejo origin failure was admitted");
  ok(run({ controls: controls({ achievedOriginEquivalence: "metadata", requiredOriginEquivalence: "artifact" }) }).outcome === "EQUIVALENCE_FAIL", "downgraded origin equivalence was admitted");
}

function cleanupRollbackHonestyAndInvalidation(): void {
  ok(run({ receipts: receipts([{ cleanupCleared: false }]) }).outcome === "CLEANUP_FAIL", "retained workspace/process/lease residue was admitted");
  ok(run({ controls: controls({ orphanRemovalCleared: false }) }).outcome === "CLEANUP_FAIL", "an orphan projection was admitted");
  ok(run({ controls: controls({ rollbackTargetUnchanged: false }) }).outcome === "ROLLBACK_FAIL", "rollback over a drifted target was admitted");
  ok(run({ controls: controls({ rollbackControlsCleared: false }) }).outcome === "ROLLBACK_FAIL", "missing rollback controls rendered a release");
  ok(run({ controls: controls({ residualGapsNamed: false }) }).outcome === "LOCK_CONFLICT", "unnamed residual gaps were admitted");
  ok(JSON.stringify(invalidatedReleaseModules("bettor-consumer", MODULES)) === JSON.stringify(INVALIDATED), "release invalidation left its graph closure");

  const claudeAbsent = receipts([{}, {}, {}, {}, {}, { state: "NOT_EXERCISED" }]);
  ok(releaseStatusRefusal(claudeAbsent, status(), MODULES, controls()) !== null, "an unreceipted Claude PASS was admitted");
  ok(run({ receipts: claudeAbsent }).outcome === "LOCK_CONFLICT", "an unreceipted carrier PASS rendered a release");
  const honest = status({ lanes: { ...status().lanes, claude: "NOT_EXERCISED" } });
  const review = run({ receipts: claudeAbsent, status: honest });
  ok(review.outcome === "HUMAN_REVIEW", "an honest carrier downgrade was refused");
  ok(decide({}, review).outcome === "HUMAN_REJECTED", "a downgraded lane was promoted");

  red(() => releaseStatusRefusal(receipts(), {
    ...status(),
    lanes: { ...status().lanes, shadow: "NOT_EXERCISED" } as ProposedReleaseStatus["lanes"],
  }, MODULES, controls()), "an unknown release lane");
}

function humanGateAttestationAndRollback(): void {
  const review = run();
  ok(decide({ decision: "reject", admit: null }, review).outcome === "REJECTED", "an explicit Human rejection was not recorded");
  ok(decide({ admit: null }, review).outcome === "HUMAN_REJECTED", "promotion without Human Admit succeeded");
  ok(decide({ approvers: ["other"] }, review).outcome === "HUMAN_REJECTED", "an unknown approver was admitted");
  ok(decide({ admit: admitFor(review, { headSha256: "f".repeat(64) }) }, review).outcome === "HUMAN_REJECTED", "an admit for another head succeeded");
  ok(decide({ admit: admitFor(review, { lockSha256: "f".repeat(64) }) }, review).outcome === "HUMAN_REJECTED", "an admit for another lock succeeded");
  ok(decide({ admit: admitFor(review, { releaseDigest: "f".repeat(64) }) }, review).outcome === "HUMAN_REJECTED", "an admit for another release succeeded");
  ok(decide({ admit: admitFor(review, { approvedAtEpochMs: 8_000 }) }, review).outcome === "HUMAN_REJECTED", "a stale Human Admit succeeded");
  ok(decide({ admit: admitFor(review, { approvedAtEpochMs: 10_001 }) }, review).outcome === "HUMAN_REJECTED", "a future Human Admit succeeded");

  ok(decide({ attestationPolicy: "optional", attestation: null }, review).outcome === "PROMOTED", "optional unsigned promotion was refused");
  ok(decide({ attestationPolicy: "required", attestation: null }, review).outcome === "ATTESTATION_REQUIRED_ABSENT", "missing mandatory attestation promoted");
  ok(decide({ attestationPolicy: "required", attestation: attestationFor(review, { releaseDigest: "f".repeat(64) }) }, review).outcome === "ATTESTATION_REQUIRED_ABSENT", "wrong-subject mandatory attestation promoted");
  ok(decide({ attestationPolicy: "optional", attestation: attestationFor(review, { headSha256: "f".repeat(64) }) }, review).outcome === "HUMAN_REJECTED", "a malformed supplied optional attestation was ignored");
  ok(decide({ attestationPolicy: "required", attestation: attestationFor(review) }, review).outcome === "PROMOTED", "a fully admitted signed release did not promote");

  ok(decide({ decision: "rollback", rollbackCleared: false }, review).outcome === "ROLLBACK_FAIL", "a dirty rollback succeeded");
  ok(decide({ decision: "rollback", rollbackCleared: true }, review).outcome === "ROLLED_BACK", "an admitted clean rollback failed");
}

function evidenceBoundary(): void {
  type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
  const neverPasses: NeverPass<typeof releaseConvergenceState> = true;
  void neverPasses;
  ok(releaseConvergenceState.releaseAttestation === "ABSENT", "a release attestation was invented");
  ok(releaseConvergenceState.productionRollout === "ABSENT", "production rollout was invented");
  ok(releaseConvergenceState.humanAdmit === "NOT_EXERCISED", "Human Admit was invented");
}

completeSameSubjectEvidence();
deterministicCompositionAndMcpPolicy();
carrierOriginAndEquivalence();
cleanupRollbackHonestyAndInvalidation();
humanGateAttestationAndRollback();
evidenceBoundary();

console.log("INT-REL GREEN: same-subject closure, deterministic composition, carrier/origin parity, cleanup/rollback, honest evidence, Human Admit and attestation policy");
