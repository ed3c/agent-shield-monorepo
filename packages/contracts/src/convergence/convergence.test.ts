import type { EvidenceState } from "../index.ts";
import {
  aggregateDigest,
  aggregateRefusal,
  childIdentityRefusal,
  claimUniquenessRefusal,
  humanAdmitRefusal,
  invalidatedBy,
  type AdmitExpectation,
  type ChildEvidence,
  type ExpectedChild,
  type HumanAdmit,
  type ModuleNode,
  type ProposedAggregate,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`CONV-FND ${message}`);
}

function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid convergence contract: "), `${message} threw "${text}" rather than a convergence contract error`);
}

// The real module graph from `.arena/modules/*/module.json`, so the invalidation rule is a
// statement about this repository rather than about an invented graph.
const MODULES: ModuleNode[] = [
  { id: "bettor-consumer", provides: ["bettor.consumer/v1", "bettor.browser-contract/v2"], requires: [] },
  { id: "document-ingest", provides: ["document.ingest/v1"], requires: [] },
  { id: "product-adapters", provides: ["product.mobile/v1", "product.dashboard/v1", "product.automation/v1"], requires: ["runtime.provider/v1"] },
  { id: "research-orchestrator", provides: ["research.route/v1"], requires: ["document.ingest/v1", "bettor.browser-contract/v2"] },
  { id: "runtime-fabric", provides: ["runtime.provider/v1"], requires: [] },
  { id: "security-boundaries", provides: ["security.intent/v1", "security.provider-boundaries/v1"], requires: [] },
];

const EXPECTED: ExpectedChild[] = [
  { issue: 1, ownerId: "owner-a", interfaceVersion: "1.0.0", subjectSha256: "a".repeat(64) },
  { issue: 2, ownerId: "owner-b", interfaceVersion: "1.0.0", subjectSha256: "b".repeat(64) },
];

function evidence(overrides: Partial<ChildEvidence>[] = []): ChildEvidence[] {
  const base: ChildEvidence[] = [
    { issue: 1, ownerId: "owner-a", interfaceVersion: "1.0.0", subjectSha256: "a".repeat(64), claims: ["cap.one"], lane: "alpha", state: "PASS", cleanupCleared: true },
    { issue: 2, ownerId: "owner-b", interfaceVersion: "1.0.0", subjectSha256: "b".repeat(64), claims: ["cap.two"], lane: "beta", state: "PASS", cleanupCleared: true },
  ];
  return base.map((child, index) => ({ ...child, ...(overrides[index] ?? {}) }));
}

function proposed(overrides: Partial<ProposedAggregate> = {}): ProposedAggregate {
  return { lanes: { alpha: "PASS", beta: "PASS" }, invalidatedModules: ["product-adapters", "runtime-fabric"], ...overrides };
}

// CONV-001 in every phase.
function childIdentity(): void {
  ok(childIdentityRefusal(evidence(), EXPECTED) === null, "matching evidence was refused");

  ok(childIdentityRefusal(evidence().slice(0, 1), EXPECTED)?.kind === "absent", "a missing child was not reported absent");
  // The kinds are distinct because the phases map them to different terminals -- #44 splits
  // CHILD_ABSENT from SUBJECT_MISMATCH, and collapsing them here would take that choice away.
  ok(childIdentityRefusal(evidence([{ subjectSha256: "9".repeat(64) }]), EXPECTED)?.kind === "mismatch", "a stale subject was not reported as a mismatch");
  ok(childIdentityRefusal(evidence([{ ownerId: "other" }]), EXPECTED)?.kind === "mismatch", "another owner was admitted");
  ok(childIdentityRefusal(evidence([{ interfaceVersion: "2.0.0" }]), EXPECTED)?.kind === "mismatch", "another interface was admitted");

  // Both sides malformed, so the equality rule passes and only the shape rule can fire.
  const malformed = childIdentityRefusal(
    evidence([{ subjectSha256: "short" }]),
    [{ ...(EXPECTED[0] as ExpectedChild), subjectSha256: "short" }, ...EXPECTED.slice(1)],
  );
  ok(malformed?.kind === "mismatch", "an unaddressed subject was admitted");
  ok(malformed?.detail.includes("unaddressed"), `an unaddressed subject reported "${malformed?.detail}"`);

  const extra = [...evidence(), { ...(evidence()[0] as ChildEvidence), issue: 99 }];
  ok(childIdentityRefusal(extra, EXPECTED)?.kind === "mismatch", "evidence for an unexpected child was admitted");
  red(() => childIdentityRefusal(evidence(), []), "an empty expected set");
}

// CONV-002 / REL-004 in every phase.
function claimUniqueness(): void {
  ok(claimUniquenessRefusal(evidence()) === null, "disjoint claims were refused");
  ok(claimUniquenessRefusal(evidence([{}, { claims: ["cap.one"] }])) !== null, "two owners for one claim were admitted");
  ok(claimUniquenessRefusal(evidence([{ claims: [] }])) !== null, "a child claiming nothing was admitted");
  // One owner repeating its own claim is not a collision.
  ok(claimUniquenessRefusal(evidence([{ claims: ["cap.one", "cap.one"] }])) === null, "one owner was refused for repeating itself");
}

