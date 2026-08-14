import type { SealedApdu } from "./sealed-apdu.ts";

export const NFC_REGISTRATION_RECEIPT_SCHEMA = "agent-shield/nfc-registration-receipt/v1" as const;
export const NFC_POSSESSION_RECEIPT_SCHEMA = "agent-shield/nfc-possession-receipt/v1" as const;
export const NFC_LIFECYCLE_RECEIPT_SCHEMA = "agent-shield/nfc-lifecycle-receipt/v1" as const;

// Registration, possession and revocation share one state space so that a terminal state means
// the same thing whichever ceremony reached it.
export type NfcState =
  // Registration
  | "UNPROVISIONED"
  | "CARD_PROFILE_ADMITTED"
  | "CARD_REGISTERED"
  | "ACTIVE"
  // Possession
  | "SESSION_STARTED"
  | "CHALLENGE_BOUND"
  | "CARD_PRESENT"
  | "RESPONSE_RECEIVED"
  | "RESPONSE_VERIFIED"
  | "EVIDENCE_EMITTED"
  // Terminal and blocked
  | "ABSENT_DEVICE"
  | "UNSUPPORTED_CARD"
  | "ENTITLEMENT_REFUSED"
  | "USER_CANCELLED"
  | "TIMEOUT"
  | "CARD_MISMATCH"
  | "COUNTER_STALE"
  | "REPLAY_REFUSED"
  | "VERIFY_FAILED"
  | "REVOKED"
  | "RECOVERY_REQUIRED"
  | "FAILED_CLEANUP";

export type NfcOutcome = Extract<NfcState,
  | "ACTIVE"
  | "ABSENT_DEVICE"
  | "UNSUPPORTED_CARD"
  | "ENTITLEMENT_REFUSED"
  | "USER_CANCELLED"
  | "TIMEOUT"
  | "CARD_MISMATCH"
  | "COUNTER_STALE"
  | "REPLAY_REFUSED"
  | "VERIFY_FAILED"
  | "REVOKED"
  | "RECOVERY_REQUIRED"
  | "FAILED_CLEANUP">;

// SEC-NFC-001. #60 refuses to assume DESFire EV3 or any proprietary credential scheme without
// exact protocol, key-management, entitlement and legal/security review. So the protocol is an
// enumeration -- an unknown string is not a configuration this provider can accept -- and the
// proprietary members carry an extra obligation enforced in `assertCardProfile`.
export type NfcProtocol = "iso7816-4" | "iso14443-4" | "mifare-desfire-ev3";

// A scheme whose specification is not publicly reviewable cannot be admitted on a reading of
// its datasheet. The set is data rather than a comment so that adding a member to `NfcProtocol`
// without deciding which side it falls on is a compile error.
export const PROPRIETARY_PROTOCOLS: Readonly<Record<NfcProtocol, boolean>> = {
  "iso7816-4": false,
  "iso14443-4": false,
  "mifare-desfire-ev3": true,
};

// SEC-NFC-006. Every reference to card or application key material is opaque: a broker, an
// identifier and a digest. There is no field anywhere in this provider that can hold a key.
export interface CardKeyRef {
  brokerId: string;
  keyId: string;
  keySha256: string;
  // Whether the scheme derives a per-card key from a master key. A shared master key across a
  // card population means one extracted card compromises all of them, so this is recorded as a
  // property of the admitted profile rather than assumed.
  diversified: boolean;
}

// The review that admits a proprietary scheme. `null` means unreviewed, and an unreviewed
// proprietary scheme is refused rather than annotated.
export interface SchemeReview {
  reviewerId: string;
  reportSha256: string;
  reportDate: string;
  coversKeyManagement: boolean;
  coversEntitlementTerms: boolean;
}

export interface CardProfile {
  profileId: string;
  protocol: NfcProtocol;
  applicationId: string;
  osVersion: string;
  // The CoreNFC entitlement and the ISO7816 application identifiers the app declares. An
  // application the app did not declare cannot be selected at runtime, so a profile naming one
  // is a configuration that will fail on device rather than a stricter policy.
  entitlements: string[];
  declaredApplicationIds: string[];
  keyRef: CardKeyRef;
  review: SchemeReview | null;
}

