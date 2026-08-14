import { validateNfcLifecycle } from "./state-machine.ts";
import {
  NFC_LIFECYCLE_RECEIPT_SCHEMA,
  NFC_POSSESSION_RECEIPT_SCHEMA,
  NFC_REGISTRATION_RECEIPT_SCHEMA,
  PROPRIETARY_PROTOCOLS,
  type CardProfile,
  type CoreNfcBridge,
  type NfcChallenge,
  type NfcLifecycleReceipt,
  type NfcPossessionReceipt,
  type NfcRegistrationReceipt,
  type NfcState,
  type PossessionEvidence,
  type RegisteredCard,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const APPLICATION_ID = /^[A-F0-9]{10,32}$/;
const SEMVER_ISH = /^[0-9]+(?:\.[0-9]+){1,3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// SEC-NFC-001. Without this entitlement the app cannot open a reader session at all, so its
// absence is an admission failure rather than a runtime surprise.
const REQUIRED_ENTITLEMENT = "com.apple.developer.nfc.readersession.formats";

// The session timeout the platform itself enforces. A value above it is a policy this provider
// cannot deliver; a value at zero or below is a session that can never find a card.
const MAX_SESSION_MS = 60_000;

export function fail(message: string): never {
  throw new Error(`invalid nfc contract: ${message}`);
}

// SEC-NFC-001. Exact card, protocol, application, OS, entitlement and key-management identity.
//
// The control #60 names is an unknown card or protocol treated as supported. `NfcProtocol` is a
// closed union so an unknown string cannot be constructed, and the rule that does the work at
// runtime is the one below it: a proprietary scheme without a review that actually covered key
// management and entitlement terms is refused, not annotated.
export function assertCardProfile(profile: CardProfile): CardProfile {
  if (!SAFE_ID.test(profile.profileId)) fail("profileId is invalid");
  if (!SEMVER_ISH.test(profile.osVersion)) fail("osVersion must be an exact version");
  if (!APPLICATION_ID.test(profile.applicationId)) fail("applicationId must be an uppercase hex application identifier");
  if (!profile.entitlements.includes(REQUIRED_ENTITLEMENT)) fail(`entitlement ${REQUIRED_ENTITLEMENT} is absent`);
  // An application identifier the app never declared cannot be selected on device. A profile
  // naming one describes a build that will fail in the field, so it fails here instead.
  if (!profile.declaredApplicationIds.includes(profile.applicationId)) {
    fail("the profile selects an application identifier the app does not declare");
  }

  const keyRef = profile.keyRef;
  if (!SAFE_ID.test(keyRef.brokerId)) fail("keyRef.brokerId is invalid");
  if (!SAFE_ID.test(keyRef.keyId)) fail("keyRef.keyId is invalid");
  if (!SHA_256.test(keyRef.keySha256)) fail("keyRef.keySha256 is invalid");
  // A shared master key across a card population means one extracted card compromises every
  // card, which is not a possession scheme however strong the cryptogram is.
  if (!keyRef.diversified) fail("the scheme does not diversify keys per card");

  if (PROPRIETARY_PROTOCOLS[profile.protocol]) {
    const review = profile.review;
    if (review === null) fail(`proprietary protocol ${profile.protocol} has no security review`);
    if (!SAFE_ID.test(review.reviewerId)) fail("review.reviewerId is invalid");
    if (!SHA_256.test(review.reportSha256)) fail("review.reportSha256 is invalid");
    if (!ISO_DATE.test(review.reportDate)) fail("review.reportDate is invalid");
    // A review that skipped key management or entitlement terms did not review the two things
    // #60 says a proprietary scheme has to be reviewed for.
    if (!review.coversKeyManagement) fail("the review does not cover key management");
    if (!review.coversEntitlementTerms) fail("the review does not cover entitlement terms");
  }
  return profile;
}

// SEC-NFC-003 and SEC-NFC-004. The registered cards, their counters, and the nonces already
// spent against them.
//
// Counters and nonces live together because they answer the same question -- has this exchange
// already happened -- and they fail differently: a stale counter is a replayed card, a spent
// nonce is a replayed challenge.
export class CardRegistry {
  readonly #cards = new Map<string, RegisteredCard>();
  readonly #spentNonces = new Set<string>();
  readonly #seenCryptograms = new Set<string>();

  register(card: RegisteredCard): void {
    if (this.#cards.has(card.cardRef)) fail("a card is already registered under this reference");
    this.#cards.set(card.cardRef, card);
  }

  get(cardRef: string): RegisteredCard | null {
    return this.#cards.get(cardRef) ?? null;
  }

  advanceCounter(cardRef: string, counter: number): void {
    const card = this.#cards.get(cardRef);
    if (card === undefined) fail("cannot advance the counter of an unregistered card");
    this.#cards.set(cardRef, { ...card, lastCounter: counter });
  }

  revoke(cardRef: string, fromEpoch: number): boolean {
    const card = this.#cards.get(cardRef);
    if (card === undefined) return false;
    this.#cards.set(cardRef, { ...card, revokedFromEpoch: fromEpoch });
    return true;
  }

  // Scoped to the card: two cards may legitimately be challenged with the same random value,
  // and a global set would turn that coincidence into a refusal.
  isSpent(cardRef: string, nonce: string): boolean {
    return this.#spentNonces.has(`${cardRef}|${nonce}`);
  }

  spend(cardRef: string, nonce: string): void {
    this.#spentNonces.add(`${cardRef}|${nonce}`);
  }

  // A cryptogram that has been seen before is a captured exchange being replayed back at the
  // reader. This is a different fact from a spent nonce -- the challenge may be fresh while the
  // response is recorded -- so it has its own ledger.
  hasSeenCryptogram(cryptogramSha256: string): boolean {
    return this.#seenCryptograms.has(cryptogramSha256);
  }

  recordCryptogram(cryptogramSha256: string): void {
    this.#seenCryptograms.add(cryptogramSha256);
  }
}

// SEC-NFC-002. Every binding the challenge carries, checked in one pass.
export function challengeRefusal(
  challenge: NfcChallenge,
  bound: { intentDigest: string; policyEpoch: number; audience: string; deviceRef: string },
  registry: CardRegistry,
  nowEpochMs: number,
): { refusal: string; state: NfcState } | null {
  if (challenge.nonce.length < 16) return { refusal: "the challenge nonce is too short to be unguessable", state: "CARD_MISMATCH" };
  if (!SHA_256.test(challenge.intentDigest)) return { refusal: "the challenge intent is not content-addressed", state: "CARD_MISMATCH" };
  if (challenge.intentDigest !== bound.intentDigest) return { refusal: "the challenge is bound to another intent", state: "CARD_MISMATCH" };
  if (challenge.policyEpoch !== bound.policyEpoch) return { refusal: "the challenge is bound to another policy epoch", state: "CARD_MISMATCH" };
  if (challenge.audience !== bound.audience) return { refusal: "the challenge is bound to another audience", state: "CARD_MISMATCH" };
  if (challenge.deviceRef !== bound.deviceRef) return { refusal: "the challenge is bound to another device", state: "CARD_MISMATCH" };

  const card = registry.get(challenge.cardRef);
  if (card === null) return { refusal: "the challenge names an unregistered card", state: "CARD_MISMATCH" };
  // SEC-NFC-007. Checked before expiry so that a revoked card cannot report "timed out" and
  // invite a retry with a fresh challenge.
  if (card.revokedFromEpoch !== null && challenge.policyEpoch >= card.revokedFromEpoch) {
    return { refusal: "the card was revoked from this policy epoch", state: "REVOKED" };
  }

  if (!Number.isSafeInteger(challenge.issuedAtEpochMs) || !Number.isSafeInteger(challenge.expiresAtEpochMs)) {
    return { refusal: "the challenge validity window is not a whole number of milliseconds", state: "CARD_MISMATCH" };
  }
  if (challenge.expiresAtEpochMs <= challenge.issuedAtEpochMs) return { refusal: "the challenge expires before it was issued", state: "CARD_MISMATCH" };
  // An expired challenge is reported as a timeout rather than as a mismatch: nothing about the
  // card was wrong, the window closed.
  if (nowEpochMs >= challenge.expiresAtEpochMs) return { refusal: "the challenge has expired", state: "TIMEOUT" };

  if (registry.isSpent(challenge.cardRef, challenge.nonce)) {
    return { refusal: "the challenge nonce was already spent", state: "REPLAY_REFUSED" };
  }
  return null;
}

interface Cleanup {
  cleared: boolean;
  detail: string;
}

// SEC-NFC-008. Asked once, after every ceremony, whatever the ceremony's own outcome was. A
// clean refusal that leaves a reader session open or an APDU buffer alive is still a failure to
// clean up, and the buffer is the one holding card bytes.
function cleanup(bridge: CoreNfcBridge): Cleanup {
  const sessions = bridge.retainedSessions();
  const buffers = bridge.retainedApduBuffers();
  if (sessions > 0 || buffers > 0) {
    return { cleared: false, detail: `${sessions} reader sessions and ${buffers} APDU buffers were retained` };
  }
  return { cleared: true, detail: "no reader session or APDU buffer was retained" };
}

function registrationReceipt(
  profileId: string,
  lifecycle: NfcState[],
  detail: string,
  cardRef: string | null,
  sessionsCleared: boolean,
): NfcRegistrationReceipt {
  return {
    schema: NFC_REGISTRATION_RECEIPT_SCHEMA,
    cardRef,
    profileId,
    lifecycle,
    outcome: validateNfcLifecycle(lifecycle),
    sessionsCleared,
    detail,
  };
}

export interface RegistrationRequest {
  profile: CardProfile;
  cardRef: string;
  bridge: CoreNfcBridge;
  registry: CardRegistry;
  epoch: number;
  // The counter the card presented at issuance. Registration pins it so the first possession
  // exchange has something to be newer than.
  initialCounter: number;
}

// UNPROVISIONED → CARD_PROFILE_ADMITTED → CARD_REGISTERED → ACTIVE
export function runRegistration(request: RegistrationRequest): { receipt: NfcRegistrationReceipt; card: RegisteredCard | null } {
  const { profile, cardRef, bridge, registry, epoch, initialCounter } = request;
  assertCardProfile(profile);
  if (!SAFE_ID.test(cardRef)) fail("cardRef is invalid");
  if (!Number.isSafeInteger(initialCounter) || initialCounter < 0) fail("the initial counter must be a whole number");
  const lifecycle: NfcState[] = ["UNPROVISIONED"];

  const probe = bridge.probe();
  if (!probe.available) {
    lifecycle.push("ABSENT_DEVICE");
    return { receipt: registrationReceipt(profile.profileId, lifecycle, "the device has no NFC reader", null, cleanup(bridge).cleared), card: null };
  }
  // The entitlement is declared in the profile and granted by the platform, and only the second
  // one can refuse a session. Both are checked because a build can carry the declaration while
  // the provisioning profile does not grant it.
  if (!probe.entitled) {
    lifecycle.push("ENTITLEMENT_REFUSED");
    return { receipt: registrationReceipt(profile.profileId, lifecycle, "the platform refused the reader entitlement", null, cleanup(bridge).cleared), card: null };
  }
  if (probe.osVersion !== profile.osVersion) {
    lifecycle.push("UNSUPPORTED_CARD");
    return {
      receipt: registrationReceipt(profile.profileId, lifecycle, `the profile was admitted for ${profile.osVersion} and the device reports ${probe.osVersion}`, null, cleanup(bridge).cleared),
      card: null,
    };
  }
  lifecycle.push("CARD_PROFILE_ADMITTED");

  const card: RegisteredCard = {
    cardRef,
    profileId: profile.profileId,
    applicationId: profile.applicationId,
    lastCounter: initialCounter,
    registeredAtEpoch: epoch,
    revokedFromEpoch: null,
  };
  registry.register(card);
  lifecycle.push("CARD_REGISTERED");

  const cleared = cleanup(bridge);
  if (!cleared.cleared) {
    lifecycle.push("FAILED_CLEANUP");
    return { receipt: registrationReceipt(profile.profileId, lifecycle, cleared.detail, cardRef, false), card };
  }
  lifecycle.push("ACTIVE");
  return { receipt: registrationReceipt(profile.profileId, lifecycle, "the card is registered and active", cardRef, true), card };
}

export interface PossessionRequest {
  profile: CardProfile;
  challenge: NfcChallenge;
  bound: { intentDigest: string; policyEpoch: number; audience: string; deviceRef: string };
  bridge: CoreNfcBridge;
  registry: CardRegistry;
  nowEpochMs: number;
  timeoutMs: number;
}

function possessionReceipt(
  request: PossessionRequest,
  lifecycle: NfcState[],
  detail: string,
  evidence: PossessionEvidence | null,
  sessionsCleared: boolean,
): NfcPossessionReceipt {
  return {
    schema: NFC_POSSESSION_RECEIPT_SCHEMA,
    cardRef: request.challenge.cardRef,
    deviceRef: request.bound.deviceRef,
    policyEpoch: request.bound.policyEpoch,
    lifecycle,
    outcome: validateNfcLifecycle(lifecycle),
    evidence,
    sessionsCleared,
    detail,
  };
}

// ACTIVE → SESSION_STARTED → CHALLENGE_BOUND → CARD_PRESENT → RESPONSE_RECEIVED
//       → RESPONSE_VERIFIED → EVIDENCE_EMITTED → ACTIVE
export function runPossession(request: PossessionRequest): { receipt: NfcPossessionReceipt } {
  const { profile, challenge, bound, bridge, registry, nowEpochMs, timeoutMs } = request;
  assertCardProfile(profile);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_SESSION_MS) {
    fail(`the session timeout must be between 1 and ${MAX_SESSION_MS} milliseconds`);
  }
  const lifecycle: NfcState[] = ["ACTIVE"];

  const session = bridge.startSession(profile, timeoutMs);
  if (!session.entitled) {
    lifecycle.push("SESSION_STARTED", "ENTITLEMENT_REFUSED");
    return { receipt: possessionReceipt(request, lifecycle, "the platform refused the reader entitlement", null, cleanup(bridge).cleared) };
  }
  if (!session.started) {
    lifecycle.push("SESSION_STARTED", "ABSENT_DEVICE");
    return { receipt: possessionReceipt(request, lifecycle, "the reader session did not start", null, cleanup(bridge).cleared) };
  }
  lifecycle.push("SESSION_STARTED");
  // SEC-NFC-005. Checked before anything is read: a user who dismissed the sheet and a session
  // that ran out of time are separate facts, and neither is a card result.
  if (session.cancelled) {
    lifecycle.push("USER_CANCELLED");
    return { receipt: possessionReceipt(request, lifecycle, "the user dismissed the reader session", null, cleanup(bridge).cleared) };
  }
  if (session.timedOut) {
    lifecycle.push("TIMEOUT");
    return { receipt: possessionReceipt(request, lifecycle, "the reader session found no card before the timeout", null, cleanup(bridge).cleared) };
  }

  const refusal = challengeRefusal(challenge, bound, registry, nowEpochMs);
  if (refusal !== null) {
    lifecycle.push("CHALLENGE_BOUND", refusal.state);
    return { receipt: possessionReceipt(request, lifecycle, refusal.refusal, null, cleanup(bridge).cleared) };
  }
  // Spent before the exchange, not after it succeeds. A run that fails after the card has
  // already answered must not leave the challenge replayable.
  registry.spend(challenge.cardRef, challenge.nonce);
  lifecycle.push("CHALLENGE_BOUND", "CARD_PRESENT");

  const response = bridge.transceive(challenge);
  if (response === null) {
    lifecycle.push("TIMEOUT");
    return { receipt: possessionReceipt(request, lifecycle, "the card left the field before answering", null, cleanup(bridge).cleared) };
  }
  lifecycle.push("RESPONSE_RECEIVED");

  // SEC-NFC-004. A response that arrived is not a response from the card that was asked. Card
  // reference, application and echoed nonce are checked separately because swapping a card,
  // selecting another application and replaying another exchange are three different attacks.
  if (response.cardRef !== challenge.cardRef) {
    lifecycle.push("CARD_MISMATCH");
    return { receipt: possessionReceipt(request, lifecycle, "another card answered the challenge", null, cleanup(bridge).cleared) };
  }
  if (response.applicationId !== profile.applicationId) {
    lifecycle.push("CARD_MISMATCH");
    return { receipt: possessionReceipt(request, lifecycle, "the card answered from another application", null, cleanup(bridge).cleared) };
  }
  if (response.nonce !== challenge.nonce) {
    lifecycle.push("CARD_MISMATCH");
    return { receipt: possessionReceipt(request, lifecycle, "the card echoed another challenge", null, cleanup(bridge).cleared) };
  }
  if (!SHA_256.test(response.cryptogramSha256)) {
    lifecycle.push("VERIFY_FAILED");
    return { receipt: possessionReceipt(request, lifecycle, "the card response is not content-addressed", null, cleanup(bridge).cleared) };
  }

  const card = registry.get(challenge.cardRef) as RegisteredCard;
  // SEC-NFC-003. The counter must have moved. A card presenting a value it has already used is
  // being replayed, and a non-integer value slips past a plain comparison.
  if (!Number.isSafeInteger(response.counter) || response.counter <= card.lastCounter) {
    lifecycle.push("COUNTER_STALE");
    return { receipt: possessionReceipt(request, lifecycle, `the card presented counter ${response.counter} at or below the recorded ${card.lastCounter}`, null, cleanup(bridge).cleared) };
  }
  // A cryptogram seen before is a captured exchange being replayed. Distinct from a stale
  // counter: a recorded response replayed under a fresh challenge has a fresh-looking counter.
  if (registry.hasSeenCryptogram(response.cryptogramSha256)) {
    lifecycle.push("REPLAY_REFUSED");
    return { receipt: possessionReceipt(request, lifecycle, "the card response was seen before", null, cleanup(bridge).cleared) };
  }

  const verification = bridge.verify(response, challenge, profile.keyRef);
  if (!verification.verified) {
    lifecycle.push("VERIFY_FAILED");
    return { receipt: possessionReceipt(request, lifecycle, verification.reason ?? "the card response did not verify", null, cleanup(bridge).cleared) };
  }
  registry.advanceCounter(challenge.cardRef, response.counter);
  registry.recordCryptogram(response.cryptogramSha256);
  lifecycle.push("RESPONSE_VERIFIED");

  const evidence: PossessionEvidence = {
    cardRef: card.cardRef,
    profileId: profile.profileId,
    protocol: profile.protocol,
    applicationId: profile.applicationId,
    deviceRef: bound.deviceRef,
    intentDigest: challenge.intentDigest,
    challengeNonce: challenge.nonce,
    policyEpoch: challenge.policyEpoch,
    counter: response.counter,
    cryptogramSha256: response.cryptogramSha256,
  };
  lifecycle.push("EVIDENCE_EMITTED");

  const cleared = cleanup(bridge);
  if (!cleared.cleared) {
    lifecycle.push("FAILED_CLEANUP");
    return { receipt: possessionReceipt(request, lifecycle, cleared.detail, evidence, false) };
  }
  lifecycle.push("ACTIVE");
  return { receipt: possessionReceipt(request, lifecycle, "possession evidence was emitted", evidence, true) };
}

// SEC-NFC-004. Verification is a separate entry point from the exchange on purpose: the party
// that admits evidence is not the party that produced it.
export function verifyPossessionEvidence(
  evidence: PossessionEvidence,
  registry: CardRegistry,
  bound: { intentDigest: string; policyEpoch: number },
): string | null {
  const card = registry.get(evidence.cardRef);
  if (card === null) return "the evidence names an unregistered card";
  if (card.profileId !== evidence.profileId) return "the evidence carries another card profile";
  if (card.applicationId !== evidence.applicationId) return "the evidence carries another application";
  if (evidence.intentDigest !== bound.intentDigest) return "the evidence is bound to another intent";
  if (evidence.policyEpoch !== bound.policyEpoch) return "the evidence is bound to another policy epoch";
  if (card.revokedFromEpoch !== null && evidence.policyEpoch >= card.revokedFromEpoch) {
    return "the card was revoked from this policy epoch";
  }
  if (!SHA_256.test(evidence.cryptogramSha256)) return "the evidence cryptogram is not content-addressed";
  return null;
}

export interface LifecycleRequest {
  cardRef: string;
  fromEpoch: number;
  toEpoch: number;
  bridge: CoreNfcBridge;
  registry: CardRegistry;
  humanApprovalRef: string | null;
}

function lifecycleReceipt(
  request: LifecycleRequest,
  lifecycle: NfcState[],
  detail: string,
  sessionsCleared: boolean,
): NfcLifecycleReceipt {
  return {
    schema: NFC_LIFECYCLE_RECEIPT_SCHEMA,
    cardRef: request.cardRef,
    lifecycle,
    outcome: validateNfcLifecycle(lifecycle),
    fromEpoch: request.fromEpoch,
    toEpoch: request.toEpoch,
    humanApprovalRef: request.humanApprovalRef,
    sessionsCleared,
    detail,
  };
}

// SEC-NFC-007. A revoked or lost card stops being admissible immediately; the replacement is a
// human ceremony this provider reports on and never performs.
export function runRevocation(request: LifecycleRequest): { receipt: NfcLifecycleReceipt } {
  const { registry, bridge, cardRef, toEpoch, humanApprovalRef } = request;
  if (humanApprovalRef === null) fail("revocation requires a human approval reference");
  if (!Number.isSafeInteger(toEpoch) || toEpoch <= request.fromEpoch) fail("a revocation must name a later policy epoch");
  const lifecycle: NfcState[] = ["ACTIVE"];

  if (registry.get(cardRef) === null) {
    lifecycle.push("RECOVERY_REQUIRED");
    return { receipt: lifecycleReceipt(request, lifecycle, "the card is not registered", cleanup(bridge).cleared) };
  }
  // A card that was lost cannot be presented to have its own application locked. That is the
  // case recovery exists for, and reporting it as a completed revocation is the failure
  // SEC-NFC-007's control looks for.
  if (!bridge.revoke(cardRef, toEpoch)) {
    lifecycle.push("RECOVERY_REQUIRED");
    return { receipt: lifecycleReceipt(request, lifecycle, "the card could not be reached to confirm revocation", cleanup(bridge).cleared) };
  }
  registry.revoke(cardRef, toEpoch);
  lifecycle.push("REVOKED");
  return { receipt: lifecycleReceipt(request, lifecycle, "the card is revoked from the named epoch", cleanup(bridge).cleared) };
}

// The evidence this provider is allowed to claim. Nothing a deterministic run reaches is a
// device fact, and the eval suite pins the type so widening a member to PASS fails to compile.
export const corenfcProviderState = {
  readerSession: "NOT_EXERCISED",
  cardExchange: "NOT_EXERCISED",
  cryptogramVerification: "NOT_EXERCISED",
  cardIssuanceAndKeyInjection: "NOT_IMPLEMENTED",
  lostCardReplacement: "NOT_IMPLEMENTED",
} as const;
