import {
  assertConvergenceTransition,
  capabilityRefusal,
  childRefusal,
  converge,
  invalidatedBy,
  isConvergenceOutcome,
  releaseDigest,
  runtimeConvergenceState,
  statusRefusal,
  validateConvergenceLifecycle,
  type ChildReceipt,
  type ConvergenceOutcome,
  type ConvergenceRequest,
  type ExpectedChild,
  type ModuleNode,
  type ProposedStatus,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`RT-CONV ${message}`);
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

// The real module graph, as `.arena/modules/*/module.json` records it. Using the actual
// capability strings rather than invented ones is what makes RT-CONV-008 a statement about this
// repository instead of about a fixture.
const MODULES: ModuleNode[] = [
  { id: "bettor-consumer", provides: ["bettor.consumer/v1", "bettor.browser-contract/v2"], requires: [] },
  { id: "document-ingest", provides: ["document.ingest/v1"], requires: [] },
  { id: "product-adapters", provides: ["product.mobile/v1", "product.dashboard/v1", "product.automation/v1"], requires: ["runtime.provider/v1"] },
  { id: "research-orchestrator", provides: ["research.route/v1"], requires: ["document.ingest/v1", "bettor.browser-contract/v2"] },
  { id: "runtime-fabric", provides: ["runtime.provider/v1"], requires: [] },
  { id: "security-boundaries", provides: ["security.intent/v1", "security.provider-boundaries/v1"], requires: [] },
];

const EXPECTED: ExpectedChild[] = [
  { issue: 39, providerId: "apple-container-local", interfaceVersion: "1.0.0", providerSubjectSha256: "a".repeat(64) },
  { issue: 40, providerId: "e2b-firecracker-cloud", interfaceVersion: "1.0.0", providerSubjectSha256: "b".repeat(64) },
  { issue: 43, providerId: "hybrid-exchange", interfaceVersion: "1.0.0", providerSubjectSha256: "c".repeat(64) },
];

function receipts(overrides: Partial<ChildReceipt>[] = []): ChildReceipt[] {
  const base: ChildReceipt[] = [
    { issue: 39, providerId: "apple-container-local", interfaceVersion: "1.0.0", providerSubjectSha256: "a".repeat(64), capabilities: ["runtime.local"], route: "local", state: "PASS", cleanupCleared: true },
    { issue: 40, providerId: "e2b-firecracker-cloud", interfaceVersion: "1.0.0", providerSubjectSha256: "b".repeat(64), capabilities: ["runtime.cloud"], route: "cloud", state: "PASS", cleanupCleared: true },
    { issue: 43, providerId: "hybrid-exchange", interfaceVersion: "1.0.0", providerSubjectSha256: "c".repeat(64), capabilities: ["runtime.hybrid"], route: "hybrid", state: "PASS", cleanupCleared: true },
  ];
  return base.map((r, i) => ({ ...r, ...(overrides[i] ?? {}) }));
}

// The computed invalidation set for a runtime-fabric change: itself plus product-adapters,
// which requires `runtime.provider/v1`.
const INVALIDATED = ["product-adapters", "runtime-fabric"];

function status(overrides: Partial<ProposedStatus> = {}): ProposedStatus {
  return {
    routes: { local: "PASS", cloud: "PASS", hybrid: "PASS" },
    invalidatedModules: [...INVALIDATED],
    ...overrides,
  };
}

function run(overrides: Partial<ConvergenceRequest> = {}) {
  return converge({ receipts: receipts(), expected: EXPECTED, modules: MODULES, status: status(), ...overrides }).receipt;
}

