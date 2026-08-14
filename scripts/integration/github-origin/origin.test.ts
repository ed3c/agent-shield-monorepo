import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import {
  COMMIT,
  FakeGitHubOrigin,
  PLANTED_TOKEN,
  RELEASE_DIGEST,
  RELEASE_ID,
  TREE,
  assertOriginIdentity,
  assertOriginTransition,
  assertReleaseSubject,
  githubOriginState,
  isOriginOutcome,
  originReceiptRefusal,
  validateOriginLifecycle,
  verifyGitHubOrigin,
  type OriginIdentity,
  type OriginOutcome,
  type OriginReceipt,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-GH ${message}`);
}

// A control that only asserts "something threw" also passes when a later line throws a
// TypeError for an unrelated reason, which makes a dead guard look load-bearing under a plant
// check. Every control must fail through this verifier's own contract error.
function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid origin contract: "), `${message} threw "${text}" rather than an origin contract error`);
}

const FULL_NAME = "ed3c/agent-shield-monorepo";

function identity(overrides: Partial<OriginIdentity> = {}): OriginIdentity {
  return {
    host: "github.com",
    owner: "ed3c",
    repository: "agent-shield-monorepo",
    trackedUrl: `git@github.com:${FULL_NAME}.git`,
    expectedFullName: FULL_NAME,
    ...overrides,
  };
}

function subject(overrides: Partial<ReleaseSubject> = {}): ReleaseSubject {
  return {
    repository: FULL_NAME,
    commit: COMMIT,
    tree: TREE,
    releaseId: RELEASE_ID,
    releaseDigest: RELEASE_DIGEST,
    ...overrides,
  };
}

function verify(
  transport = new FakeGitHubOrigin(),
  overrides: { identity?: Partial<OriginIdentity>; subject?: Partial<ReleaseSubject>; ref?: string } = {},
): OriginReceipt {
  return verifyGitHubOrigin({
    identity: identity(overrides.identity),
    subject: subject(overrides.subject),
    ref: overrides.ref ?? COMMIT,
    transport,
  }).receipt;
}

// INT-GH-001. Exact origin identity, and a tracked URL that carries no credential.
function exactOrigin(): void {
  assertOriginIdentity(identity());
  assertOriginIdentity(identity({ trackedUrl: `https://github.com/${FULL_NAME}.git` }));

  // The control the issue names: a credential-bearing URL.
  //
  // The userinfo rule and the "authority is github.com" rule overlap -- userinfo is part of the
  // authority, so a token URL fails both. The plant check found that, and the fix is not to
  // delete one: they differ in what they *say*. The host rule interpolates the authority, so if
  // it fired first the error message would echo the token. The control therefore asserts the
  // message, not merely that something threw.
  const tokenUrl = `https://x-access-token:${PLANTED_TOKEN}@github.com/${FULL_NAME}.git`;
  red(() => assertOriginIdentity(identity({ trackedUrl: tokenUrl })), "a token-bearing https remote");
  let thrown = "";
  try { assertOriginIdentity(identity({ trackedUrl: tokenUrl })); } catch (error) { thrown = String(error); }
  ok(thrown.includes("embeds credentials"), `a token-bearing remote reported "${thrown}"`);
  ok(thrown.includes(PLANTED_TOKEN) === false, "the refusal echoed the token back in its message");
  red(() => assertOriginIdentity(identity({ trackedUrl: `https://user@github.com/${FULL_NAME}.git` })), "a userinfo-bearing https remote");
  red(() => assertOriginIdentity(identity({ trackedUrl: `https://github.example.invalid/${FULL_NAME}.git` })), "another https host");
  red(() => assertOriginIdentity(identity({ trackedUrl: `file:///w/mirror/${FULL_NAME}` })), "a non-Git remote scheme");
  red(() => assertOriginIdentity(identity({ trackedUrl: "git@github.com:someone/other.git" })), "an ssh remote for another repository");

  // A fork carries the same tree under a different identity. The remote is the fork's own, so
  // the "URL names the admitted repository" rule passes and only the expected-name rule can
  // fire -- which the plant check needed, because a fixture that also broke the URL was being
  // caught there instead.
  red(() => assertOriginIdentity(identity({
    owner: "someone-else",
    trackedUrl: "git@github.com:someone-else/agent-shield-monorepo.git",
  })), "a fork owner");
  red(() => assertOriginIdentity(identity({
    repository: "other-repo",
    trackedUrl: "git@github.com:ed3c/other-repo.git",
  })), "another repository name");
  // Likewise shaped so that only the name rule can fire.
  red(() => assertOriginIdentity(identity({
    owner: "bad owner",
    expectedFullName: "bad owner/agent-shield-monorepo",
    trackedUrl: "git@github.com:bad owner/agent-shield-monorepo.git",
  })), "a malformed owner");
  red(() => assertOriginIdentity(identity({ host: "gitlab.com" as "github.com" })), "another origin host");

  assertReleaseSubject(subject());
  red(() => assertReleaseSubject(subject({ commit: "short" })), "an abbreviated commit");
  red(() => assertReleaseSubject(subject({ tree: "short" })), "an abbreviated tree");
  red(() => assertReleaseSubject(subject({ releaseDigest: "short" })), "an unaddressed release digest");
  red(() => assertReleaseSubject(subject({ releaseId: "" })), "an absent release identifier");
  red(() => assertReleaseSubject(subject({ repository: "agent-shield-monorepo" })), "a repository without an owner");

  // The identity and the release subject must agree, or the run verifies one repository against
  // another repository's release.
  red(() => verify(new FakeGitHubOrigin(), { subject: { repository: "ed3c/other" } }), "a release subject for another repository");
}

