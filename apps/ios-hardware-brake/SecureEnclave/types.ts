import type { SealedAttestation } from "./sealed-attestation.ts";

export const SE_KEY_RECEIPT_SCHEMA = "agent-shield/secure-enclave-key-receipt/v1" as const;
export const SE_SIGNING_RECEIPT_SCHEMA = "agent-shield/secure-enclave-signing-receipt/v1" as const;
export const SE_LIFECYCLE_RECEIPT_SCHEMA = "agent-shield/secure-enclave-lifecycle-receipt/v1" as const;

// Provisioning, signing and rotation share one state space so that a terminal state means the
// same thing whichever ceremony reached it.
export type SecureEnclaveState =
  // Provisioning
  | "UNPROVISIONED"
  | "DEVICE_CHECKED"
  | "KEY_CREATING"
  | "KEY_REGISTERED"
  | "ACTIVE"
  // Signing
  | "CHALLENGE_RECEIVED"
  | "USER_PRESENCE_REQUIRED"
  | "SIGNED"
  | "EVIDENCE_EMITTED"
  // Terminal and blocked
  | "ABSENT_DEVICE"
  | "UNSUPPORTED_HARDWARE"
  | "USER_REFUSED"
  | "AUTH_FAILED"
  | "CHALLENGE_EXPIRED"
  | "REPLAY_REFUSED"
  | "SIGN_FAILED"
  | "ROTATING"
  | "REVOKED"
  | "RECOVERY_REQUIRED"
  | "FAILED_CLEANUP";

export type SecureEnclaveOutcome = Extract<SecureEnclaveState,
  | "ACTIVE"
  | "ABSENT_DEVICE"
  | "UNSUPPORTED_HARDWARE"
  | "USER_REFUSED"
  | "AUTH_FAILED"
  | "CHALLENGE_EXPIRED"
  | "REPLAY_REFUSED"
  | "SIGN_FAILED"
  | "ROTATING"
  | "REVOKED"
  | "RECOVERY_REQUIRED"
  | "FAILED_CLEANUP">;

// SEC-SE-001. A simulator can run every line of this provider and produce a signature, so the
// environment is a field of the admitted subject rather than something inferred from whether a
// call succeeded. `simulator` and `unknown` are refused; they are `NOT_EXERCISED`, never PASS.
export type EnclaveEnvironment = "device" | "simulator" | "unknown";

// What the private key is actually held by. `software` is the fallback iOS silently gives a
// process on hardware without an enclave, and it is the single fact that separates "hardware
// evidence" from "a signature".
export type KeyBacking = "secure-enclave" | "software" | "unknown";

// SEC-SE-003. Biometry policy classes, named the way the platform names them. `none` is a
// declarable value precisely so that refusing it is a rule with one place to live rather than
// an absent field nobody notices.
export type BiometryPolicy = "current-biometry-set" | "any-biometry" | "none";

// The platform's protection classes. Anything that is not device-bound survives a backup
// restore onto another device, which makes it useless as possession evidence.
export type KeyAccessibility =
  | "when-unlocked-this-device-only"
  | "when-passcode-set-this-device-only"
  | "when-unlocked"
  | "always";

export interface PlatformSubject {
  osVersion: string;
  deviceModel: string;
  deviceRef: string;
  appBundleId: string;
  appVersion: string;
  teamId: string;
  entitlements: string[];
  xcodeVersion: string;
  swiftVersion: string;
  environment: EnclaveEnvironment;
  hardware: KeyBacking;
}

export interface AccessControlPolicy {
  policyId: string;
  userPresenceRequired: boolean;
  biometry: BiometryPolicy;
  devicePasscodeFallback: boolean;
  accessGroup: string;
  accessibility: KeyAccessibility;
}

export interface EnclaveKeyRecord {
  keyId: string;
  // A digest, not a key. The public key is not secret, but a digest is all any caller of this
  // provider needs and it keeps every field in this family the same shape.
  publicKeySha256: string;
  policyDigest: string;
  attestationSha256: string;
  deviceRef: string;
  createdAtEpoch: number;
  // SEC-SE-006. Revocation names the epoch it takes effect from. Evidence bound to that epoch
  // or later stops being admissible rather than being re-evaluated.
  revokedFromEpoch: number | null;
}