// RT-CONV-001. Every included receipt names the expected interface and immutable child subject.
function childIdentity(): void {
  const green = run();
  ok(green.outcome === "HUMAN_REVIEW", `a supported aggregate reported ${green.outcome}`);
  ok(childRefusal(receipts(), EXPECTED) === null, "matching receipts were refused");

  const absent = run({ receipts: receipts().slice(0, 2) });
  ok(absent.outcome === "CHILD_ABSENT", `a missing child reported ${absent.outcome}`);

  // The control the eval names: mix in one stale receipt. It is otherwise indistinguishable
  // from a current one, which is why the subject digest is compared rather than merely required.
  const stale = run({ receipts: receipts([{}, { providerSubjectSha256: "9".repeat(64) }]) });
  ok(stale.outcome === "SUBJECT_MISMATCH", `a stale child subject reported ${stale.outcome}`);

  ok(run({ receipts: receipts([{ providerId: "other-provider" }]) }).outcome === "SUBJECT_MISMATCH", "a child reporting another provider was admitted");
  ok(run({ receipts: receipts([{ interfaceVersion: "2.0.0" }]) }).outcome === "SUBJECT_MISMATCH", "a child reporting another interface was admitted");

  // Both sides malformed, so the equality rule passes and only the shape rule can fire. The
  // plant check found it dead: an expected digest is normally well-formed, so a malformed
  // receipt digest always differed from it first.
  const bothMalformed = run({
    expected: [{ ...(EXPECTED[0] as ExpectedChild), providerSubjectSha256: "short" }, ...EXPECTED.slice(1)],
    receipts: receipts([{ providerSubjectSha256: "short" }]),
  });
  ok(bothMalformed.outcome === "SUBJECT_MISMATCH", `an unaddressed child subject reported ${bothMalformed.outcome}`);

  // A receipt nobody pinned is evidence from an unexpected subject, not a bonus.
  const extra = [...receipts(), { ...receipts()[0] as ChildReceipt, issue: 99 }];
  ok(run({ receipts: extra }).outcome === "SUBJECT_MISMATCH", "a receipt for an unexpected child was admitted");

  red(() => converge({ receipts: receipts(), expected: [], modules: MODULES, status: status() }), "an empty expected set");
  // An empty graph also makes `invalidatedBy` throw, so both rules produce a contract error and
  // `red()` alone cannot tell them apart -- which the plant check found. The message is what
  // distinguishes them, and the earlier rule fails before any child work is done.
  let emptyGraph = "";
  try { converge({ receipts: receipts(), expected: EXPECTED, modules: [], status: status() }); }
  catch (error) { emptyGraph = String(error); }
  ok(emptyGraph.includes("the module graph is empty"), `an empty module graph reported "${emptyGraph}"`);
}

// RT-CONV-002. One provider per capability, detected before anything runs.
function capabilityUniqueness(): void {
  ok(capabilityRefusal(receipts()) === null, "disjoint capabilities were refused");

  const duplicated = receipts([{}, { capabilities: ["runtime.local"] }]);
  ok(capabilityRefusal(duplicated) !== null, "two providers claiming one capability were admitted");
  const conflict = run({ receipts: duplicated });
  ok(conflict.outcome === "CAPABILITY_CONFLICT", `a duplicate capability reported ${conflict.outcome}`);
  // Before execution: the matrix never started.
  ok(conflict.lifecycle.includes("MATRIX_RUNNING") === false, "a capability conflict reached the matrix");

  ok(capabilityRefusal(receipts([{ capabilities: [] }])) !== null, "a child selecting no capability was admitted");
  // The same provider claiming its own capability twice is not a conflict.
  ok(capabilityRefusal(receipts([{ capabilities: ["runtime.local", "runtime.local"] }])) === null, "one provider was refused for repeating itself");
}