// INT-GH-002. Only an immutable ref, and never a fallback.
function immutableReachability(): void {
  const green = verify();
  ok(green.outcome === "RECEIPT_EMITTED", `a clean run reported ${green.outcome}`);
  ok(green.refKind === "commit", `a clean run resolved a ${green.refKind}`);

  const missing = verify(new FakeGitHubOrigin(), { ref: "absent" });
  ok(missing.outcome === "REF_ABSENT", `an absent ref reported ${missing.outcome}`);

  // The control the issue names: a missing commit while `main` is available. There is no
  // fallback in the verifier, so a movable ref is refused rather than followed.
  for (const kind of ["branch", "lightweight-tag"] as const) {
    const movable = new FakeGitHubOrigin();
    movable.refKind = kind;
    const receipt = verify(movable, { ref: "main" });
    ok(receipt.outcome === "REF_ABSENT", `a ${kind} ref reported ${receipt.outcome}`);
    ok(receipt.detail.includes("move under the same name"), `a ${kind} ref reported "${receipt.detail}"`);
  }
  // An annotated tag is immutable enough: retagging replaces the object rather than repointing
  // a plain ref, so it is admitted while a lightweight tag is not.
  const annotated = new FakeGitHubOrigin();
  annotated.refKind = "annotated-tag";
  ok(verify(annotated).outcome === "RECEIPT_EMITTED", "an annotated tag was refused");

  const malformed = new FakeGitHubOrigin();
  malformed.resolvedCommit = "not-an-oid";
  ok(verify(malformed).outcome === "REF_ABSENT", "a malformed resolved object identifier was admitted");

  const other = new FakeGitHubOrigin();
  other.resolvedCommit = "9".repeat(40);
  ok(verify(other).outcome === "COMMIT_MISMATCH", "a ref resolving to another commit was admitted");
}

