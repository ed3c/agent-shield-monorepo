import {
  DOCS_GATE_OWNED_PATHS,
  assertScope,
  docsGateState,
  runDocsGate,
  type DocsModel,
  type GateId,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`DOC-GATE ${message}`);
}

// A clean governance model: every reference resolves, one SSOT per topic, every governed
// directory covered, every eval packet complete, every PASS backed by a receipt, the stack
// matching, and the generated index current.
function model(overrides: Partial<DocsModel> = {}): DocsModel {
  return {
    releaseId: "agent-shield-docs@0.4.0",
    currentRelease: "agent-shield-docs@0.4.0",
    declaredIds: ["intent-01", "source-01", "issue-93", "eval-rt-01", "doc-architecture", "doc-runtime", "doc-index"],
    documents: [
      { id: "doc-architecture", references: ["intent-01", "source-01"] },
      { id: "doc-runtime", references: ["doc-architecture", "issue-93", "eval-rt-01"] },
      { id: "doc-index", references: ["doc-architecture"] },
    ],
    topics: [
      { topic: "runtime-contracts", ssotId: "doc-architecture", projectionIds: ["doc-runtime", "doc-index"] },
    ],
    directories: [
      { path: "services/runtime-fabric", hasNearestReadme: true, exclusion: null },
      { path: "packages/contracts", hasNearestReadme: true, exclusion: null },
      { path: "third_party/git-town", hasNearestReadme: false, exclusion: { reviewedBy: "owner", reviewedAtRelease: "agent-shield-docs@0.4.0" } },
    ],
    evals: [
      {
        id: "eval-rt-01",
        subject: "runtime provider descriptor",
        preconditions: "an admitted provider subject",
        action: "validate a descriptor",
        observable: "the validator throws or returns",
        negativeControl: "a descriptor whose subject does not bind its id",
        artifact: "a provider receipt",
        statesAndExits: "PASS on bind, FAIL on drift",
        cleanup: "no residue; the validator writes nothing",
        exclusions: "live provider, network",
        owner: "runtime-fabric",
        rollback: "the prior descriptor subject",
      },
    ],
    claims: [
      { subject: "runtime-local-disposable", state: "PASS", basis: "executed-receipt", lane: "provider" },
      { subject: "runtime-e2b", state: "NOT_IMPLEMENTED", basis: "none", lane: "provider" },
      { subject: "signed-in-browser", state: "NOT_EXERCISED", basis: "none", lane: "browser" },
    ],
    pullRequests: [
      { number: 88, branch: "feat/p3-apple-container", baseBranch: "fix/p3-runtime-v2-contract-repair", issueId: "issue-93", allowedPaths: ["services/runtime-fabric/src/providers/apple-container"] },
      { number: 89, branch: "feat/p3-e2b-runtime", baseBranch: "fix/p3-runtime-v2-contract-repair", issueId: "issue-93", allowedPaths: ["services/runtime-fabric/src/providers/e2b"] },
    ],
    admittedStack: [
      { branch: "feat/p3-apple-container", parentBranch: "fix/p3-runtime-v2-contract-repair", issueId: "issue-93" },
      { branch: "feat/p3-e2b-runtime", parentBranch: "fix/p3-runtime-v2-contract-repair", issueId: "issue-93" },
    ],
    generated: [
      { path: "docs/INDEX.md", declaredDigest: "a".repeat(64), recomputedDigest: "a".repeat(64) },
    ],
    ...overrides,
  };
}

const OFFLINE = { githubMetadata: { selected: false, reachable: false } };

function run(overrides: Partial<DocsModel> = {}, options = OFFLINE) {
  return runDocsGate(model(overrides), options);
}

// The positive case: a clean model passes every deterministic gate.
function cleanModel(): void {
  const receipt = run();
  ok(receipt.state === "PASS", `a clean model reported ${receipt.state}: ${receipt.detail}`);
  ok(receipt.findings.length === 0, `a clean model produced ${receipt.findings.length} finding(s)`);
  for (const gate of Object.keys(receipt.gates) as GateId[]) {
    ok(receipt.gates[gate] === "PASS", `${gate} did not pass on a clean model`);
  }
}