// RT-CONV-008. Staleness follows the capability graph, not the commit.
function transitiveInvalidation(): void {
  ok(JSON.stringify(invalidatedBy("runtime-fabric", MODULES)) === JSON.stringify(INVALIDATED),
    `a runtime-fabric change invalidates ${invalidatedBy("runtime-fabric", MODULES).join(", ")}`);

  // The control: restamping an unrelated module solely because HEAD changed. A commit touches
  // the whole tree; evidence staleness does not.
  for (const unrelated of ["document-ingest", "bettor-consumer", "research-orchestrator", "security-boundaries"]) {
    ok(invalidatedBy("runtime-fabric", MODULES).includes(unrelated) === false, `${unrelated} was invalidated by a runtime-fabric change`);
    const overreach = status({ invalidatedModules: [...INVALIDATED, unrelated] });
    ok(run({ status: overreach }).outcome === "RELEASE_DRIFT", `restamping ${unrelated} was admitted`);
  }
  // Too small is the opposite failure: stale evidence stays admissible.
  ok(run({ status: status({ invalidatedModules: ["runtime-fabric"] }) }).outcome === "RELEASE_DRIFT", "omitting a dependent was admitted");
  ok(run({ status: status({ invalidatedModules: [] }) }).outcome === "RELEASE_DRIFT", "invalidating nothing was admitted");

  // A dependent's dependents are stale too. Stopping at depth one looks correct on this graph
  // and is wrong on the next one, so the fixed point is asserted with a chain.
  const chain: ModuleNode[] = [
    { id: "root", provides: ["cap.a"], requires: [] },
    { id: "middle", provides: ["cap.b"], requires: ["cap.a"] },
    { id: "leaf", provides: [], requires: ["cap.b"] },
    { id: "aside", provides: [], requires: [] },
  ];
  ok(JSON.stringify(invalidatedBy("root", chain)) === JSON.stringify(["leaf", "middle", "root"]),
    `a chain invalidated ${invalidatedBy("root", chain).join(", ")}`);
  ok(invalidatedBy("root", chain).includes("aside") === false, "an unconnected module was invalidated");
  ok(JSON.stringify(invalidatedBy("leaf", chain)) === JSON.stringify(["leaf"]), "invalidating a leaf reached upstream");

  red(() => invalidatedBy("not-a-module", MODULES), "a module outside the graph");
}

// RT-CONV-009. The release follows the receipts, and a claim without evidence is drift.
function deterministicRelease(): void {
  ok(releaseDigest(receipts(), status()) === releaseDigest(receipts(), status()), "the release digest is not deterministic");
  ok(releaseDigest(receipts(), status()) === releaseDigest([...receipts()].reverse(), status()), "the release digest depends on receipt order");

  const varied: [string, () => string][] = [
    ["a child subject", () => releaseDigest(receipts([{ providerSubjectSha256: "9".repeat(64) }]), status())],
    ["a child route state", () => releaseDigest(receipts([{ state: "NOT_EXERCISED" }]), status())],
    ["a claimed route", () => releaseDigest(receipts(), status({ routes: { local: "PASS", cloud: "NOT_EXERCISED", hybrid: "PASS" } }))],
    ["the invalidation set", () => releaseDigest(receipts(), status({ invalidatedModules: ["runtime-fabric"] }))],
  ];
  const base = releaseDigest(receipts(), status());
  for (const [label, compute] of varied) {
    ok(compute() !== base, `changing ${label} did not change the release digest`);
  }

  // The control the eval names, and the single most important rule here: an unreceipted PASS.
  const unexercised = receipts([{ state: "NOT_EXERCISED" }]);
  ok(statusRefusal(unexercised, status(), MODULES) !== null, "a route claimed PASS while its child was unexercised");
  ok(run({ receipts: unexercised }).outcome === "RELEASE_DRIFT", "an unreceipted PASS was admitted");

  // A route claimed PASS when no child covers it at all. Every other fixture supplies all three
  // routes, which left this rule dead -- the "a child dissents" rule was catching them.
  const twoChildren = { expected: EXPECTED.slice(0, 2), receipts: receipts().slice(0, 2) };
  ok(statusRefusal(twoChildren.receipts, status(), MODULES) !== null, "a route with no child receipt was claimed PASS");
  ok(run(twoChildren).outcome === "RELEASE_DRIFT", "an uncovered route claimed PASS was admitted");
  // And declaring it honestly is admitted.
  ok(run({ ...twoChildren, status: status({ routes: { local: "PASS", cloud: "PASS", hybrid: "NOT_IMPLEMENTED" } }) }).outcome === "HUMAN_REVIEW",
    "an honestly uncovered route was refused");

  const notImplemented = receipts([{ state: "NOT_IMPLEMENTED" }]);
  ok(run({ receipts: notImplemented }).outcome === "RELEASE_DRIFT", "a PASS over an unimplemented child was admitted");

  // Claiming a failure nobody reported is the same defect pointing the other way.
  ok(statusRefusal(receipts(), status({ routes: { local: "FAIL", cloud: "PASS", hybrid: "PASS" } }), MODULES) !== null,
    "a route claimed FAIL with no child failure");

  // Honest downgrades are admitted: the proposal may report less than the receipts support.
  const honest = run({ receipts: unexercised, status: status({ routes: { local: "NOT_EXERCISED", cloud: "PASS", hybrid: "PASS" } }) });
  ok(honest.outcome === "HUMAN_REVIEW", `an honest downgrade reported ${honest.outcome}`);
  ok(honest.releaseDigest !== null, "a supported aggregate rendered no release digest");
  // And a refused run renders none, so a drifted proposal cannot leave a digest behind.
  ok(run({ receipts: unexercised }).releaseDigest === null, "a drifted proposal rendered a release digest");
}