// INT-GH-003. Tree and manifest, checked separately from the commit.
function treeAndManifest(): void {
  // The control the issue names: the same commit label with a mismatched artifact. A commit
  // identity can be preserved while the tree it points at is not the released one.
  const otherTree = new FakeGitHubOrigin();
  otherTree.fetchedTree = "8".repeat(40);
  ok(verify(otherTree).outcome === "TREE_MISMATCH", "a commit pointing at another tree was admitted");

  const otherCommitObject = new FakeGitHubOrigin();
  otherCommitObject.fetchedCommit = "7".repeat(40);
  ok(verify(otherCommitObject).outcome === "COMMIT_MISMATCH", "another commit object was admitted");

  const otherRelease = new FakeGitHubOrigin();
  otherRelease.manifestReleaseId = "agent-shield-module-set@0.2.0";
  ok(verify(otherRelease).outcome === "MANIFEST_MISMATCH", "another release identifier was admitted");

  // INT-GH-006. One mutated byte changes the manifest digest and nothing else.
  const tampered = new FakeGitHubOrigin();
  tampered.manifestDigest = "4".repeat(64);
  const mutated = verify(tampered);
  ok(mutated.outcome === "MANIFEST_MISMATCH", `a tampered manifest reported ${mutated.outcome}`);
  ok(mutated.lifecycle.includes("TREE_VERIFIED"), "a tampered manifest failed before the tree was verified");

  const noManifest = new FakeGitHubOrigin();
  noManifest.readsManifest = false;
  ok(verify(noManifest).outcome === "FETCH_FAILED", "an unreadable manifest was not a fetch failure");

  const noCommit = new FakeGitHubOrigin();
  noCommit.fetches = false;
  ok(verify(noCommit).outcome === "FETCH_FAILED", "an unfetchable commit was not a fetch failure");
}

// INT-GH-004. A fresh clone, in each of the three ways it can quietly not be one.
function freshClone(): void {
  const cases: [string, (t: FakeGitHubOrigin) => void][] = [
    ["a clone that reused the local object cache", (t) => { t.cloneUsedLocalObjectCache = true; }],
    ["a clone borrowing a reference repository", (t) => { t.cloneReferenceRepository = "/w/owner-checkout"; }],
    ["a clone made from a local path", (t) => { t.cloneFromLocalPath = true; }],
    ["a clone that did not complete", (t) => { t.clones = false; }],
  ];
  for (const [label, mutate] of cases) {
    const transport = new FakeGitHubOrigin();
    mutate(transport);
    const receipt = verify(transport);
    ok(receipt.outcome === "FRESH_CLONE_FAILED", `${label} reported ${receipt.outcome}`);
    ok(receipt.freshClone === false, `${label} was recorded as a fresh clone`);
  }

  // The clone is compared against the release subject rather than against the API's answer, so
  // a clone and an API that agree with each other but not with the release still fails.
  const driftedCommit = new FakeGitHubOrigin();
  driftedCommit.clonedCommit = "6".repeat(40);
  ok(verify(driftedCommit).outcome === "COMMIT_MISMATCH", "a clone at another commit was admitted");

  const driftedTree = new FakeGitHubOrigin();
  driftedTree.clonedTree = "5".repeat(40);
  ok(verify(driftedTree).outcome === "TREE_MISMATCH", "a clone of another tree was admitted");

  ok(verify().freshClone, "a clean run did not record a fresh clone");
}

// INT-GH-005. Absent, unauthenticated, refused and failed are four facts.
function authSeparation(): void {
  const unreachable = new FakeGitHubOrigin();
  unreachable.reachable = false;
  ok(verify(unreachable).outcome === "ORIGIN_ABSENT", "an unreachable origin was not reported as absent");

  const refused = new FakeGitHubOrigin();
  refused.refused = true;
  ok(verify(refused).outcome === "AUTH_REFUSED", "a refused authorization was not reported as refused");

  const anonymous = new FakeGitHubOrigin();
  anonymous.authenticated = false;
  ok(verify(anonymous).outcome === "AUTH_ABSENT", "an unauthenticated run was not reported as absent authorization");

  // Refusal outranks absence: something was presented and rejected, which is a different fact
  // from nothing being presented, and reporting it as AUTH_ABSENT invites a pointless retry.
  const both = new FakeGitHubOrigin();
  both.refused = true;
  both.authenticated = false;
  ok(verify(both).outcome === "AUTH_REFUSED", "a refusal was reported as absent authorization");

  // INT-GH-007. The receipt has no URL, log or token field, so there is nothing to redact --
  // but the canary proves that stays true rather than asserting it.
  for (const [label, receipt] of [
    ["a clean", verify()],
    ["an unreachable", verify(unreachable)],
    ["a refused", verify(refused)],
  ] as const) {
    const text = JSON.stringify(receipt);
    ok(text.includes(PLANTED_TOKEN) === false, `${label} receipt carried the planted token`);
    ok(text.includes("git@") === false, `${label} receipt carried an ssh remote`);
    ok(text.includes("https://") === false, `${label} receipt carried a URL`);
  }
  type Forbids<T, K extends string> = K extends keyof T ? never : true;
  const receiptHasNoUrl: Forbids<OriginReceipt, "trackedUrl" | "url" | "token" | "log" | "workdir"> = true;
  void receiptHasNoUrl;
}