// DOC-GATE-009. The mutation suite the issue asks for: plant each defect in turn and require
// the gate that owns it to catch it. A validator whose gates cannot fail is worth nothing,
// and this is the only way to know they can.
function mutationSuite(): void {
  const mutations: Array<{ label: string; gate: GateId; patch: Partial<DocsModel> }> = [
    {
      label: "a broken link",
      gate: "DOC-GATE-001",
      patch: { documents: [...model().documents, { id: "doc-orphan", references: ["intent-99"] }], declaredIds: [...model().declaredIds, "doc-orphan"] },
    },
    {
      label: "a duplicate declared ID",
      gate: "DOC-GATE-001",
      patch: { declaredIds: [...model().declaredIds, "intent-01"] },
    },
    {
      label: "a parallel canonical",
      gate: "DOC-GATE-002",
      patch: { topics: [...model().topics, { topic: "runtime-contracts", ssotId: "doc-runtime", projectionIds: [] }] },
    },
    {
      label: "a projection that does not link its SSOT",
      gate: "DOC-GATE-002",
      patch: { documents: model().documents.map((entry) => (entry.id === "doc-index" ? { ...entry, references: [] } : entry)) },
    },
    {
      label: "a missing README",
      gate: "DOC-GATE-003",
      patch: { directories: [...model().directories, { path: "services/new-thing", hasNearestReadme: false, exclusion: null }] },
    },
    {
      label: "a stale exclusion",
      gate: "DOC-GATE-003",
      patch: {
        directories: model().directories.map((entry) =>
          entry.path === "third_party/git-town" ? { ...entry, exclusion: { reviewedBy: "owner", reviewedAtRelease: "agent-shield-docs@0.3.0" } } : entry),
      },
    },
    {
      label: "a duplicate path owner",
      gate: "DOC-GATE-003",
      patch: { directories: [...model().directories, { path: "packages/contracts", hasNearestReadme: true, exclusion: null }] },
    },
    {
      label: "an incomplete eval packet",
      gate: "DOC-GATE-004",
      patch: { evals: model().evals.map((packet) => ({ ...packet, negativeControl: "" })) },
    },
    {
      label: "an eval packet with no owner",
      gate: "DOC-GATE-004",
      patch: { evals: model().evals.map((packet) => ({ ...packet, owner: "  " })) },
    },
    {
      label: "an ungrounded PASS",
      gate: "DOC-GATE-005",
      patch: { claims: [...model().claims, { subject: "runtime-apple-container", state: "PASS", basis: "package-presence", lane: "provider" }] },
    },
    {
      label: "a PASS resting on prose",
      gate: "DOC-GATE-005",
      patch: { claims: [...model().claims, { subject: "product-expo", state: "PASS", basis: "prose", lane: "device" }] },
    },
    {
      label: "a PASS resting on a bare hash",
      gate: "DOC-GATE-005",
      patch: { claims: [...model().claims, { subject: "bettor-consumer", state: "PASS", basis: "hash-only", lane: "chain" }] },
    },
    {
      label: "a wrong PR parent",
      gate: "DOC-GATE-006",
      patch: { pullRequests: model().pullRequests.map((pr) => (pr.number === 88 ? { ...pr, baseBranch: "main" } : pr)) },
    },
    {
      label: "an orphan branch",
      gate: "DOC-GATE-006",
      patch: { pullRequests: [...model().pullRequests, { number: 99, branch: "feat/nowhere", baseBranch: "main", issueId: "issue-93", allowedPaths: ["docs"] }] },
    },
    {
      label: "an overlapping lease",
      gate: "DOC-GATE-006",
      patch: {
        pullRequests: model().pullRequests.map((pr) =>
          pr.number === 89 ? { ...pr, allowedPaths: ["services/runtime-fabric/src/providers/apple-container"] } : pr),
      },
    },
    {
      label: "a nested overlapping lease",
      gate: "DOC-GATE-006",
      patch: {
        pullRequests: model().pullRequests.map((pr) =>
          pr.number === 89 ? { ...pr, allowedPaths: ["services/runtime-fabric/src"] } : pr),
      },
    },
    {
      label: "a stale generated index",
      gate: "DOC-GATE-007",
      patch: { generated: [{ path: "docs/INDEX.md", declaredDigest: "a".repeat(64), recomputedDigest: "b".repeat(64) }] },
    },
    // The nine defects DOC-GATE-009 names are above. The validator has more rules than that
    // list, and a rule with no planted defect is a rule nobody has shown can fail -- these
    // six were found by disabling each rule in turn and watching the suite stay green.
    {
      label: "one document canonical for two topics",
      gate: "DOC-GATE-002",
      patch: { topics: [...model().topics, { topic: "release-policy", ssotId: "doc-architecture", projectionIds: [] }] },
    },
    {
      // The SSOT must reference itself here, or the "projection does not link its SSOT" rule
      // fires first and the self-projection rule is never exercised.
      label: "a document listed as a projection of itself",
      gate: "DOC-GATE-002",
      patch: {
        topics: [{ topic: "runtime-contracts", ssotId: "doc-architecture", projectionIds: ["doc-architecture"] }],
        documents: model().documents.map((entry) =>
          entry.id === "doc-architecture" ? { ...entry, references: [...entry.references, "doc-architecture"] } : entry),
      },
    },
    {
      label: "a projection that does not exist",
      gate: "DOC-GATE-002",
      patch: { topics: [{ topic: "runtime-contracts", ssotId: "doc-architecture", projectionIds: ["doc-ghost"] }] },
    },
    {
      label: "an exclusion naming no reviewer",
      gate: "DOC-GATE-003",
      patch: {
        directories: model().directories.map((entry) =>
          entry.path === "third_party/git-town" ? { ...entry, exclusion: { reviewedBy: "", reviewedAtRelease: "agent-shield-docs@0.4.0" } } : entry),
      },
    },
    {
      label: "a duplicate eval ID",
      gate: "DOC-GATE-004",
      patch: { evals: [...model().evals, { ...model().evals[0] }] },
    },
    {
      label: "a claim with a state but no basis at all",
      gate: "DOC-GATE-005",
      patch: { claims: [...model().claims, { subject: "runtime-openshell", state: "FAIL", basis: "none", lane: "provider" }] },
    },
    {
      label: "a PR naming an issue the stack does not admit",
      gate: "DOC-GATE-006",
      patch: { pullRequests: model().pullRequests.map((pr) => (pr.number === 88 ? { ...pr, issueId: "issue-01" } : pr)) },
    },
  ];

  for (const mutation of mutations) {
    const receipt = run(mutation.patch);
    ok(receipt.state === "FAIL", `${mutation.label} was not detected`);
    ok(
      receipt.findings.some((finding) => finding.gate === mutation.gate),
      `${mutation.label} was detected by ${receipt.findings.map((finding) => finding.gate).join(",")}, expected ${mutation.gate}`,
    );
    ok(receipt.gates[mutation.gate] === "FAIL", `${mutation.gate} still reported PASS with ${mutation.label} planted`);
  }

  ok(mutations.length >= 24, "the mutation suite lost coverage");
  ok(new Set(mutations.map((mutation) => mutation.gate)).size === 7, "the mutation suite stopped covering every gate");
}