// Route failures and cleanup are distinct, and each route has its own terminal.
function routeAndCleanupSeparation(): void {
  const cases: [string, Partial<ChildReceipt>[], string][] = [
    ["a local failure", [{ state: "FAIL" }], "LOCAL_FAIL"],
    ["a cloud failure", [{}, { state: "FAIL" }], "CLOUD_FAIL"],
    ["a hybrid failure", [{}, {}, { state: "FAIL" }], "HYBRID_FAIL"],
  ];
  for (const [label, overrides, expected] of cases) {
    const receipt = run({ receipts: receipts(overrides), status: status({ routes: { local: "PASS", cloud: "PASS", hybrid: "PASS" } }) });
    ok(receipt.outcome === expected, `${label} reported ${receipt.outcome}, expected ${expected}`);
  }
  const dirty = run({ receipts: receipts([{ cleanupCleared: false }]) });
  ok(dirty.outcome === "CLEANUP_FAIL", `uncleared residue reported ${dirty.outcome}`);
  // Cleanup is checked after the routes: a failed route and a dirty run are two facts, and the
  // route failure is the more useful one to report first.
  const both = run({ receipts: receipts([{ state: "FAIL", cleanupCleared: false }]) });
  ok(both.outcome === "LOCAL_FAIL", `a failed and dirty run reported ${both.outcome}`);
}

// Promotion is Human Admit, so no deterministic run may reach ADMITTED.
function promotionIsHuman(): void {
  ok(run().outcome === "HUMAN_REVIEW", "a clean run did not stop at human review");
  ok(isConvergenceOutcome("HUMAN_REVIEW"), "HUMAN_REVIEW is not an outcome");
  ok(isConvergenceOutcome("RELEASE_RENDERED") === false, "RELEASE_RENDERED is treated as an outcome");

  // ADMITTED and HUMAN_REJECTED are reachable only from HUMAN_REVIEW, and nothing else reaches
  // them -- which is what makes "the convergence promoted itself" unexpressible.
  assertConvergenceTransition("HUMAN_REVIEW", "ADMITTED");
  assertConvergenceTransition("HUMAN_REVIEW", "HUMAN_REJECTED");
  red(() => assertConvergenceTransition("RELEASE_RENDERED", "ADMITTED"), "promoting a rendered release directly");
  red(() => assertConvergenceTransition("CLEANUP_CHECKED", "ADMITTED"), "promoting from a cleanup check");
  red(() => assertConvergenceTransition("CHILDREN_PENDING", "ADMITTED"), "promoting before any child");

  red(() => assertConvergenceTransition("SUBJECTS_PINNED", "MATRIX_RUNNING"), "running the matrix before the registry resolved");
  red(() => assertConvergenceTransition("MATRIX_RUNNING", "RELEASE_RENDERED"), "rendering a release before the controls");
  red(() => validateConvergenceLifecycle(["CHILDREN_PENDING", "ADMITTED"]), "a trace that skipped the whole convergence");
  red(() => validateConvergenceLifecycle(["SUBJECTS_PINNED", "CAPABILITY_CONFLICT"]), "a trace that did not start at CHILDREN_PENDING");
  red(() => validateConvergenceLifecycle(["CHILDREN_PENDING", "SUBJECTS_PINNED"]), "a trace that stopped short of an outcome");
  ok(validateConvergenceLifecycle(["CHILDREN_PENDING", "CHILD_ABSENT"]) === "CHILD_ABSENT", "a legal trace was refused");
}