// CONV-008 / CONV-011 / REL-010 in every phase.
function transitiveInvalidation(): void {
  ok(JSON.stringify(invalidatedBy("runtime-fabric", MODULES)) === JSON.stringify(["product-adapters", "runtime-fabric"]),
    `a runtime-fabric change invalidated ${invalidatedBy("runtime-fabric", MODULES).join(", ")}`);

  // The control every phase names: an unrelated module restamped because HEAD moved.
  for (const unrelated of ["document-ingest", "bettor-consumer", "research-orchestrator", "security-boundaries"]) {
    ok(invalidatedBy("runtime-fabric", MODULES).includes(unrelated) === false, `${unrelated} was invalidated`);
  }
  // Each phase has its own root, and the rule serves all of them.
  ok(JSON.stringify(invalidatedBy("product-adapters", MODULES)) === JSON.stringify(["product-adapters"]), "a product-adapters change reached upstream");
  ok(JSON.stringify(invalidatedBy("security-boundaries", MODULES)) === JSON.stringify(["security-boundaries"]), "a security-boundaries change reached upstream");
  ok(JSON.stringify(invalidatedBy("document-ingest", MODULES)) === JSON.stringify(["document-ingest", "research-orchestrator"]), "document-ingest lost its dependent");

  // A fixed point, not one hop.
  const chain: ModuleNode[] = [
    { id: "root", provides: ["cap.a"], requires: [] },
    { id: "middle", provides: ["cap.b"], requires: ["cap.a"] },
    { id: "leaf", provides: [], requires: ["cap.b"] },
    { id: "aside", provides: [], requires: [] },
  ];
  ok(JSON.stringify(invalidatedBy("root", chain)) === JSON.stringify(["leaf", "middle", "root"]), `a chain invalidated ${invalidatedBy("root", chain).join(", ")}`);
  ok(invalidatedBy("root", chain).includes("aside") === false, "an unconnected module was invalidated");

  red(() => invalidatedBy("not-a-module", MODULES), "a module outside the graph");
  // An empty graph also makes the "not in the graph" rule fire, so both produce a contract
  // error and `red()` alone cannot tell them apart -- which the plant check found. The message
  // is what distinguishes them, and the earlier rule says the useful thing.
  let emptyGraph = "";
  try { invalidatedBy("runtime-fabric", []); } catch (error) { emptyGraph = String(error); }
  ok(emptyGraph.includes("the module graph is empty"), `an empty module graph reported "${emptyGraph}"`);
}

// CONV-009 / REL-008 in every phase -- the rule that matters most.
function aggregateHonesty(): void {
  ok(aggregateRefusal(evidence(), proposed(), MODULES, "runtime-fabric") === null, "a supported aggregate was refused");

  // The control: an unreceipted PASS, in both the shapes it takes.
  ok(aggregateRefusal(evidence([{ state: "NOT_EXERCISED" }]), proposed(), MODULES, "runtime-fabric") !== null,
    "a lane claimed PASS while its child was unexercised");
  ok(aggregateRefusal(evidence().slice(0, 1), proposed(), MODULES, "runtime-fabric") !== null,
    "a lane claimed PASS with no child evidence at all");
  // A fabricated failure is the same defect pointing the other way.
  ok(aggregateRefusal(evidence(), proposed({ lanes: { alpha: "FAIL", beta: "PASS" } }), MODULES, "runtime-fabric") !== null,
    "a lane claimed FAIL with no child failure");
  // Evidence the proposal does not account for at all.
  ok(aggregateRefusal(evidence(), proposed({ lanes: { alpha: "PASS" } }), MODULES, "runtime-fabric") !== null,
    "a lane with evidence was omitted from the proposal");

  // Honest downgrades are admitted: less than the evidence supports, never more.
  for (const state of ["NOT_EXERCISED", "NOT_IMPLEMENTED", "ABSENT"] as EvidenceState[]) {
    ok(aggregateRefusal(evidence([{ state: "NOT_EXERCISED" }]), proposed({ lanes: { alpha: state, beta: "PASS" } }), MODULES, "runtime-fabric") === null,
      `an honest ${state} downgrade was refused`);
  }

  // The invalidation set must match exactly: too large is the HEAD-restamp control, too small
  // leaves stale evidence admissible.
  ok(aggregateRefusal(evidence(), proposed({ invalidatedModules: ["product-adapters", "runtime-fabric", "document-ingest"] }), MODULES, "runtime-fabric") !== null,
    "an over-broad invalidation set was admitted");
  ok(aggregateRefusal(evidence(), proposed({ invalidatedModules: ["runtime-fabric"] }), MODULES, "runtime-fabric") !== null,
    "an incomplete invalidation set was admitted");
  ok(aggregateRefusal(evidence(), proposed({ invalidatedModules: [] }), MODULES, "runtime-fabric") !== null,
    "invalidating nothing was admitted");
}