export interface EnclaveChallenge {
  nonce: string;
  intentDigest: string;
  policyEpoch: number;
  audience: string;
  keyId: string;
  deviceRef: string;
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
}

// SEC-SE-007. What the bridge is allowed to say about a local authorization. There is no field
// for which finger matched, how many attempts were made, or any other biometric result: the
// provider needs to know that presence was satisfied and under which policy class, and a field
// that does not exist cannot reach a receipt.
export type PresenceMethod = "biometry" | "device-passcode";

export interface PresenceResult {
  satisfied: boolean;
  method: PresenceMethod | null;
  cancelled: boolean;
}

export interface CreatedKey {
  keyId: string;
  publicKeySha256: string;
  backing: KeyBacking;
  // SEC-SE-002. The platform will tell you whether the key it produced can leave the device.
  // A `true` here means the enclave was not used, whatever else the call reported.
  exportable: boolean;
  attestation: SealedAttestation;
}

export interface EnclaveSignature {
  keyId: string;
  nonce: string;
  signatureSha256: string;
  attestationSha256: string;
}

// SEC-SE-005. Metadata only. A verifier is handed digests and references, so a forged evidence
// object has to match a registered key, device and policy epoch to be admitted -- which is the
// property the eval's control tries to break by substituting each one in turn.
export interface HardwareEvidence {
  keyId: string;
  deviceRef: string;
  publicKeySha256: string;
  intentDigest: string;
  challengeNonce: string;
  policyEpoch: number;
  presenceMethod: PresenceMethod;
  signatureSha256: string;
  attestationSha256: string;
}

export interface SecureEnclaveKeyReceipt {
  schema: typeof SE_KEY_RECEIPT_SCHEMA;
  keyId: string | null;
  deviceRef: string;
  lifecycle: SecureEnclaveState[];
  outcome: SecureEnclaveOutcome;
  publicKeySha256: string | null;
  policyDigest: string | null;
  sessionsCleared: boolean;
  detail: string;
}

export interface SecureEnclaveSigningReceipt {
  schema: typeof SE_SIGNING_RECEIPT_SCHEMA;
  keyId: string;
  deviceRef: string;
  policyEpoch: number;
  lifecycle: SecureEnclaveState[];
  outcome: SecureEnclaveOutcome;
  evidence: HardwareEvidence | null;
  sessionsCleared: boolean;
  detail: string;
}

export interface SecureEnclaveLifecycleReceipt {
  schema: typeof SE_LIFECYCLE_RECEIPT_SCHEMA;
  keyId: string;
  deviceRef: string;
  lifecycle: SecureEnclaveState[];
  outcome: SecureEnclaveOutcome;
  fromEpoch: number;
  toEpoch: number;
  // SEC-SE-008. Replacement after a lost device is a human ceremony. This provider can report
  // that recovery is required; it can never perform it, so there is no "recovered" state.
  humanApprovalRef: string | null;
  sessionsCleared: boolean;
  detail: string;
}

// The native Swift boundary. Everything on the far side is Secure Enclave and LocalAuthentication;
// everything on this side -- admission, access-control policy, challenge binding, replay,
// revocation, evidence verification and cleanup accounting -- is owned here and is what the
// deterministic evals exercise.
//
// There is deliberately no `exportKey`, `privateKey` or `serializeKey` member. SEC-SE-002 is a
// property of this interface's shape, not of a guard somebody has to remember to call.
export interface SecureEnclaveBridge {
  probe(): { available: boolean; environment: EnclaveEnvironment; hardware: KeyBacking };
  createKey(policy: AccessControlPolicy): CreatedKey | null;
  // Local authorization for one challenge. The bridge distinguishes refusal from failure
  // because SEC-SE-003's control is a signature produced without the required authorization.
  authorize(challenge: EnclaveChallenge, policy: AccessControlPolicy): PresenceResult;
  sign(challenge: EnclaveChallenge): EnclaveSignature | null;
  revoke(keyId: string, fromEpoch: number): boolean;
  // SEC-SE-008. What the ceremony left behind on the device.
  retainedChallenges(): number;
  retainedAuthSessions(): number;
}