function stateSeparation(): void {
  const outcomes = new Set<ConvergenceOutcome>();
  const fixtures: [string, () => ConvergenceOutcome][] = [
    ["human review", () => run().outcome],
    ["child absent", () => run({ receipts: receipts().slice(0, 2) }).outcome],
    ["subject mismatch", () => run({ receipts: receipts([{ providerSubjectSha256: "9".repeat(64) }]) }).outcome],
    ["capability conflict", () => run({ receipts: receipts([{}, { capabilities: ["runtime.local"] }]) }).outcome],
    ["local fail", () => run({ receipts: receipts([{ state: "FAIL" }]) }).outcome],
    ["cloud fail", () => run({ receipts: receipts([{}, { state: "FAIL" }]) }).outcome],
    ["hybrid fail", () => run({ receipts: receipts([{}, {}, { state: "FAIL" }]) }).outcome],
    ["cleanup fail", () => run({ receipts: receipts([{ cleanupCleared: false }]) }).outcome],
    ["release drift", () => run({ status: status({ invalidatedModules: [] }) }).outcome],
  ];
  for (const [label, invoke] of fixtures) {
    const outcome = invoke();
    ok(outcome !== undefined, `${label} produced no outcome`);
    outcomes.add(outcome);
  }
  ok(outcomes.size === 9, `the fixtures cover ${outcomes.size} distinct outcomes, expected 9`);
  // ADMITTED and HUMAN_REJECTED have no deterministic producer by design -- they are the human's
  // two answers. Asserting that is better than manufacturing a fixture for them.
  ok(fixtures.every(([, invoke]) => invoke() !== "ADMITTED"), "a deterministic run reached ADMITTED");
  ok(fixtures.every(([, invoke]) => invoke() !== "HUMAN_REJECTED"), "a deterministic run reached HUMAN_REJECTED");
}

function evidenceBoundary(): void {
  ok(runtimeConvergenceState.childIdentity === "NOT_EXERCISED", "child identity was claimed");
  ok(runtimeConvergenceState.capabilityUniqueness === "NOT_EXERCISED", "capability uniqueness was claimed");
  ok(runtimeConvergenceState.transitiveInvalidation === "NOT_EXERCISED", "transitive invalidation was claimed");
  ok(runtimeConvergenceState.deterministicRelease === "NOT_EXERCISED", "a deterministic release was claimed");
  // The five that need the merged provider leaves.
  for (const key of ["localIndependence", "cloudIndependence", "hybridProtocol", "policyPtyComposition", "crossProviderCleanup"] as const) {
    ok(runtimeConvergenceState[key] === "NOT_IMPLEMENTED", `${key} was claimed`);
  }
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const convergenceNeverPasses: NeverPass<typeof runtimeConvergenceState> = true;
void convergenceNeverPasses;

childIdentity();
capabilityUniqueness();
transitiveInvalidation();
deterministicRelease();
routeAndCleanupSeparation();
promotionIsHuman();
stateSeparation();
evidenceBoundary();

console.log("RT-CONV GREEN: child identity, capability uniqueness, transitive invalidation, deterministic release, route/cleanup separation, human-owned promotion");