// REL-009. Promotion needs a Human receipt bound to the exact subject.
function humanGate(): void {
  const admit: HumanAdmit = {
    approverId: "owner",
    approvedAtEpochMs: 1_700_000_000_000,
    headSha256: "1".repeat(64),
    lockSha256: "2".repeat(64),
    releaseDigest: "3".repeat(64),
  };
  const expectation: AdmitExpectation = {
    approvers: ["owner"],
    headSha256: "1".repeat(64),
    lockSha256: "2".repeat(64),
    releaseDigest: "3".repeat(64),
    nowEpochMs: 1_700_000_001_000,
    maxAdmitAgeMs: 86_400_000,
  };
  ok(humanAdmitRefusal(admit, expectation) === null, "a genuine admit was refused");

  // #75's three controls, each its own check: an unknown approver is not an expired approval,
  // and neither is an approval for a different release.
  ok(humanAdmitRefusal(null, expectation) !== null, "promotion proceeded with no admit at all");
  ok(humanAdmitRefusal({ ...admit, approverId: "someone-else" }, expectation) !== null, "a wrong-author admit was accepted");
  ok(humanAdmitRefusal({ ...admit, headSha256: "9".repeat(64) }, expectation) !== null, "an admit for another head was accepted");
  ok(humanAdmitRefusal({ ...admit, lockSha256: "9".repeat(64) }, expectation) !== null, "an admit for another lock was accepted");
  ok(humanAdmitRefusal({ ...admit, releaseDigest: "9".repeat(64) }, expectation) !== null, "an admit for another release was accepted");
  ok(humanAdmitRefusal({ ...admit, approvedAtEpochMs: expectation.nowEpochMs - 86_400_001 }, expectation) !== null, "a stale admit was accepted");
  // A future-dated admit is a clock problem, not a fresh one.
  ok(humanAdmitRefusal({ ...admit, approvedAtEpochMs: expectation.nowEpochMs + 1 }, expectation) !== null, "a future-dated admit was accepted");
  // Fractional *and inside the window*, so the age rules cannot claim this fixture and only the
  // integer rule can fire. With `1.5` the age was enormous and "older than the window" was
  // catching it, which left the integer rule dead.
  ok(humanAdmitRefusal({ ...admit, approvedAtEpochMs: expectation.nowEpochMs - 0.5 }, expectation) !== null,
    "a fractional admit time inside the window was accepted");
  // Exactly at the window is admissible; one past it is not.
  ok(humanAdmitRefusal({ ...admit, approvedAtEpochMs: expectation.nowEpochMs - 86_400_000 }, expectation) === null, "an admit at the age boundary was refused");

  // An empty approver list would make every admit fail for the wrong reason, so it is a
  // configuration error rather than a refusal.
  red(() => humanAdmitRefusal(admit, { ...expectation, approvers: [] }), "an empty approver list");
}

// CONV-009 / REL-002. The digest is a function of the inputs and of nothing else.
function deterministicDigest(): void {
  ok(aggregateDigest(evidence(), proposed()) === aggregateDigest(evidence(), proposed()), "the digest is not deterministic");
  ok(aggregateDigest(evidence(), proposed()) === aggregateDigest([...evidence()].reverse(), proposed()), "the digest depends on evidence order");

  const base = aggregateDigest(evidence(), proposed());
  const varied: [string, () => string][] = [
    ["a child subject", () => aggregateDigest(evidence([{ subjectSha256: "9".repeat(64) }]), proposed())],
    ["a child owner", () => aggregateDigest(evidence([{ ownerId: "other" }]), proposed())],
    ["a child interface", () => aggregateDigest(evidence([{ interfaceVersion: "2.0.0" }]), proposed())],
    ["a child lane", () => aggregateDigest(evidence([{ lane: "gamma" }]), proposed())],
    ["a child state", () => aggregateDigest(evidence([{ state: "NOT_EXERCISED" }]), proposed())],
    ["a claimed lane", () => aggregateDigest(evidence(), proposed({ lanes: { alpha: "NOT_EXERCISED", beta: "PASS" } }))],
    ["the invalidation set", () => aggregateDigest(evidence(), proposed({ invalidatedModules: ["runtime-fabric"] }))],
  ];
  for (const [label, compute] of varied) {
    ok(compute() !== base, `changing ${label} did not change the digest`);
  }

  // The separator must not let two adjacent fields collide. A space would: an owner "a b" with
  // interface "c" and an owner "a" with interface "b c" would join identically.
  const collideA = evidence([{ ownerId: "a b", interfaceVersion: "1.0.0" }]);
  const collideB = evidence([{ ownerId: "a", interfaceVersion: "b 1.0.0" }]);
  ok(aggregateDigest(collideA, proposed()) !== aggregateDigest(collideB, proposed()), "two field boundaries collided in the digest");
}

childIdentity();
claimUniqueness();
transitiveInvalidation();
aggregateHonesty();
humanGate();
deterministicDigest();

console.log("CONV-FND GREEN: child identity, claim uniqueness, transitive invalidation, aggregate honesty, human gate, deterministic digest");
