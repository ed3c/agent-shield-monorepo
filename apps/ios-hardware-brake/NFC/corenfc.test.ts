import {
  CardRegistry,
  FakeCoreNfcBridge,
  PLANTED_SECRET,
  PROPRIETARY_PROTOCOLS,
  REDACTED,
  SealedApdu,
  assertCardProfile,
  assertNfcTransition,
  corenfcProviderState,
  isNfcOutcome,
  runPossession,
  runRegistration,
  runRevocation,
  validateNfcLifecycle,
  verifyPossessionEvidence,
  type CardProfile,
  type NfcChallenge,
  type NfcOutcome,
  type PossessionEvidence,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SEC-NFC ${message}`);
}

// A control that only asserts "something threw" also passes when a later line throws a
// TypeError for an unrelated reason, which makes a dead guard look load-bearing under a plant
// check. Every control must fail through this provider's own contract error.
function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid nfc contract: "), `${message} threw "${text}" rather than an nfc contract error`);
}

const CARD_REF = "card-primary";
const DEVICE_REF = "owner-iphone";
const APPLICATION = "A0000006472F0001";
const EPOCH = 7;
const ISSUED = 1_700_000_000_000;
const EXPIRES = ISSUED + 120_000;
const NOW = ISSUED + 1_000;
const INTENT = "d".repeat(64);
const AUDIENCE = "agent-shield.settlement";
const INITIAL_COUNTER = 10;
const TIMEOUT_MS = 20_000;

function profile(overrides: Partial<CardProfile> = {}): CardProfile {
  return {
    profileId: "card-brake-v1",
    protocol: "iso7816-4",
    applicationId: APPLICATION,
    osVersion: "18.2",
    entitlements: ["com.apple.developer.nfc.readersession.formats"],
    declaredApplicationIds: [APPLICATION],
    keyRef: { brokerId: "openbao-local", keyId: "card-master-1", keySha256: "a".repeat(64), diversified: true },
    review: null,
    ...overrides,
  };
}

function reviewedProprietary(overrides: Partial<CardProfile> = {}): CardProfile {
  return profile({
    protocol: "mifare-desfire-ev3",
    review: {
      reviewerId: "independent-lab",
      reportSha256: "6".repeat(64),
      reportDate: "2026-02-11",
      coversKeyManagement: true,
      coversEntitlementTerms: true,
    },
    ...overrides,
  });
}

function challenge(overrides: Partial<NfcChallenge> = {}): NfcChallenge {
  return {
    nonce: "a".repeat(32),
    intentDigest: INTENT,
    policyEpoch: EPOCH,
    audience: AUDIENCE,
    cardRef: CARD_REF,
    deviceRef: DEVICE_REF,
    issuedAtEpochMs: ISSUED,
    expiresAtEpochMs: EXPIRES,
    ...overrides,
  };
}

const BOUND = { intentDigest: INTENT, policyEpoch: EPOCH, audience: AUDIENCE, deviceRef: DEVICE_REF };

function registered(bridge = new FakeCoreNfcBridge()): { bridge: FakeCoreNfcBridge; registry: CardRegistry } {
  const registry = new CardRegistry();
  const { receipt } = runRegistration({
    profile: profile(), cardRef: CARD_REF, bridge, registry, epoch: EPOCH, initialCounter: INITIAL_COUNTER,
  });
  ok(receipt.outcome === "ACTIVE", `registration fixture reported ${receipt.outcome}`);
  return { bridge, registry };
}

function present(
  overrides: Partial<NfcChallenge> = {},
  bridge = new FakeCoreNfcBridge(),
  nowEpochMs = NOW,
  registry?: CardRegistry,
): ReturnType<typeof runPossession>["receipt"] {
  const state = registry === undefined ? registered(bridge) : { bridge, registry };
  return runPossession({
    profile: profile(),
    challenge: challenge(overrides),
    bound: BOUND,
    bridge: state.bridge,
    registry: state.registry,
    nowEpochMs,
    timeoutMs: TIMEOUT_MS,
  }).receipt;
}

// SEC-NFC-001. Exact card, protocol, application, OS, entitlement and key-management identity.
// The control #60 names is an unknown card or protocol treated as supported, and the rule that
// does the work is the proprietary-scheme obligation: a datasheet is not a review.
function exactProfile(): void {
  assertCardProfile(profile());
  assertCardProfile(reviewedProprietary());

  // `NfcProtocol` is a closed union, so the compiler refuses an unknown protocol before any
  // runtime rule sees it. The table below is the part that has to stay in step with the union.
  ok(PROPRIETARY_PROTOCOLS["mifare-desfire-ev3"], "a proprietary protocol is classified as open");
  ok(PROPRIETARY_PROTOCOLS["iso7816-4"] === false, "an open standard is classified as proprietary");
  ok(Object.keys(PROPRIETARY_PROTOCOLS).length === 3, "the proprietary classification does not cover every protocol");

  red(() => assertCardProfile(reviewedProprietary({ review: null })), "an unreviewed proprietary scheme");
  red(() => assertCardProfile(profile({
    protocol: "mifare-desfire-ev3",
    review: { reviewerId: "independent-lab", reportSha256: "6".repeat(64), reportDate: "2026-02-11", coversKeyManagement: false, coversEntitlementTerms: true },
  })), "a review that skipped key management");
  red(() => assertCardProfile(profile({
    protocol: "mifare-desfire-ev3",
    review: { reviewerId: "independent-lab", reportSha256: "6".repeat(64), reportDate: "2026-02-11", coversKeyManagement: true, coversEntitlementTerms: false },
  })), "a review that skipped entitlement terms");
  red(() => assertCardProfile(reviewedProprietary({
    review: { reviewerId: "independent-lab", reportSha256: "short", reportDate: "2026-02-11", coversKeyManagement: true, coversEntitlementTerms: true },
  })), "an unaddressed review report");
  red(() => assertCardProfile(reviewedProprietary({
    review: { reviewerId: "independent-lab", reportSha256: "6".repeat(64), reportDate: "February 2026", coversKeyManagement: true, coversEntitlementTerms: true },
  })), "an imprecise review date");
  red(() => assertCardProfile(reviewedProprietary({
    review: { reviewerId: "A B", reportSha256: "6".repeat(64), reportDate: "2026-02-11", coversKeyManagement: true, coversEntitlementTerms: true },
  })), "a malformed reviewer identifier");

  red(() => assertCardProfile(profile({ entitlements: [] })), "a profile without the reader entitlement");
  red(() => assertCardProfile(profile({ declaredApplicationIds: ["A0000006472F9999"] })), "an application the app does not declare");
  // Declared alongside the malformed value on purpose: the "app does not declare it" rule
  // above was catching this fixture, so disabling the format rule left the suite green.
  red(() => assertCardProfile(profile({ applicationId: "not-hex", declaredApplicationIds: ["not-hex"] })), "a malformed application identifier");
  red(() => assertCardProfile(profile({ osVersion: "latest" })), "a moving OS channel");
  red(() => assertCardProfile(profile({ profileId: "A B" })), "a malformed profile identifier");

  // SEC-NFC-006. A shared master key across a card population is not a possession scheme.
  red(() => assertCardProfile(profile({ keyRef: { ...profile().keyRef, diversified: false } })), "an undiversified key scheme");
  red(() => assertCardProfile(profile({ keyRef: { ...profile().keyRef, keySha256: "short" } })), "an unaddressed key reference");
  red(() => assertCardProfile(profile({ keyRef: { ...profile().keyRef, brokerId: "A B" } })), "a malformed broker identifier");
  red(() => assertCardProfile(profile({ keyRef: { ...profile().keyRef, keyId: "A B" } })), "a malformed key identifier");

  // The device the profile was admitted for is not the device answering.
  const otherOs = new FakeCoreNfcBridge();
  otherOs.osVersion = "17.5";
  const drifted = runRegistration({
    profile: profile(), cardRef: CARD_REF, bridge: otherOs, registry: new CardRegistry(), epoch: EPOCH, initialCounter: INITIAL_COUNTER,
  }).receipt;
  ok(drifted.outcome === "UNSUPPORTED_CARD", `an OS-drifted profile reported ${drifted.outcome}`);

  red(() => runRegistration({
    profile: profile(), cardRef: "A B", bridge: new FakeCoreNfcBridge(), registry: new CardRegistry(), epoch: EPOCH, initialCounter: INITIAL_COUNTER,
  }), "a malformed card reference");
  red(() => runRegistration({
    profile: profile(), cardRef: CARD_REF, bridge: new FakeCoreNfcBridge(), registry: new CardRegistry(), epoch: EPOCH, initialCounter: -1,
  }), "a negative initial counter");
}

// SEC-NFC-002. Challenge binding.
function challengeBinding(): void {
  const green = present();
  ok(green.outcome === "ACTIVE", `the bound challenge reported ${green.outcome}`);
  ok(green.evidence !== null, "the bound challenge emitted no evidence");

  const mismatches: [string, Partial<NfcChallenge>][] = [
    ["another intent", { intentDigest: "e".repeat(64) }],
    ["another policy epoch", { policyEpoch: EPOCH + 1 }],
    ["another audience", { audience: "agent-shield.other" }],
    ["another device", { deviceRef: "other-iphone" }],
    ["an unregistered card", { cardRef: "card-unknown" }],
    ["a short nonce", { nonce: "short" }],
    ["an inverted validity window", { issuedAtEpochMs: EXPIRES, expiresAtEpochMs: ISSUED }],
    ["a fractional validity window", { expiresAtEpochMs: EXPIRES + 0.5 }],
  ];
  for (const [label, overrides] of mismatches) {
    const receipt = present(overrides);
    ok(receipt.outcome === "CARD_MISMATCH", `${label} reported ${receipt.outcome}`);
    ok(receipt.evidence === null, `${label} emitted evidence`);
  }

  // The intent binding is checked for shape and for equality. Binding the caller's expectation
  // to the same malformed value leaves only the shape rule able to fire.
  const state = registered(new FakeCoreNfcBridge());
  const shapeless = runPossession({
    profile: profile(),
    challenge: challenge({ nonce: "9".repeat(32), intentDigest: "not-a-digest" }),
    bound: { ...BOUND, intentDigest: "not-a-digest" },
    bridge: state.bridge, registry: state.registry, nowEpochMs: NOW, timeoutMs: TIMEOUT_MS,
  }).receipt;
  ok(shapeless.outcome === "CARD_MISMATCH", `an unaddressed intent reported ${shapeless.outcome}`);

  // An expired challenge is a timeout, not a mismatch: nothing about the card was wrong.
  const stale = present({}, new FakeCoreNfcBridge(), EXPIRES);
  ok(stale.outcome === "TIMEOUT", `an expired challenge reported ${stale.outcome}`);

  red(() => runPossession({
    profile: profile(), challenge: challenge(), bound: BOUND,
    bridge: state.bridge, registry: state.registry, nowEpochMs: NOW, timeoutMs: 0,
  }), "a zero session timeout");
  red(() => runPossession({
    profile: profile(), challenge: challenge(), bound: BOUND,
    bridge: state.bridge, registry: state.registry, nowEpochMs: NOW, timeoutMs: 600_000,
  }), "a session timeout the platform will not honour");
}

// SEC-NFC-003. Anti-replay, on both ledgers. The two rules catch different attacks and the
// fixtures are shaped so that only one of them can fire at a time.
function antiReplay(): void {
  // A replayed challenge: same nonce, but a card presenting a fresh counter and a fresh
  // cryptogram, so neither of the other two rules can claim this fixture.
  const bridge = new FakeCoreNfcBridge();
  const state = registered(bridge);
  ok(present({}, state.bridge, NOW, state.registry).outcome === "ACTIVE", "the first exchange failed");
  bridge.counter = 43;
  bridge.cryptogramSha256 = "5".repeat(64);
  const replayedChallenge = present({}, state.bridge, NOW, state.registry);
  ok(replayedChallenge.outcome === "REPLAY_REFUSED", `a replayed challenge reported ${replayedChallenge.outcome}`);

  // A replayed response: fresh challenge and an advanced counter, but a cryptogram the reader
  // has already accepted. A recorded exchange played back under a new challenge looks fresh on
  // every other dimension, which is exactly why this ledger is separate.
  const second = new FakeCoreNfcBridge();
  const secondState = registered(second);
  ok(present({ nonce: "b".repeat(32) }, second, NOW, secondState.registry).outcome === "ACTIVE", "the first exchange failed");
  second.counter = 44;
  const replayedResponse = present({ nonce: "c".repeat(32) }, second, NOW, secondState.registry);
  ok(replayedResponse.outcome === "REPLAY_REFUSED", `a replayed response reported ${replayedResponse.outcome}`);

  // A stale counter: fresh challenge and a cryptogram never seen, but a counter the card has
  // already used.
  const third = new FakeCoreNfcBridge();
  const thirdState = registered(third);
  third.counter = INITIAL_COUNTER;
  third.cryptogramSha256 = "7".repeat(64);
  const stale = present({ nonce: "e".repeat(32) }, third, NOW, thirdState.registry);
  ok(stale.outcome === "COUNTER_STALE", `a stale counter reported ${stale.outcome}`);

  // A verified exchange advances the recorded counter. Without this the card could present the
  // same counter forever: the plant check found no control on the advance itself, because every
  // other fixture stopped before a second successful exchange.
  const advancing = new FakeCoreNfcBridge();
  const advancingState = registered(advancing);
  ok(present({ nonce: "a".repeat(32) }, advancing, NOW, advancingState.registry).outcome === "ACTIVE", "the first exchange failed");
  ok(advancingState.registry.get(CARD_REF)?.lastCounter === 42, "a verified exchange did not advance the counter");
  advancing.cryptogramSha256 = "6".repeat(64);
  const reused = present({ nonce: "d".repeat(32) }, advancing, NOW, advancingState.registry);
  ok(reused.outcome === "COUNTER_STALE", `a reused counter reported ${reused.outcome}`);

  const fractional = new FakeCoreNfcBridge();
  const fractionalState = registered(fractional);
  fractional.counter = 42.5;
  ok(present({ nonce: "f".repeat(32) }, fractional, NOW, fractionalState.registry).outcome === "COUNTER_STALE", "a fractional counter was accepted");

  // The counter only advances on a verified exchange. A response that failed verification must
  // not move it, or one rejected attempt burns every counter value below it.
  const unverified = new FakeCoreNfcBridge();
  const unverifiedState = registered(unverified);
  unverified.verifies = false;
  ok(present({ nonce: "1".repeat(32) }, unverified, NOW, unverifiedState.registry).outcome === "VERIFY_FAILED", "an unverified response was admitted");
  unverified.verifies = true;
  ok(unverifiedState.registry.get(CARD_REF)?.lastCounter === INITIAL_COUNTER, "a failed verification advanced the counter");
  ok(present({ nonce: "2".repeat(32) }, unverified, NOW, unverifiedState.registry).outcome === "ACTIVE", "the counter was burned by a failed verification");
}

// SEC-NFC-004. Card substitution, in each of the three ways a wrong card can answer.
function cardSubstitution(): void {
  const swapped = new FakeCoreNfcBridge();
  swapped.cardRefOverride = "card-other";
  ok(present({}, swapped).outcome === "CARD_MISMATCH", "another card was admitted");

  const otherApplication = new FakeCoreNfcBridge();
  otherApplication.applicationIdOverride = "A0000006472F9999";
  ok(present({}, otherApplication).outcome === "CARD_MISMATCH", "another application was admitted");

  const otherChallenge = new FakeCoreNfcBridge();
  otherChallenge.nonceOverride = "3".repeat(32);
  ok(present({}, otherChallenge).outcome === "CARD_MISMATCH", "a card echoing another challenge was admitted");

  const unaddressed = new FakeCoreNfcBridge();
  unaddressed.cryptogramSha256 = "not-a-digest";
  ok(present({}, unaddressed).outcome === "VERIFY_FAILED", "an unaddressed cryptogram was admitted");

  // Verification is a separate entry point: the party admitting evidence is not the one that
  // produced it.
  const state = registered(new FakeCoreNfcBridge());
  const evidence = present({}, state.bridge, NOW, state.registry).evidence as PossessionEvidence;
  ok(verifyPossessionEvidence(evidence, state.registry, BOUND) === null, "genuine evidence was refused");

  const forgeries: [string, PossessionEvidence][] = [
    ["an unregistered card", { ...evidence, cardRef: "card-unknown" }],
    ["another card profile", { ...evidence, profileId: "card-brake-v2" }],
    ["another application", { ...evidence, applicationId: "A0000006472F9999" }],
    ["an unaddressed cryptogram", { ...evidence, cryptogramSha256: "not-a-digest" }],
  ];
  for (const [label, forged] of forgeries) {
    ok(verifyPossessionEvidence(forged, state.registry, BOUND) !== null, `${label} was admitted`);
  }
  ok(verifyPossessionEvidence(evidence, state.registry, { ...BOUND, intentDigest: "e".repeat(64) }) !== null, "cross-intent evidence was admitted");
  ok(verifyPossessionEvidence(evidence, state.registry, { ...BOUND, policyEpoch: EPOCH + 1 }) !== null, "cross-epoch evidence was admitted");
}

// SEC-NFC-005. Cancellation, absence and timeout are three facts, and none of them is approval.
function cancellationAndTimeout(): void {
  const cancelled = new FakeCoreNfcBridge();
  cancelled.sessionCancelled = true;
  const dismissed = present({}, cancelled);
  ok(dismissed.outcome === "USER_CANCELLED", `a dismissed session reported ${dismissed.outcome}`);
  ok(dismissed.evidence === null, "a dismissed session emitted evidence");

  const timedOut = new FakeCoreNfcBridge();
  timedOut.sessionTimedOut = true;
  ok(present({}, timedOut).outcome === "TIMEOUT", "a timed-out session was not reported as a timeout");

  const noReader = new FakeCoreNfcBridge();
  noReader.sessionStarts = false;
  ok(present({}, noReader).outcome === "ABSENT_DEVICE", "a session that never started was not reported as absent");

  // The card left the field mid-exchange. A transport failure is not a verification failure.
  const withdrawn = new FakeCoreNfcBridge();
  const state = registered(withdrawn);
  withdrawn.answers = false;
  const abandoned = present({}, state.bridge, NOW, state.registry);
  ok(abandoned.outcome === "TIMEOUT", `a withdrawn card reported ${abandoned.outcome}`);
  ok(abandoned.evidence === null, "a withdrawn card emitted evidence");

  const unentitled = new FakeCoreNfcBridge();
  unentitled.entitled = false;
  const refused = runPossession({
    profile: profile(), challenge: challenge(), bound: BOUND,
    bridge: unentitled, registry: registered(new FakeCoreNfcBridge()).registry, nowEpochMs: NOW, timeoutMs: TIMEOUT_MS,
  }).receipt;
  ok(refused.outcome === "ENTITLEMENT_REFUSED", `an unentitled session reported ${refused.outcome}`);
}

// SEC-NFC-007. A revoked or lost card stops being admissible immediately, and replacement is a
// human ceremony.
function revocationAndRecovery(): void {
  const bridge = new FakeCoreNfcBridge();
  const state = registered(bridge);
  const evidence = present({}, state.bridge, NOW, state.registry).evidence as PossessionEvidence;
  ok(verifyPossessionEvidence(evidence, state.registry, BOUND) === null, "evidence was refused before revocation");

  red(() => runRevocation({
    cardRef: CARD_REF, fromEpoch: EPOCH, toEpoch: EPOCH + 1, bridge, registry: state.registry, humanApprovalRef: null,
  }), "an unapproved revocation");
  red(() => runRevocation({
    cardRef: CARD_REF, fromEpoch: EPOCH, toEpoch: EPOCH, bridge, registry: state.registry, humanApprovalRef: "admit-1",
  }), "a revocation that does not advance the epoch");

  const revoked = runRevocation({
    cardRef: CARD_REF, fromEpoch: EPOCH, toEpoch: EPOCH + 1, bridge, registry: state.registry, humanApprovalRef: "admit-1",
  }).receipt;
  ok(revoked.outcome === "REVOKED", `an approved revocation reported ${revoked.outcome}`);

  // Old evidence at the revoked epoch is refused, and a new exchange at that epoch cannot start.
  ok(verifyPossessionEvidence({ ...evidence, policyEpoch: EPOCH + 1 }, state.registry, { ...BOUND, policyEpoch: EPOCH + 1 }) !== null, "revoked evidence was admitted");
  bridge.counter = 99;
  bridge.cryptogramSha256 = "8".repeat(64);
  const afterRevocation = runPossession({
    profile: profile(), challenge: challenge({ nonce: "4".repeat(32), policyEpoch: EPOCH + 1 }),
    bound: { ...BOUND, policyEpoch: EPOCH + 1 }, bridge, registry: state.registry, nowEpochMs: NOW, timeoutMs: TIMEOUT_MS,
  }).receipt;
  ok(afterRevocation.outcome === "REVOKED", `a revoked card reported ${afterRevocation.outcome}`);

  // Revocation names an epoch; it does not rewrite history.
  ok(verifyPossessionEvidence(evidence, state.registry, BOUND) === null, "pre-revocation evidence was retroactively refused");

  // A lost card cannot be presented to have its application locked.
  const lost = new FakeCoreNfcBridge();
  const lostState = registered(lost);
  lost.revokes = false;
  const recovery = runRevocation({
    cardRef: CARD_REF, fromEpoch: EPOCH, toEpoch: EPOCH + 1, bridge: lost, registry: lostState.registry, humanApprovalRef: "admit-2",
  }).receipt;
  ok(recovery.outcome === "RECOVERY_REQUIRED", `an unreachable card reported ${recovery.outcome}`);
  ok(lostState.registry.get(CARD_REF)?.revokedFromEpoch === null, "an unconfirmed revocation was recorded as done");

  // A bridge that *would* revoke, asked about a card the registry does not hold. Reusing the
  // lost-card bridge here left the suite green under the plant check: `revokes = false` was
  // producing the same outcome, so the registry guard was never the reason.
  const reachable = new FakeCoreNfcBridge();
  const reachableState = registered(reachable);
  const unknown = runRevocation({
    cardRef: "card-unknown", fromEpoch: EPOCH, toEpoch: EPOCH + 1, bridge: reachable, registry: reachableState.registry, humanApprovalRef: "admit-3",
  }).receipt;
  ok(unknown.outcome === "RECOVERY_REQUIRED", `revoking an unknown card reported ${unknown.outcome}`);
}

// SEC-NFC-006 and SEC-NFC-008. No card key, application key or raw APDU reaches a receipt.
function keySecrecyAndCleanup(): void {
  const sealed = new SealedApdu(`00A404:${PLANTED_SECRET}`);

  ok(sealed.toJSON() === REDACTED, "toJSON leaked the APDU");
  ok(sealed.toString() === REDACTED, "toString leaked the APDU");
  ok(`${sealed}` === REDACTED, "template interpolation leaked the APDU");
  ok(String(sealed) === REDACTED, "String() leaked the APDU");
  ok(JSON.stringify(sealed) === `"${REDACTED}"`, "JSON serialization leaked the APDU");
  ok(JSON.stringify({ sealed }).includes(PLANTED_SECRET) === false, "nested serialization leaked the APDU");
  ok((sealed as unknown as Record<symbol, () => string>)[Symbol.for("nodejs.util.inspect.custom")]() === REDACTED, "the inspect hook leaked the APDU");
  ok(Object.values(sealed).some((value) => String(value).includes(PLANTED_SECRET)) === false, "an own property leaked the APDU");
  ok(/^[a-f0-9]{64}$/.test(sealed.sha256), "the APDU digest is absent");
  ok(sealed.use((value) => value.includes(PLANTED_SECRET)), "the scoped accessor could not reach the bytes");
  ok(sealed.byteLength > 0, "the APDU length is absent");

  const state = registered(new FakeCoreNfcBridge());
  const possession = present({}, state.bridge, NOW, state.registry);
  const registration = runRegistration({
    profile: profile(), cardRef: CARD_REF, bridge: new FakeCoreNfcBridge(), registry: new CardRegistry(), epoch: EPOCH, initialCounter: INITIAL_COUNTER,
  }).receipt;
  for (const [label, receipt] of [["possession", possession], ["registration", registration]] as const) {
    const text = JSON.stringify(receipt);
    ok(text.includes(PLANTED_SECRET) === false, `the ${label} receipt carried the planted secret`);
    ok(text.includes("00A4") === false, `the ${label} receipt carried a raw APDU`);
  }
  // The key reference is a broker pointer, and the receipt does not carry even that: nothing
  // downstream of this provider needs it.
  ok(JSON.stringify(possession).includes("openbao-local") === false, "the receipt carried a broker reference");

  const leakedBuffer = new FakeCoreNfcBridge();
  const bufferState = registered(leakedBuffer);
  leakedBuffer.retainedApduBufferCount = 1;
  const leaked = present({}, leakedBuffer, NOW, bufferState.registry);
  ok(leaked.outcome === "FAILED_CLEANUP", `a retained APDU buffer reported ${leaked.outcome}`);
  ok(leaked.sessionsCleared === false, "a retained APDU buffer was reported as cleared");
  // The exchange genuinely happened, so the evidence is preserved: a cleanup failure is a
  // separate fact from an exchange failure, and collapsing them loses one of them.
  ok(leaked.evidence !== null, "a cleanup failure discarded produced evidence");

  const leakedSession = new FakeCoreNfcBridge();
  leakedSession.retainedSessionCount = 1;
  const registrationLeak = runRegistration({
    profile: profile(), cardRef: CARD_REF, bridge: leakedSession, registry: new CardRegistry(), epoch: EPOCH, initialCounter: INITIAL_COUNTER,
  }).receipt;
  ok(registrationLeak.outcome === "FAILED_CLEANUP", `a retained reader session reported ${registrationLeak.outcome}`);
}

// The transition table itself. The provider only ever builds legal traces, so without these the
// enforcement point is type-checked and never executed.
function transitionLegality(): void {
  ok(validateNfcLifecycle(["UNPROVISIONED", "ABSENT_DEVICE"]) === "ABSENT_DEVICE", "a legal trace was refused");
  ok(isNfcOutcome("ACTIVE"), "ACTIVE is not recognised as an outcome");
  ok(isNfcOutcome("CARD_PRESENT") === false, "CARD_PRESENT is treated as an outcome");

  red(() => assertNfcTransition("CHALLENGE_BOUND", "EVIDENCE_EMITTED"), "emitting evidence without a response");
  red(() => assertNfcTransition("CARD_PRESENT", "EVIDENCE_EMITTED"), "emitting evidence without verifying");
  red(() => assertNfcTransition("RESPONSE_RECEIVED", "EVIDENCE_EMITTED"), "emitting evidence from an unverified response");
  red(() => assertNfcTransition("REVOKED", "ACTIVE"), "resurrecting a revoked card");
  red(() => assertNfcTransition("UNPROVISIONED", "ACTIVE"), "activating an unregistered card");

  red(() => validateNfcLifecycle(["UNPROVISIONED", "ACTIVE"]), "a trace that skipped registration");
  red(() => validateNfcLifecycle(["UNPROVISIONED", "CARD_PROFILE_ADMITTED"]), "a trace that stopped short of an outcome");
  red(() => validateNfcLifecycle(["ACTIVE"]), "a single-state trace");
}

// Every terminal state #60 names must be produced by a distinct fixture.
function stateSeparation(): void {
  const outcomes = new Set<NfcOutcome>();
  const fixtures: [string, () => NfcOutcome][] = [
    ["active", () => present().outcome],
    ["absent device", () => {
      const bridge = new FakeCoreNfcBridge();
      bridge.available = false;
      return runRegistration({ profile: profile(), cardRef: CARD_REF, bridge, registry: new CardRegistry(), epoch: EPOCH, initialCounter: INITIAL_COUNTER }).receipt.outcome;
    }],
    ["unsupported card", () => {
      const bridge = new FakeCoreNfcBridge();
      bridge.osVersion = "17.5";
      return runRegistration({ profile: profile(), cardRef: CARD_REF, bridge, registry: new CardRegistry(), epoch: EPOCH, initialCounter: INITIAL_COUNTER }).receipt.outcome;
    }],
    ["entitlement refused", () => {
      const bridge = new FakeCoreNfcBridge();
      bridge.entitled = false;
      return runRegistration({ profile: profile(), cardRef: CARD_REF, bridge, registry: new CardRegistry(), epoch: EPOCH, initialCounter: INITIAL_COUNTER }).receipt.outcome;
    }],
    ["user cancelled", () => {
      const bridge = new FakeCoreNfcBridge();
      bridge.sessionCancelled = true;
      return present({}, bridge).outcome;
    }],
    ["timeout", () => {
      const bridge = new FakeCoreNfcBridge();
      bridge.sessionTimedOut = true;
      return present({}, bridge).outcome;
    }],
    ["card mismatch", () => {
      const bridge = new FakeCoreNfcBridge();
      bridge.cardRefOverride = "card-other";
      return present({}, bridge).outcome;
    }],
    ["counter stale", () => {
      const bridge = new FakeCoreNfcBridge();
      const state = registered(bridge);
      bridge.counter = INITIAL_COUNTER;
      return present({}, bridge, NOW, state.registry).outcome;
    }],
    ["replay refused", () => {
      const bridge = new FakeCoreNfcBridge();
      const state = registered(bridge);
      present({}, bridge, NOW, state.registry);
      bridge.counter = 43;
      bridge.cryptogramSha256 = "5".repeat(64);
      return present({}, bridge, NOW, state.registry).outcome;
    }],
    ["verify failed", () => {
      const bridge = new FakeCoreNfcBridge();
      bridge.verifies = false;
      return present({}, bridge).outcome;
    }],
    ["revoked", () => {
      const bridge = new FakeCoreNfcBridge();
      const state = registered(bridge);
      return runRevocation({ cardRef: CARD_REF, fromEpoch: EPOCH, toEpoch: EPOCH + 1, bridge, registry: state.registry, humanApprovalRef: "admit-4" }).receipt.outcome;
    }],
    ["recovery required", () => {
      const bridge = new FakeCoreNfcBridge();
      const state = registered(bridge);
      bridge.revokes = false;
      return runRevocation({ cardRef: CARD_REF, fromEpoch: EPOCH, toEpoch: EPOCH + 1, bridge, registry: state.registry, humanApprovalRef: "admit-5" }).receipt.outcome;
    }],
    ["failed cleanup", () => {
      const bridge = new FakeCoreNfcBridge();
      const state = registered(bridge);
      bridge.retainedApduBufferCount = 1;
      return present({}, bridge, NOW, state.registry).outcome;
    }],
  ];
  for (const [label, invoke] of fixtures) {
    const outcome = invoke();
    ok(outcome !== undefined, `${label} produced no outcome`);
    outcomes.add(outcome);
  }
  ok(outcomes.size === 13, `the fixtures cover ${outcomes.size} distinct outcomes, expected 13`);
}

function evidenceBoundary(): void {
  ok(corenfcProviderState.readerSession === "NOT_EXERCISED", "a reader session was claimed");
  ok(corenfcProviderState.cardExchange === "NOT_EXERCISED", "a card exchange was claimed");
  ok(corenfcProviderState.cryptogramVerification === "NOT_EXERCISED", "a cryptogram verification was claimed");
  ok(corenfcProviderState.cardIssuanceAndKeyInjection === "NOT_IMPLEMENTED", "card issuance was claimed");
  ok(corenfcProviderState.lostCardReplacement === "NOT_IMPLEMENTED", "card replacement was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const corenfcNeverPasses: NeverPass<typeof corenfcProviderState> = true;
void corenfcNeverPasses;

exactProfile();
challengeBinding();
antiReplay();
cardSubstitution();
cancellationAndTimeout();
revocationAndRecovery();
keySecrecyAndCleanup();
transitionLegality();
stateSeparation();
evidenceBoundary();

console.log("SEC-NFC GREEN: exact profile, challenge binding, anti-replay, card substitution, cancellation/timeout, revocation/recovery, key secrecy, cleanup, transition legality");