// INT-GH-007. Cleanup accounting, in each of the three ways a run leaks.
function cleanupAccounting(): void {
  const leaks: [string, (t: FakeGitHubOrigin) => void][] = [
    ["a clone", (t) => { t.retainedClones = 1; }],
    ["a process", (t) => { t.retainedProcesses = 1; }],
    ["a credential stream", (t) => { t.retainedCredentialStreams = 1; }],
  ];
  for (const [label, leak] of leaks) {
    const transport = new FakeGitHubOrigin();
    leak(transport);
    const receipt = verify(transport);
    // The run itself succeeded, so the outcome stays RECEIPT_EMITTED and the cleanup fact is
    // recorded separately -- two facts, not one. The receipt refusal below is what stops a
    // leaking run being admitted downstream.
    ok(receipt.cleanupCleared === false, `${label} left behind was reported as cleared`);
    ok(originReceiptRefusal(receipt, subject()) !== null, `${label} left behind was admitted by the verifier`);
  }
  ok(verify().cleanupCleared, "a clean run was reported as leaking");
}

// INT-GH-006. A receipt is checkable by a party that did not produce it.
function receiptAdmission(): void {
  const receipt = verify();
  ok(originReceiptRefusal(receipt, subject()) === null, "a genuine receipt was refused");

  const forgeries: [string, OriginReceipt][] = [
    ["another schema", { ...receipt, schema: "agent-shield/other/v1" as typeof receipt.schema }],
    ["another origin", { ...receipt, origin: "forgejo" as "github" }],
    ["another repository", { ...receipt, repositoryFullName: "someone/else" }],
    ["another commit", { ...receipt, subject: { ...receipt.subject, commit: "9".repeat(40) } }],
    ["another tree", { ...receipt, subject: { ...receipt.subject, tree: "9".repeat(40) } }],
    ["another release", { ...receipt, subject: { ...receipt.subject, releaseId: "other@1" } }],
    ["another release digest", { ...receipt, subject: { ...receipt.subject, releaseDigest: "9".repeat(64) } }],
    ["a non-emitting outcome", { ...receipt, outcome: "REF_ABSENT" }],
    ["an absent fresh clone", { ...receipt, freshClone: false }],
    ["retained resources", { ...receipt, cleanupCleared: false }],
    ["a branch ref", { ...receipt, refKind: "branch" }],
    ["a lightweight tag ref", { ...receipt, refKind: "lightweight-tag" }],
    ["an absent ref kind", { ...receipt, refKind: null }],
  ];
  for (const [label, forged] of forgeries) {
    ok(originReceiptRefusal(forged, subject()) !== null, `${label} was admitted`);
  }
  ok(originReceiptRefusal(receipt, subject({ commit: "9".repeat(40) })) !== null, "a receipt for another subject was admitted");
}

