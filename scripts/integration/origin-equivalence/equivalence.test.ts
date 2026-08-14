import type { ReleaseModule } from "../../../packages/contracts/src/integration/index.ts";
import {
  COMMIT as FJ_COMMIT,
  FakeForgejoOrigin,
  RELEASE_DIGEST as FJ_RELEASE_DIGEST,
  RELEASE_ID as FJ_RELEASE_ID,
  TREE as FJ_TREE,
  verifyForgejoOrigin,
  type AuthoringOriginReceipt,
} from "../forgejo-origin/index.ts";
import {
  FakeGitHubOrigin,
  verifyGitHubOrigin,
  type OriginReceipt,
} from "../github-origin/index.ts";
import {
  EQUIVALENCE_LEVELS,
  assertEquivalenceTransition,
  closureDigest,
  compareOrigins,
  equivalenceReceiptRefusal,
  isEquivalenceOutcome,
  originEquivalenceState,
  validateEquivalenceLifecycle,
  type EquivalenceLevel,
  type EquivalenceOutcome,
  type EquivalenceReceipt,
  type EquivalenceRequest,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-EQ ${message}`);
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
  ok(text.startsWith("invalid equivalence contract: "), `${message} threw "${text}" rather than an equivalence contract error`);
}

const FULL_NAME = "ed3c/agent-shield-monorepo";
const NOW = 1_700_000_000_000;
const MAX_AGE = 3_600_000;

const SUBJECT = {
  repository: FULL_NAME,
  commit: FJ_COMMIT,
  tree: FJ_TREE,
  releaseId: FJ_RELEASE_ID,
  releaseDigest: FJ_RELEASE_DIGEST,
};

// INT-EQ-001. The receipts are produced by the two real verifiers rather than hand-written, so
// what this suite compares is what those verifiers actually emit. A hand-built fixture would
// let a field drift out of the producers without this ever noticing.
function githubReceipt(): OriginReceipt {
  const receipt = verifyGitHubOrigin({
    identity: {
      host: "github.com",
      owner: "ed3c",
      repository: "agent-shield-monorepo",
      trackedUrl: `git@github.com:${FULL_NAME}.git`,
      expectedFullName: FULL_NAME,
    },
    subject: SUBJECT,
    ref: SUBJECT.commit,
    transport: new FakeGitHubOrigin(),
  }).receipt;
  ok(receipt.outcome === "RECEIPT_EMITTED", `the GitHub fixture reported ${receipt.outcome}`);
  return receipt;
}

function forgejoReceipt(): AuthoringOriginReceipt {
  const receipt = verifyForgejoOrigin({
    identity: {
      host: "127.0.0.1",
      port: 3000,
      owner: "ed3c",
      repository: "agent-shield-monorepo",
      expectedFullName: FULL_NAME,
      scope: "read",
    },
    subject: SUBJECT,
    ref: SUBJECT.commit,
    transport: new FakeForgejoOrigin(),
  }).receipt;
  ok(receipt.outcome === "CLEANED", `the Forgejo fixture reported ${receipt.outcome}`);
  return receipt;
}

const MODULES: ReleaseModule[] = [
  { id: "runtime-fabric", interfaceVersion: "1.0.0", manifestSha256: "a".repeat(64), roots: ["services/runtime-fabric"], provides: ["runtime.provider/v1"], requires: [], externalExposed: false },
  { id: "security-boundaries", interfaceVersion: "1.0.0", manifestSha256: "b".repeat(64), roots: ["services/security-boundaries"], provides: ["security.intent/v1"], requires: [], externalExposed: false },
];

function request(overrides: Partial<EquivalenceRequest> = {}): EquivalenceRequest {
  return {
    github: { receipt: githubReceipt(), observedAtEpochMs: NOW - 1_000 },
    forgejo: { receipt: forgejoReceipt(), observedAtEpochMs: NOW - 1_000 },
    githubClosure: MODULES,
    forgejoClosure: MODULES,
    requestedLevel: "exact-commit",
    nowEpochMs: NOW,
    maxReceiptAgeMs: MAX_AGE,
    attestationRequiredFor: [],
    attestationPresent: false,
    ...overrides,
  };
}

// INT-EQ-001. Independent arrivals, answered structurally rather than by heuristic.
function independentArrivals(): void {
  const green = compareOrigins(request()).receipt;
  ok(green.outcome === "RECEIPT_EMITTED", `a clean comparison reported ${green.outcome}`);

  // The control the issue names: duplicate one receipt with the origin label changed. A GitHub
  // receipt relabelled `forgejo` is missing every field the Forgejo verifier would have
  // produced, so the forgery is detected by shape rather than by trusting the label.
  const relabelled = { ...githubReceipt(), origin: "forgejo" } as unknown as AuthoringOriginReceipt;
  const forged = compareOrigins(request({ forgejo: { receipt: relabelled, observedAtEpochMs: NOW } })).receipt;
  ok(forged.outcome === "FORGEJO_ABSENT", `a relabelled GitHub receipt reported ${forged.outcome}`);

  const relabelledBack = { ...forgejoReceipt(), origin: "github" } as unknown as OriginReceipt;
  ok(compareOrigins(request({ github: { receipt: relabelledBack, observedAtEpochMs: NOW } })).receipt.outcome === "GITHUB_ABSENT",
    "a relabelled Forgejo receipt was admitted as a GitHub arrival");

  // Each individual field the shape check relies on.
  const noClone = { ...githubReceipt(), freshClone: undefined } as unknown as OriginReceipt;
  ok(compareOrigins(request({ github: { receipt: noClone, observedAtEpochMs: NOW } })).receipt.outcome === "GITHUB_ABSENT", "a receipt with no fresh-clone fact was admitted");
  const noRef = { ...githubReceipt(), refKind: null } as OriginReceipt;
  ok(compareOrigins(request({ github: { receipt: noRef, observedAtEpochMs: NOW } })).receipt.outcome === "GITHUB_ABSENT", "a receipt with no ref kind was admitted");
  const noReadOnly = { ...forgejoReceipt(), readOnly: undefined } as unknown as AuthoringOriginReceipt;
  ok(compareOrigins(request({ forgejo: { receipt: noReadOnly, observedAtEpochMs: NOW } })).receipt.outcome === "FORGEJO_ABSENT", "a receipt with no read-only fact was admitted");
  const noSource = { ...forgejoReceipt(), credentialSource: null } as AuthoringOriginReceipt;
  ok(compareOrigins(request({ forgejo: { receipt: noSource, observedAtEpochMs: NOW } })).receipt.outcome === "FORGEJO_ABSENT", "a receipt with no authorization source was admitted");
  const wrongSchema = { ...githubReceipt(), schema: "agent-shield/other/v1" } as unknown as OriginReceipt;
  ok(compareOrigins(request({ github: { receipt: wrongSchema, observedAtEpochMs: NOW } })).receipt.outcome === "GITHUB_ABSENT", "a receipt with another schema was admitted");

  // The schema rule and the origin-label rule overlap on a relabelled receipt, and the plant
  // check found each catching the other's fixture. These four change exactly one field at a
  // time, so each rule has a control only it can satisfy.
  const rightSchemaWrongLabel = { ...githubReceipt(), origin: "forgejo" } as unknown as OriginReceipt;
  ok(compareOrigins(request({ github: { receipt: rightSchemaWrongLabel, observedAtEpochMs: NOW } })).receipt.outcome === "GITHUB_ABSENT",
    "a GitHub-schema receipt labelled forgejo was admitted");
  const forgejoRightSchemaWrongLabel = { ...forgejoReceipt(), origin: "github" } as unknown as AuthoringOriginReceipt;
  ok(compareOrigins(request({ forgejo: { receipt: forgejoRightSchemaWrongLabel, observedAtEpochMs: NOW } })).receipt.outcome === "FORGEJO_ABSENT",
    "a Forgejo-schema receipt labelled github was admitted");
  const forgejoWrongSchemaRightLabel = { ...forgejoReceipt(), schema: "agent-shield/other/v1" } as unknown as AuthoringOriginReceipt;
  ok(compareOrigins(request({ forgejo: { receipt: forgejoWrongSchemaRightLabel, observedAtEpochMs: NOW } })).receipt.outcome === "FORGEJO_ABSENT",
    "a Forgejo receipt with another schema was admitted");
}

// INT-EQ-006. Absence and staleness both block, with no fallback.
function absenceAndStaleness(): void {
  ok(compareOrigins(request({ github: null })).receipt.outcome === "GITHUB_ABSENT", "an absent GitHub receipt was admitted");
  ok(compareOrigins(request({ forgejo: null })).receipt.outcome === "FORGEJO_ABSENT", "an absent Forgejo receipt was admitted");
  ok(compareOrigins(request({ github: null, forgejo: null })).receipt.outcome === "GITHUB_ABSENT", "an empty comparison was admitted");

  const stale = { receipt: githubReceipt(), observedAtEpochMs: NOW - MAX_AGE - 1 };
  ok(compareOrigins(request({ github: stale })).receipt.outcome === "RECEIPT_STALE", "a stale GitHub receipt was admitted");
  const staleForgejo = { receipt: forgejoReceipt(), observedAtEpochMs: NOW - MAX_AGE - 1 };
  ok(compareOrigins(request({ forgejo: staleForgejo })).receipt.outcome === "RECEIPT_STALE", "a stale Forgejo receipt was admitted");

  // A receipt observed in the future is a clock problem, not a fresh receipt. Treating it as
  // fresh is how a skewed machine gets an indefinitely valid comparison.
  const future = { receipt: githubReceipt(), observedAtEpochMs: NOW + 1 };
  ok(compareOrigins(request({ github: future })).receipt.outcome === "RECEIPT_STALE", "a future-dated receipt was admitted");

  // Exactly at the boundary is still admissible; one past it is not.
  const edge = { receipt: githubReceipt(), observedAtEpochMs: NOW - MAX_AGE };
  ok(compareOrigins(request({ github: edge })).receipt.outcome === "RECEIPT_EMITTED", "a receipt at the age boundary was refused");

  red(() => compareOrigins(request({ maxReceiptAgeMs: 0 })), "a zero freshness window");
  // An unadmitted level reports rather than throws, so it reaches the caller the same way as
  // every other refusal and the state has a producer.
  const unsupported = compareOrigins(request({ requestedLevel: "strongest" as EquivalenceLevel })).receipt;
  ok(unsupported.outcome === "UNSUPPORTED_LEVEL", `an unadmitted level reported ${unsupported.outcome}`);
  ok(unsupported.achievedLevel === null, "an unadmitted level claimed an achieved level");
}

// INT-EQ-002. The same logical subject.
function sameSubject(): void {
  const otherRepo = { ...forgejoReceipt(), repositoryFullName: "someone/else" };
  ok(compareOrigins(request({ forgejo: { receipt: otherRepo, observedAtEpochMs: NOW } })).receipt.outcome === "SUBJECT_MISMATCH",
    "receipts naming different repositories were compared");

  const otherSubjectRepo = { ...forgejoReceipt(), subject: { ...SUBJECT, repository: "someone/else" } };
  ok(compareOrigins(request({ forgejo: { receipt: otherSubjectRepo, observedAtEpochMs: NOW } })).receipt.outcome === "SUBJECT_MISMATCH",
    "release subjects naming different repositories were compared");

  const otherRelease = { ...forgejoReceipt(), subject: { ...SUBJECT, releaseId: "agent-shield-module-set@0.2.0" } };
  ok(compareOrigins(request({ forgejo: { receipt: otherRelease, observedAtEpochMs: NOW } })).receipt.outcome === "SUBJECT_MISMATCH",
    "receipts describing different releases were compared");
}

// INT-EQ-005. The closure, not just its label.
function closure(): void {
  ok(closureDigest(MODULES) === closureDigest([...MODULES].reverse()), "the closure digest depends on module order");
  ok(closureDigest(MODULES) !== closureDigest([MODULES[0] as ReleaseModule]), "a smaller closure produced the same digest");

  // The control: the same top-level manifest label with a changed closure. Every field that
  // distinguishes one module release from another has to change the digest, or a difference
  // slips through as equivalence.
  const varied: [string, ReleaseModule][] = [
    ["interface version", { ...(MODULES[0] as ReleaseModule), interfaceVersion: "2.0.0" }],
    ["manifest digest", { ...(MODULES[0] as ReleaseModule), manifestSha256: "9".repeat(64) }],
    ["roots", { ...(MODULES[0] as ReleaseModule), roots: ["services/other"] }],
    ["provides", { ...(MODULES[0] as ReleaseModule), provides: ["runtime.provider/v2"] }],
    ["requires", { ...(MODULES[0] as ReleaseModule), requires: ["security.intent/v1"] }],
    ["external exposure", { ...(MODULES[0] as ReleaseModule), externalExposed: true }],
    ["identifier", { ...(MODULES[0] as ReleaseModule), id: "other-module" }],
  ];
  for (const [label, changed] of varied) {
    const other = [changed, MODULES[1] as ReleaseModule];
    ok(closureDigest(MODULES) !== closureDigest(other), `changing the ${label} did not change the closure digest`);
    ok(compareOrigins(request({ forgejoClosure: other })).receipt.outcome === "CLOSURE_MISMATCH", `a changed ${label} was admitted as equivalent`);
  }

  ok(compareOrigins(request({ githubClosure: [] })).receipt.outcome === "CLOSURE_MISMATCH", "an empty GitHub closure was admitted");
  ok(compareOrigins(request({ forgejoClosure: [] })).receipt.outcome === "CLOSURE_MISMATCH", "an empty Forgejo closure was admitted");
  // Both empty: the digests agree, so only the emptiness rule can fire. Without this the plant
  // check found the rule dead -- the digest comparison was catching every one-sided fixture.
  const bothEmpty = compareOrigins(request({ githubClosure: [], forgejoClosure: [] })).receipt;
  ok(bothEmpty.outcome === "CLOSURE_MISMATCH", `two empty closures reported ${bothEmpty.outcome}`);
  ok(closureDigest([]) === closureDigest([]), "two empty closures produced different digests");
}

// INT-EQ-003, INT-EQ-004 and INT-EQ-007. The strongest level the evidence supports, never a
// stronger one than that.
function strongestHonestVerdict(): void {
  const exact = compareOrigins(request()).receipt;
  ok(exact.achievedLevel === "exact-commit", `identical subjects achieved ${exact.achievedLevel}`);

  // Same tree and manifest, different commit metadata. The control the issue names is exactly
  // this being advertised as exact-commit.
  const sameTreeReceipt = { ...forgejoReceipt(), subject: { ...SUBJECT, commit: "9".repeat(40) } };
  const sameTreeRequest = request({ forgejo: { receipt: sameTreeReceipt, observedAtEpochMs: NOW } });
  const refusedUpgrade = compareOrigins(sameTreeRequest).receipt;
  ok(refusedUpgrade.outcome === "NOT_EQUIVALENT", `a same-tree pair requested as exact-commit reported ${refusedUpgrade.outcome}`);
  ok(refusedUpgrade.achievedLevel === "same-tree", `a same-tree pair achieved ${refusedUpgrade.achievedLevel}`);
  // The receipt still records what was asked, so the refusal is legible rather than bare.
  ok(refusedUpgrade.requestedLevel === "exact-commit", "the receipt lost the requested level");

  // Asking for the level the evidence supports succeeds.
  const honest = compareOrigins({ ...sameTreeRequest, requestedLevel: "same-tree" }).receipt;
  ok(honest.outcome === "RECEIPT_EMITTED", `an honest same-tree request reported ${honest.outcome}`);
  ok(honest.achievedLevel === "same-tree", `an honest same-tree request achieved ${honest.achievedLevel}`);

  // Same manifest only.
  const manifestOnly = { ...forgejoReceipt(), subject: { ...SUBJECT, commit: "9".repeat(40), tree: "8".repeat(40) } };
  const manifestRequest = request({
    forgejo: { receipt: manifestOnly, observedAtEpochMs: NOW },
    requestedLevel: "same-release-manifest",
  });
  const weakest = compareOrigins(manifestRequest).receipt;
  ok(weakest.outcome === "RECEIPT_EMITTED", `a manifest-only pair reported ${weakest.outcome}`);
  ok(weakest.achievedLevel === "same-release-manifest", `a manifest-only pair achieved ${weakest.achievedLevel}`);
  // And it cannot be claimed as anything stronger.
  ok(compareOrigins({ ...manifestRequest, requestedLevel: "same-tree" }).receipt.outcome === "NOT_EQUIVALENT", "a manifest-only pair was admitted as same-tree");
  ok(compareOrigins({ ...manifestRequest, requestedLevel: "exact-commit" }).receipt.outcome === "NOT_EQUIVALENT", "a manifest-only pair was admitted as exact-commit");

  // Same tree, different release manifest. That is a contradiction rather than a weaker match --
  // one of the two origins is reporting a manifest its own tree does not produce -- so the
  // verdict is not `same-tree`. The plant check needed this: every other fixture had the tree
  // and the manifest agreeing, which left the `&& sameManifest` guard dead.
  const contradictory = { ...forgejoReceipt(), subject: { ...SUBJECT, commit: "9".repeat(40), releaseDigest: "6".repeat(64) } };
  const contradiction = compareOrigins(request({
    forgejo: { receipt: contradictory, observedAtEpochMs: NOW },
    requestedLevel: "same-tree",
  })).receipt;
  ok(contradiction.outcome === "NOT_EQUIVALENT", `a same-tree pair with different manifests reported ${contradiction.outcome}`);
  ok(contradiction.achievedLevel === null, `a contradictory pair achieved ${contradiction.achievedLevel}`);

  // Nothing in common.
  const unrelated = { ...forgejoReceipt(), subject: { ...SUBJECT, commit: "9".repeat(40), tree: "8".repeat(40), releaseDigest: "7".repeat(64) } };
  const none = compareOrigins(request({ forgejo: { receipt: unrelated, observedAtEpochMs: NOW }, requestedLevel: "same-release-manifest" })).receipt;
  ok(none.outcome === "NOT_EQUIVALENT", `an unrelated pair reported ${none.outcome}`);
  ok(none.achievedLevel === null, `an unrelated pair achieved ${none.achievedLevel}`);

  // A stronger level is never assigned from the request. The ordering is the mechanism.
  ok(EQUIVALENCE_LEVELS.indexOf("exact-commit") < EQUIVALENCE_LEVELS.indexOf("same-tree"), "the level ordering is not strongest-first");
  ok(EQUIVALENCE_LEVELS.indexOf("same-tree") < EQUIVALENCE_LEVELS.indexOf("same-release-manifest"), "the level ordering is not strongest-first");
}

// A level that needs an attestation nobody can produce is refused, not downgraded.
function attestation(): void {
  const gated = request({ attestationRequiredFor: ["exact-commit"] });
  ok(compareOrigins(gated).receipt.outcome === "ATTESTATION_ABSENT", "an unattested level was admitted");
  ok(compareOrigins({ ...gated, attestationPresent: true }).receipt.outcome === "RECEIPT_EMITTED", "a present attestation was ignored");
  // A gate on another level does not block this one.
  ok(compareOrigins(request({ attestationRequiredFor: ["same-tree"] })).receipt.outcome === "RECEIPT_EMITTED", "a gate on another level blocked this one");
}

// A verdict is checkable by a party that did not compute it.
function receiptAdmission(): void {
  const receipt = compareOrigins(request()).receipt;
  const expected = { repository: FULL_NAME, releaseId: SUBJECT.releaseId, level: "exact-commit" as EquivalenceLevel };
  ok(equivalenceReceiptRefusal(receipt, expected) === null, "a genuine verdict was refused");

  const forgeries: [string, EquivalenceReceipt][] = [
    ["another schema", { ...receipt, schema: "agent-shield/other/v1" as typeof receipt.schema }],
    ["another repository", { ...receipt, repositoryFullName: "someone/else" }],
    ["another release", { ...receipt, releaseId: "other@1" }],
    ["a non-emitting outcome", { ...receipt, outcome: "NOT_EQUIVALENT" }],
    ["an absent achieved level", { ...receipt, achievedLevel: null }],
    ["a weaker achieved level", { ...receipt, achievedLevel: "same-tree" }],
    ["an empty closure", { ...receipt, moduleCount: 0 }],
  ];
  for (const [label, forged] of forgeries) {
    ok(equivalenceReceiptRefusal(forged, expected) !== null, `${label} was admitted`);
  }
  // Relying on a weaker level than was achieved is fine: exact-commit satisfies a same-tree ask.
  ok(equivalenceReceiptRefusal(receipt, { ...expected, level: "same-release-manifest" }) === null, "a stronger verdict was refused for a weaker ask");
}

function transitionLegality(): void {
  ok(validateEquivalenceLifecycle(["UNRESOLVED", "GITHUB_ABSENT"]) === "GITHUB_ABSENT", "a legal trace was refused");
  ok(isEquivalenceOutcome("RECEIPT_EMITTED"), "RECEIPT_EMITTED is not recognised as an outcome");
  ok(isEquivalenceOutcome("COMPARING") === false, "COMPARING is treated as an outcome");

  red(() => assertEquivalenceTransition("UNRESOLVED", "COMPARING"), "comparing before either receipt is verified");
  red(() => assertEquivalenceTransition("GITHUB_RECEIPT_VERIFIED", "COMPARING"), "comparing with one receipt verified");
  red(() => assertEquivalenceTransition("LOGICAL_RELEASE_MATCHED", "EQUIVALENT"), "concluding without comparing");
  red(() => assertEquivalenceTransition("COMPARING", "RECEIPT_EMITTED"), "emitting a verdict without an equivalence result");
  red(() => assertEquivalenceTransition("RECEIPT_EMITTED", "UNRESOLVED"), "restarting an emitted verdict");

  red(() => validateEquivalenceLifecycle(["UNRESOLVED", "RECEIPT_EMITTED"]), "a trace that skipped the comparison");
  red(() => validateEquivalenceLifecycle(["GITHUB_RECEIPT_VERIFIED", "FORGEJO_ABSENT"]), "a trace that did not start at UNRESOLVED");
  red(() => validateEquivalenceLifecycle(["UNRESOLVED", "GITHUB_RECEIPT_VERIFIED"]), "a trace that stopped short of an outcome");
  red(() => validateEquivalenceLifecycle(["UNRESOLVED"]), "a single-state trace");
}

function stateSeparation(): void {
  const outcomes = new Set<EquivalenceOutcome>();
  const fixtures: [string, () => EquivalenceOutcome][] = [
    ["receipt emitted", () => compareOrigins(request()).receipt.outcome],
    ["github absent", () => compareOrigins(request({ github: null })).receipt.outcome],
    ["forgejo absent", () => compareOrigins(request({ forgejo: null })).receipt.outcome],
    ["receipt stale", () => compareOrigins(request({ github: { receipt: githubReceipt(), observedAtEpochMs: NOW - MAX_AGE - 1 } })).receipt.outcome],
    ["subject mismatch", () => compareOrigins(request({ forgejo: { receipt: { ...forgejoReceipt(), repositoryFullName: "someone/else" }, observedAtEpochMs: NOW } })).receipt.outcome],
    ["closure mismatch", () => compareOrigins(request({ forgejoClosure: [MODULES[0] as ReleaseModule] })).receipt.outcome],
    ["attestation absent", () => compareOrigins(request({ attestationRequiredFor: ["exact-commit"] })).receipt.outcome],
    ["not equivalent", () => compareOrigins(request({ forgejo: { receipt: { ...forgejoReceipt(), subject: { ...SUBJECT, commit: "9".repeat(40) } }, observedAtEpochMs: NOW } })).receipt.outcome],
    ["unsupported level", () => compareOrigins(request({ requestedLevel: "strongest" as EquivalenceLevel })).receipt.outcome],
  ];
  for (const [label, invoke] of fixtures) {
    const outcome = invoke();
    ok(outcome !== undefined, `${label} produced no outcome`);
    outcomes.add(outcome);
  }
  ok(outcomes.size === 9, `the fixtures cover ${outcomes.size} distinct outcomes, expected 9`);
}

function evidenceBoundary(): void {
  ok(originEquivalenceState.independentArrivals === "NOT_EXERCISED", "independent arrivals were claimed");
  ok(originEquivalenceState.liveEquivalence === "NOT_EXERCISED", "a live equivalence was claimed");
  ok(originEquivalenceState.signedAttestation === "NOT_IMPLEMENTED", "a signed attestation was claimed");
  ok(originEquivalenceState.releasePromotion === "NOT_IMPLEMENTED", "a release promotion was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const equivalenceNeverPasses: NeverPass<typeof originEquivalenceState> = true;
void equivalenceNeverPasses;

independentArrivals();
absenceAndStaleness();
sameSubject();
closure();
strongestHonestVerdict();
attestation();
receiptAdmission();
transitionLegality();
stateSeparation();
evidenceBoundary();

console.log("INT-EQ GREEN: independent arrivals, absence/staleness, same subject, closure, strongest-honest verdict, attestation, receipt admission, transition legality");
