import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import {
  BINDING_DIGEST,
  COMMIT,
  FakeForgejoOrigin,
  PLANTED_SECRET,
  RELEASE_DIGEST,
  RELEASE_ID,
  TREE,
  assertAuthoringIdentity,
  assertForgejoTransition,
  assertReleaseSubject,
  authoringReceiptRefusal,
  forgejoOriginState,
  helperPolicyRefusal,
  isForgejoOutcome,
  validateForgejoLifecycle,
  verifyForgejoOrigin,
  type AuthoringOriginIdentity,
  type AuthoringOriginReceipt,
  type CredentialSource,
  type ForgejoOutcome,
  type HelperPolicy,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-FJ ${message}`);
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
  ok(text.startsWith("invalid authoring origin contract: "), `${message} threw "${text}" rather than an authoring origin contract error`);
}

const FULL_NAME = "ed3c/agent-shield-monorepo";

function identity(overrides: Partial<AuthoringOriginIdentity> = {}): AuthoringOriginIdentity {
  return {
    host: "127.0.0.1",
    port: 3000,
    owner: "ed3c",
    repository: "agent-shield-monorepo",
    expectedFullName: FULL_NAME,
    scope: "read",
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

function policy(overrides: Partial<HelperPolicy> = {}): HelperPolicy {
  return {
    chain: ["keychain-broker"],
    resetBeforeApply: true,
    childEnvironmentKeys: ["PATH", "HOME"],
    ...overrides,
  };
}

function verify(
  transport = new FakeForgejoOrigin(),
  overrides: { identity?: Partial<AuthoringOriginIdentity>; subject?: Partial<ReleaseSubject>; ref?: string } = {},
): AuthoringOriginReceipt {
  return verifyForgejoOrigin({
    identity: identity(overrides.identity),
    subject: subject(overrides.subject),
    ref: overrides.ref ?? COMMIT,
    transport,
  }).receipt;
}

// INT-FJ-001. A trusted-local authoring origin, read-only.
function exactOrigin(): void {
  assertAuthoringIdentity(identity());
  assertAuthoringIdentity(identity({ host: "::1" }));

  // `localhost` is refused because a hosts file can point that name anywhere, and the reason
  // this origin is trusted is that it is not on the network.
  red(() => assertAuthoringIdentity(identity({ host: "localhost" as "127.0.0.1" })), "a resolvable hostname");
  red(() => assertAuthoringIdentity(identity({ host: "10.0.0.5" as "127.0.0.1" })), "a private-network address");
  red(() => assertAuthoringIdentity(identity({ port: 0 })), "a zero port");
  red(() => assertAuthoringIdentity(identity({ port: 70_000 })), "an out-of-range port");
  red(() => assertAuthoringIdentity(identity({ port: 3000.5 })), "a fractional port");
  // INT-FJ-006. Write scope is refused at admission: a canary that can push can rewrite the
  // thing it is verifying.
  red(() => assertAuthoringIdentity(identity({ scope: "write" })), "a write-scoped canary");
  red(() => assertAuthoringIdentity(identity({ owner: "bad owner", expectedFullName: "bad owner/agent-shield-monorepo" })), "a malformed owner");
  red(() => assertAuthoringIdentity(identity({ repository: "bad repo", expectedFullName: "ed3c/bad repo" })), "a malformed repository");
  red(() => assertAuthoringIdentity(identity({ owner: "someone-else" })), "another owner than the release names");

  assertReleaseSubject(subject());
  red(() => assertReleaseSubject(subject({ commit: "short" })), "an abbreviated commit");
  red(() => assertReleaseSubject(subject({ tree: "short" })), "an abbreviated tree");
  red(() => assertReleaseSubject(subject({ releaseDigest: "short" })), "an unaddressed release digest");
  red(() => assertReleaseSubject(subject({ releaseId: "" })), "an absent release identifier");
  red(() => assertReleaseSubject(subject({ repository: "agent-shield-monorepo" })), "a repository without an owner");
  red(() => verify(new FakeForgejoOrigin(), { subject: { repository: "ed3c/other" } }), "a release subject for another repository");

  // A service that is down and a service that does not host this repository are different facts.
  const down = new FakeForgejoOrigin();
  down.serviceUp = false;
  ok(verify(down).outcome === "SERVICE_UNREACHABLE", "a stopped service was not reported as unreachable");

  const empty = new FakeForgejoOrigin();
  empty.repositoryPresent = false;
  ok(verify(empty).outcome === "ORIGIN_ABSENT", "an absent repository was not reported as absent");
}

// INT-FJ-002. Helper-only authentication, with no fallback.
function helperOnlyAuth(): void {
  ok(helperPolicyRefusal(policy()) === null, "the approved helper chain was refused");

  // Without a reset an inherited global helper stays in the chain, and the chain itself looks
  // exactly like a clean one.
  ok(helperPolicyRefusal(policy({ resetBeforeApply: false })) !== null, "an unreset helper chain was admitted");
  // The empty chain is refused by the "uses the approved source" rule rather than by a length
  // rule of its own -- the plant check found the separate length check dead. The message is
  // asserted so the refusal stays readable rather than naming `undefined`.
  const emptyRefusal = helperPolicyRefusal(policy({ chain: [] }));
  ok(emptyRefusal !== null, "an empty helper chain was admitted");
  ok(emptyRefusal.includes("no helper at all"), `an empty helper chain reported "${emptyRefusal}"`);

  // A chain of two is a fallback, and a fallback runs exactly when the approved helper is
  // unavailable -- which is precisely when it must not.
  for (const fallback of ["plaintext-store", "dotenv", "shell-fallback"] as const) {
    ok(helperPolicyRefusal(policy({ chain: ["keychain-broker", fallback] })) !== null, `a ${fallback} fallback was admitted`);
    ok(helperPolicyRefusal(policy({ chain: [fallback] })) !== null, `a ${fallback} chain was admitted`);
  }
  ok(helperPolicyRefusal(policy({ chain: ["none"] })) !== null, "an empty credential source was admitted");

  // INT-FJ-003. A name scan, not a value scan -- the value is exactly what must not be here to
  // be scanned for.
  for (const key of ["GIT_ASKPASS", "FORGEJO_TOKEN", "GITEA_TOKEN", "GIT_CREDENTIAL_HELPER", "GH_TOKEN", "GITHUB_TOKEN", "GIT_TOKEN"]) {
    ok(helperPolicyRefusal(policy({ childEnvironmentKeys: ["PATH", key] })) !== null, `${key} in the child environment was admitted`);
  }

  const refused = new FakeForgejoOrigin();
  refused.refused = true;
  ok(verify(refused).outcome === "AUTH_REFUSED", "a refused authorization was not reported as refused");

  const anonymous = new FakeForgejoOrigin();
  anonymous.authenticated = false;
  ok(verify(anonymous).outcome === "AUTH_ABSENT", "an unauthenticated run was not reported as absent");

  // Refusal outranks absence.
  const both = new FakeForgejoOrigin();
  both.refused = true;
  both.authenticated = false;
  ok(verify(both).outcome === "AUTH_REFUSED", "a refusal was reported as absent authorization");

  // The chain being configured correctly and the helper actually answering are two claims.
  const other = new FakeForgejoOrigin();
  other.authSource = "plaintext-store";
  const wrongSource = verify(other);
  ok(wrongSource.outcome === "HELPER_POLICY_REFUSED", `an unapproved authorization source reported ${wrongSource.outcome}`);
  ok(wrongSource.credentialSource === "plaintext-store", "the receipt hid which source answered");

  const badChain = new FakeForgejoOrigin();
  badChain.helperChain = ["keychain-broker", "dotenv"];
  ok(verify(badChain).outcome === "HELPER_POLICY_REFUSED", "a fallback chain reached authentication");
}

// The runtime binding is a projection, never a second canonical copy.
function runtimeBinding(): void {
  ok(verify().outcome === "CLEANED", "a clean run did not complete");

  const none = new FakeForgejoOrigin();
  none.binding = null;
  ok(verify(none).outcome === "HELPER_POLICY_REFUSED", "an absent runtime binding was admitted");

  const unaddressed = new FakeForgejoOrigin();
  unaddressed.binding = { profileId: "p", canonicalSha256: "short", ownerRepository: "ed3c/runtime-env" };
  ok(verify(unaddressed).outcome === "HELPER_POLICY_REFUSED", "an unaddressed runtime binding was admitted");

  const selfOwned = new FakeForgejoOrigin();
  selfOwned.binding = { profileId: "p", canonicalSha256: BINDING_DIGEST, ownerRepository: FULL_NAME };
  ok(verify(selfOwned).outcome === "HELPER_POLICY_REFUSED", "a self-owned runtime binding was admitted");
}

// INT-FJ-004 and INT-FJ-005. Immutable reachability, and no fallback to another origin.
function immutableReachability(): void {
  ok(verify(new FakeForgejoOrigin(), { ref: "absent" }).outcome === "REF_ABSENT", "an absent ref was admitted");

  for (const kind of ["branch", "lightweight-tag"] as const) {
    const movable = new FakeForgejoOrigin();
    movable.refKind = kind;
    const receipt = verify(movable, { ref: "main" });
    ok(receipt.outcome === "REF_ABSENT", `a ${kind} ref reported ${receipt.outcome}`);
    ok(receipt.detail.includes("move under the same name"), `a ${kind} ref reported "${receipt.detail}"`);
  }
  const annotated = new FakeForgejoOrigin();
  annotated.refKind = "annotated-tag";
  ok(verify(annotated).outcome === "CLEANED", "an annotated tag was refused");

  // The control the issue names: a missing Forgejo commit with a GitHub copy available. There is
  // no GitHub in this file at all, so the only possible answer is that the release is not here.
  const elsewhere = new FakeForgejoOrigin();
  elsewhere.resolvedCommit = "9".repeat(40);
  ok(verify(elsewhere).outcome === "REF_ABSENT", "a ref resolving to another commit was admitted");

  const otherObject = new FakeForgejoOrigin();
  otherObject.fetchedCommit = "8".repeat(40);
  ok(verify(otherObject).outcome === "COMMIT_MISMATCH", "another commit object was admitted");

  const otherTree = new FakeForgejoOrigin();
  otherTree.fetchedTree = "7".repeat(40);
  ok(verify(otherTree).outcome === "TREE_MISMATCH", "a commit pointing at another tree was admitted");

  const otherRelease = new FakeForgejoOrigin();
  otherRelease.manifestReleaseId = "agent-shield-module-set@0.2.0";
  ok(verify(otherRelease).outcome === "MANIFEST_MISMATCH", "another release identifier was admitted");

  const tampered = new FakeForgejoOrigin();
  tampered.manifestDigest = "6".repeat(64);
  ok(verify(tampered).outcome === "MANIFEST_MISMATCH", "a tampered manifest was admitted");

  const noFetch = new FakeForgejoOrigin();
  noFetch.fetches = false;
  ok(verify(noFetch).outcome === "FETCH_FAILED", "an unfetchable commit was not a fetch failure");

  const noManifest = new FakeForgejoOrigin();
  noManifest.readsManifest = false;
  ok(verify(noManifest).outcome === "FETCH_FAILED", "an unreadable manifest was not a fetch failure");
}

// INT-FJ-006. The canary reads and does not write.
function readOnly(): void {
  const wrote = new FakeForgejoOrigin();
  wrote.originRefsWritten = 1;
  const pushed = verify(wrote);
  ok(pushed.outcome === "FAILED_CLEANUP", `a canary that pushed reported ${pushed.outcome}`);
  ok(pushed.readOnly === false, "a canary that pushed was recorded as read-only");
  ok(pushed.detail.includes("wrote 1 refs"), `a canary that pushed reported "${pushed.detail}"`);

  const dirtied = new FakeForgejoOrigin();
  dirtied.consumerWorkingTreeChanged = true;
  const changed = verify(dirtied);
  ok(changed.outcome === "FAILED_CLEANUP", `a canary that dirtied the tree reported ${changed.outcome}`);
  ok(changed.readOnly === false, "a canary that dirtied the tree was recorded as read-only");

  ok(verify().readOnly, "a clean run was not recorded as read-only");
}

// INT-FJ-003 and INT-FJ-008. No value exposure, and no residue.
function privacyAndCleanup(): void {
  const leaks: [string, (t: FakeForgejoOrigin) => void][] = [
    ["a clone", (t) => { t.retainedClones = 1; }],
    ["a process", (t) => { t.retainedProcesses = 1; }],
    ["a credential stream", (t) => { t.retainedCredentialStreams = 1; }],
    ["a lease", (t) => { t.retainedLeases = 1; }],
  ];
  for (const [label, leak] of leaks) {
    const transport = new FakeForgejoOrigin();
    leak(transport);
    const receipt = verify(transport);
    ok(receipt.outcome === "FAILED_CLEANUP", `${label} left behind reported ${receipt.outcome}`);
    ok(receipt.cleanupCleared === false, `${label} left behind was reported as cleared`);
  }
  ok(verify().cleanupCleared, "a clean run was reported as leaking");

  const unreachable = new FakeForgejoOrigin();
  unreachable.serviceUp = false;
  for (const [label, receipt] of [["a clean", verify()], ["an unreachable", verify(unreachable)]] as const) {
    const text = JSON.stringify(receipt);
    ok(text.includes(PLANTED_SECRET) === false, `${label} receipt carried the planted secret`);
    ok(text.includes("127.0.0.1") === false, `${label} receipt carried the loopback address`);
    ok(text.includes("3000") === false, `${label} receipt carried the service port`);
    ok(text.includes("http") === false, `${label} receipt carried a URL`);
  }
  // A loopback port plus a repository name is the whole address of a private service, so the
  // receipt carries neither -- checked structurally as well as by scan.
  type Forbids<T, K extends string> = K extends keyof T ? never : true;
  const receiptHasNoAddress: Forbids<AuthoringOriginReceipt, "host" | "port" | "url" | "token" | "log"> = true;
  void receiptHasNoAddress;
}

// A receipt is checkable by a party that did not produce it.
function receiptAdmission(): void {
  const receipt = verify();
  ok(authoringReceiptRefusal(receipt, subject()) === null, "a genuine receipt was refused");

  const forgeries: [string, AuthoringOriginReceipt][] = [
    ["another schema", { ...receipt, schema: "agent-shield/other/v1" as typeof receipt.schema }],
    ["another origin", { ...receipt, origin: "github" as "forgejo" }],
    ["another repository", { ...receipt, repositoryFullName: "someone/else" }],
    ["another commit", { ...receipt, subject: { ...receipt.subject, commit: "9".repeat(40) } }],
    ["another tree", { ...receipt, subject: { ...receipt.subject, tree: "9".repeat(40) } }],
    ["another release", { ...receipt, subject: { ...receipt.subject, releaseId: "other@1" } }],
    ["another release digest", { ...receipt, subject: { ...receipt.subject, releaseDigest: "9".repeat(64) } }],
    ["an uncleaned outcome", { ...receipt, outcome: "REF_ABSENT" }],
    ["an unapproved credential source", { ...receipt, credentialSource: "dotenv" as CredentialSource }],
    ["an absent credential source", { ...receipt, credentialSource: null }],
    ["a writing run", { ...receipt, readOnly: false }],
    ["retained resources", { ...receipt, cleanupCleared: false }],
  ];
  for (const [label, forged] of forgeries) {
    ok(authoringReceiptRefusal(forged, subject()) !== null, `${label} was admitted`);
  }
  ok(authoringReceiptRefusal(receipt, subject({ commit: "9".repeat(40) })) !== null, "a receipt for another subject was admitted");
}

function transitionLegality(): void {
  ok(validateForgejoLifecycle(["UNRESOLVED", "ORIGIN_ABSENT"]) === "ORIGIN_ABSENT", "a legal trace was refused");
  ok(isForgejoOutcome("CLEANED"), "CLEANED is not recognised as an outcome");
  ok(isForgejoOutcome("RECEIPT_EMITTED") === false, "RECEIPT_EMITTED is treated as an outcome");

  red(() => assertForgejoTransition("ORIGIN_IDENTITY_PINNED", "AUTHENTICATED"), "authenticating without a helper policy check");
  red(() => assertForgejoTransition("HELPER_POLICY_CHECKED", "REF_FETCHED"), "fetching without authenticating");
  red(() => assertForgejoTransition("RELEASE_MANIFEST_VERIFIED", "CLEANED"), "cleaning without emitting a receipt");
  red(() => assertForgejoTransition("CLEANED", "UNRESOLVED"), "restarting a cleaned run");
  red(() => assertForgejoTransition("UNRESOLVED", "AUTHENTICATED"), "authenticating from an unresolved origin");

  red(() => validateForgejoLifecycle(["UNRESOLVED", "CLEANED"]), "a trace that skipped every verification");
  red(() => validateForgejoLifecycle(["ORIGIN_IDENTITY_PINNED", "ORIGIN_ABSENT"]), "a trace that did not start at UNRESOLVED");
  red(() => validateForgejoLifecycle(["UNRESOLVED", "ORIGIN_IDENTITY_PINNED"]), "a trace that stopped short of an outcome");
  red(() => validateForgejoLifecycle(["UNRESOLVED"]), "a single-state trace");
}

// INT-FJ-007. Absence, refusal and unreachability are distinct, and none of them is PASS.
function stateSeparation(): void {
  const outcomes = new Set<ForgejoOutcome>();
  const fixtures: [string, () => ForgejoOutcome][] = [
    ["cleaned", () => verify().outcome],
    ["origin absent", () => { const t = new FakeForgejoOrigin(); t.repositoryPresent = false; return verify(t).outcome; }],
    ["service unreachable", () => { const t = new FakeForgejoOrigin(); t.serviceUp = false; return verify(t).outcome; }],
    ["auth absent", () => { const t = new FakeForgejoOrigin(); t.authenticated = false; return verify(t).outcome; }],
    ["auth refused", () => { const t = new FakeForgejoOrigin(); t.refused = true; return verify(t).outcome; }],
    ["helper policy refused", () => { const t = new FakeForgejoOrigin(); t.helperResetBeforeApply = false; return verify(t).outcome; }],
    ["ref absent", () => verify(new FakeForgejoOrigin(), { ref: "absent" }).outcome],
    ["commit mismatch", () => { const t = new FakeForgejoOrigin(); t.fetchedCommit = "8".repeat(40); return verify(t).outcome; }],
    ["tree mismatch", () => { const t = new FakeForgejoOrigin(); t.fetchedTree = "7".repeat(40); return verify(t).outcome; }],
    ["manifest mismatch", () => { const t = new FakeForgejoOrigin(); t.manifestDigest = "6".repeat(64); return verify(t).outcome; }],
    ["fetch failed", () => { const t = new FakeForgejoOrigin(); t.fetches = false; return verify(t).outcome; }],
    ["failed cleanup", () => { const t = new FakeForgejoOrigin(); t.retainedLeases = 1; return verify(t).outcome; }],
  ];
  for (const [label, invoke] of fixtures) {
    const outcome = invoke();
    ok(outcome !== undefined, `${label} produced no outcome`);
    outcomes.add(outcome);
  }
  ok(outcomes.size === 12, `the fixtures cover ${outcomes.size} distinct outcomes, expected 12`);
}

function evidenceBoundary(): void {
  ok(forgejoOriginState.authoringOriginReachability === "NOT_EXERCISED", "authoring origin reachability was claimed");
  ok(forgejoOriginState.brokeredAuthentication === "NOT_EXERCISED", "a brokered authentication was claimed");
  ok(forgejoOriginState.releaseManifestReachability === "NOT_EXERCISED", "manifest reachability was claimed");
  ok(forgejoOriginState.githubEquivalence === "NOT_IMPLEMENTED", "GitHub equivalence was claimed");
  ok(forgejoOriginState.signedAttestation === "NOT_IMPLEMENTED", "a signed attestation was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const forgejoNeverPasses: NeverPass<typeof forgejoOriginState> = true;
void forgejoNeverPasses;

exactOrigin();
helperOnlyAuth();
runtimeBinding();
immutableReachability();
readOnly();
privacyAndCleanup();
receiptAdmission();
transitionLegality();
stateSeparation();
evidenceBoundary();

console.log("INT-FJ GREEN: exact origin, helper-only auth, runtime binding, immutable reachability, read-only, privacy/cleanup, receipt admission, transition legality");