// DOC-GATE-005. The five states stay distinct rather than collapsing into pass and fail.
function stateDistinctness(): void {
  const receipt = run();
  ok(receipt.githubMetadataLane === "NOT_EXERCISED", "an unselected metadata lane was not NOT_EXERCISED");

  const absent = run({}, { githubMetadata: { selected: true, reachable: false } });
  ok(absent.githubMetadataLane === "ABSENT", "an unreachable metadata lane was not ABSENT");
  ok(absent.state === "PASS", "an unreachable metadata lane failed the deterministic run");

  const reachable = run({}, { githubMetadata: { selected: true, reachable: true } });
  ok(reachable.githubMetadataLane === "PASS", "a reachable metadata lane was not PASS");

  // The three lane states are genuinely different values, not two dressed as three.
  ok(new Set([receipt.githubMetadataLane, absent.githubMetadataLane, reachable.githubMetadataLane]).size === 3,
    "the metadata lane collapsed its states");

  // A non-PASS claim with no basis is fine; only a PASS needs a receipt.
  ok(run({ claims: [{ subject: "x", state: "NOT_EXERCISED", basis: "none", lane: "device" }] }).state === "PASS",
    "an honest NOT_EXERCISED claim was rejected");
  ok(run({ claims: [{ subject: "x", state: "FAIL", basis: "prose", lane: "device" }] }).state === "PASS",
    "an honest FAIL claim was rejected");
}

// DOC-GATE-007. One model always produces one receipt, byte for byte.
function determinism(): void {
  const first = JSON.stringify(run());
  const second = JSON.stringify(run());
  ok(first === second, "two runs over one model produced different receipts");

  // Finding order does not depend on the order defects were introduced.
  const forward = run({
    declaredIds: [...model().declaredIds, "intent-01"],
    generated: [{ path: "docs/INDEX.md", declaredDigest: "a".repeat(64), recomputedDigest: "b".repeat(64) }],
  });
  const reverse = run({
    generated: [{ path: "docs/INDEX.md", declaredDigest: "a".repeat(64), recomputedDigest: "b".repeat(64) }],
    declaredIds: [...model().declaredIds, "intent-01"],
  });
  ok(JSON.stringify(forward.findings) === JSON.stringify(reverse.findings), "findings depend on the order defects arrived in");
}

// DOC-GATE-008. The validator declares its own scope and writes nothing.
function scope(): void {
  ok(assertScope(["scripts/docs-gate/rules.ts", ".github/workflows/docs-gate.yml"]).length === 0, "an in-scope change was reported");
  ok(assertScope(["services/runtime-fabric/src/index.ts"]).length === 1, "a product path was accepted as in scope");
  ok(assertScope(["data/status/integration.json"]).length === 1, "a status path was accepted as in scope");
  ok(DOCS_GATE_OWNED_PATHS.length === 2, "the declared scope changed size");
}

function evidenceBoundary(): void {
  ok(docsGateState.repositoryIngest === "NOT_IMPLEMENTED", "a repository ingest lane was claimed");
  ok(docsGateState.githubMetadataLane === "NOT_EXERCISED", "the metadata lane was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const docsGateNeverPasses: NeverPass<typeof docsGateState> = true;
void docsGateNeverPasses;

cleanModel();
mutationSuite();
stateDistinctness();
determinism();
scope();
evidenceBoundary();

console.log("SELFTEST GREEN: DOC-GATE clean model, mutation suite (24 planted defects across 7 gates), state distinctness, determinism, scope");