// The transition table itself. The verifier only ever builds legal traces, so without this the
// enforcement point is type-checked and never executed.
function transitionLegality(): void {
  ok(validateOriginLifecycle(["UNRESOLVED", "ORIGIN_ABSENT"]) === "ORIGIN_ABSENT", "a legal trace was refused");
  ok(isOriginOutcome("RECEIPT_EMITTED"), "RECEIPT_EMITTED is not recognised as an outcome");
  ok(isOriginOutcome("TREE_VERIFIED") === false, "TREE_VERIFIED is treated as an outcome");

  red(() => assertOriginTransition("REACHABILITY_CHECKED", "RECEIPT_EMITTED"), "emitting a receipt from a reachability check");
  red(() => assertOriginTransition("COMMIT_VERIFIED", "RECEIPT_EMITTED"), "emitting a receipt without the tree");
  red(() => assertOriginTransition("TREE_VERIFIED", "RECEIPT_EMITTED"), "emitting a receipt without the manifest");
  red(() => assertOriginTransition("RELEASE_MANIFEST_VERIFIED", "RECEIPT_EMITTED"), "emitting a receipt without a fresh clone");
  red(() => assertOriginTransition("RECEIPT_EMITTED", "UNRESOLVED"), "restarting an emitted receipt");

  red(() => validateOriginLifecycle(["UNRESOLVED", "RECEIPT_EMITTED"]), "a trace that skipped every verification");
  red(() => validateOriginLifecycle(["ORIGIN_IDENTITY_PINNED", "ORIGIN_ABSENT"]), "a trace that did not start at UNRESOLVED");
  red(() => validateOriginLifecycle(["UNRESOLVED", "ORIGIN_IDENTITY_PINNED"]), "a trace that stopped short of an outcome");
  red(() => validateOriginLifecycle(["UNRESOLVED"]), "a single-state trace");
}

// Every terminal state #72 names must be produced by a distinct fixture.
function stateSeparation(): void {
  const outcomes = new Set<OriginOutcome>();
  const fixtures: [string, () => OriginOutcome][] = [
    ["receipt emitted", () => verify().outcome],
    ["origin absent", () => { const t = new FakeGitHubOrigin(); t.reachable = false; return verify(t).outcome; }],
    ["auth absent", () => { const t = new FakeGitHubOrigin(); t.authenticated = false; return verify(t).outcome; }],
    ["auth refused", () => { const t = new FakeGitHubOrigin(); t.refused = true; return verify(t).outcome; }],
    ["ref absent", () => verify(new FakeGitHubOrigin(), { ref: "absent" }).outcome],
    ["commit mismatch", () => { const t = new FakeGitHubOrigin(); t.resolvedCommit = "9".repeat(40); return verify(t).outcome; }],
    ["tree mismatch", () => { const t = new FakeGitHubOrigin(); t.fetchedTree = "8".repeat(40); return verify(t).outcome; }],
    ["manifest mismatch", () => { const t = new FakeGitHubOrigin(); t.manifestDigest = "4".repeat(64); return verify(t).outcome; }],
    ["fetch failed", () => { const t = new FakeGitHubOrigin(); t.fetches = false; return verify(t).outcome; }],
    ["fresh clone failed", () => { const t = new FakeGitHubOrigin(); t.clones = false; return verify(t).outcome; }],
  ];
  for (const [label, invoke] of fixtures) {
    const outcome = invoke();
    ok(outcome !== undefined, `${label} produced no outcome`);
    outcomes.add(outcome);
  }
  ok(outcomes.size === 10, `the fixtures cover ${outcomes.size} distinct outcomes, expected 10`);
}

function evidenceBoundary(): void {
  ok(githubOriginState.distributionOriginReachability === "NOT_EXERCISED", "origin reachability was claimed");
  ok(githubOriginState.freshCloneMaterialization === "NOT_EXERCISED", "a fresh clone was claimed");
  ok(githubOriginState.releaseManifestReachability === "NOT_EXERCISED", "manifest reachability was claimed");
  ok(githubOriginState.signedAttestation === "NOT_IMPLEMENTED", "a signed attestation was claimed");
  ok(githubOriginState.forgejoEquivalence === "NOT_IMPLEMENTED", "Forgejo equivalence was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const originNeverPasses: NeverPass<typeof githubOriginState> = true;
void originNeverPasses;

exactOrigin();
immutableReachability();
treeAndManifest();
freshClone();
authSeparation();
cleanupAccounting();
receiptAdmission();
transitionLegality();
stateSeparation();
evidenceBoundary();

console.log("INT-GH GREEN: exact origin, immutable reachability, tree/manifest, fresh clone, auth separation, cleanup, receipt admission, transition legality");