export interface RegisteredCard {
  cardRef: string;
  profileId: string;
  applicationId: string;
  // SEC-NFC-003. The last counter value accepted from this card. A card that presents a value
  // at or below it is replaying, whatever else the response contains.
  lastCounter: number;
  registeredAtEpoch: number;
  revokedFromEpoch: number | null;
}

export interface NfcChallenge {
  nonce: string;
  intentDigest: string;
  policyEpoch: number;
  audience: string;
  cardRef: string;
  deviceRef: string;
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
}

export interface CardResponse {
  cardRef: string;
  applicationId: string;
  // The card's own monotonic counter, and the challenge nonce it echoes back.
  counter: number;
  nonce: string;
  cryptogramSha256: string;
  apdu: SealedApdu;
}

// SEC-NFC-005. Cancellation, absence and timeout are different facts about a session and each
// gets its own field. Collapsing them is how a timeout ends up read as approval.
export interface SessionResult {
  started: boolean;
  cancelled: boolean;
  timedOut: boolean;
  entitled: boolean;
}

export interface VerificationResult {
  verified: boolean;
  reason: string | null;
}

// SEC-NFC-002 and SEC-NFC-004. Metadata only. Possession of the named card under the named
// protocol, bound to one intent and one policy epoch -- and nothing more, which is what the
// evidence boundary in #60 says this proves.
export interface PossessionEvidence {
  cardRef: string;
  profileId: string;
  protocol: NfcProtocol;
  applicationId: string;
  deviceRef: string;
  intentDigest: string;
  challengeNonce: string;
  policyEpoch: number;
  counter: number;
  cryptogramSha256: string;
}

export interface NfcRegistrationReceipt {
  schema: typeof NFC_REGISTRATION_RECEIPT_SCHEMA;
  cardRef: string | null;
  profileId: string;
  lifecycle: NfcState[];
  outcome: NfcOutcome;
  sessionsCleared: boolean;
  detail: string;
}

export interface NfcPossessionReceipt {
  schema: typeof NFC_POSSESSION_RECEIPT_SCHEMA;
  cardRef: string;
  deviceRef: string;
  policyEpoch: number;
  lifecycle: NfcState[];
  outcome: NfcOutcome;
  evidence: PossessionEvidence | null;
  sessionsCleared: boolean;
  detail: string;
}

export interface NfcLifecycleReceipt {
  schema: typeof NFC_LIFECYCLE_RECEIPT_SCHEMA;
  cardRef: string;
  lifecycle: NfcState[];
  outcome: NfcOutcome;
  fromEpoch: number;
  toEpoch: number;
  // Card issuance, key injection and replacement are human ceremonies. This provider can report
  // that one is required; it can never perform one, so there is no "replaced" state.
  humanApprovalRef: string | null;
  sessionsCleared: boolean;
  detail: string;
}

// The native CoreNFC boundary. Everything on the far side is a reader session and a broker-held
// key; everything on this side -- profile admission, challenge binding, counter and nonce
// anti-replay, card substitution, revocation and cleanup accounting -- is owned here.
//
// `verify` lives on this interface rather than in this repository because verifying a card
// response needs the card key, and the card key is in the broker (#57). A verifier here would
// mean a key here.
export interface CoreNfcBridge {
  probe(): { available: boolean; entitled: boolean; osVersion: string };
  startSession(profile: CardProfile, timeoutMs: number): SessionResult;
  // `null` means the card left the field or the exchange failed at the transport level, which
  // is distinct from a response that arrived and failed verification.
  transceive(challenge: NfcChallenge): CardResponse | null;
  verify(response: CardResponse, challenge: NfcChallenge, keyRef: CardKeyRef): VerificationResult;
  revoke(cardRef: string, fromEpoch: number): boolean;
  // SEC-NFC-008. What the session left behind on the device.
  retainedSessions(): number;
  retainedApduBuffers(): number;
}
