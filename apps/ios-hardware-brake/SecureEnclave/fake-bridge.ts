import { SealedAttestation } from "./sealed-attestation.ts";
import type {
  AccessControlPolicy,
  CreatedKey,
  EnclaveChallenge,
  EnclaveEnvironment,
  EnclaveSignature,
  KeyBacking,
  PresenceMethod,
  PresenceResult,
  SecureEnclaveBridge,
} from "./types.ts";

// SEC-SE-007. The blob the fake enclave hands back carries a value that must never appear in a
// receipt, a log line or an error message. The privacy control searches serialized output for
// it, so a redaction that stops working turns the eval red instead of turning it quiet.
export const PLANTED_SECRET = "planted-biometric-template-canary-3f9c" as const;

// A deterministic stand-in for the native Swift boundary. Every field is a knob a negative
// control turns, and nothing here performs cryptography: the digests are fixtures.
export class FakeSecureEnclaveBridge implements SecureEnclaveBridge {
  available = true;
  environment: EnclaveEnvironment = "device";
  hardware: KeyBacking = "secure-enclave";

  createsKey = true;
  backing: KeyBacking = "secure-enclave";
  exportable = false;
  keyId = "se-key-primary";
  publicKeySha256 = "1".repeat(64);

  presenceSatisfied = true;
  presenceCancelled = false;
  presenceMethod: PresenceMethod | null = "biometry";

  signs = true;
  signatureSha256 = "2".repeat(64);
  attestationSha256 = "3".repeat(64);
  // Set by the "bridge answered another challenge" control; null means answer the challenge
  // that was actually asked.
  signedNonceOverride: string | null = null;
  signedKeyOverride: string | null = null;

  revokes = true;

  retainedChallengeCount = 0;
  retainedAuthSessionCount = 0;

  probe(): { available: boolean; environment: EnclaveEnvironment; hardware: KeyBacking } {
    return { available: this.available, environment: this.environment, hardware: this.hardware };
  }

  createKey(policy: AccessControlPolicy): CreatedKey | null {
    if (!this.createsKey) return null;
    void policy;
    return {
      keyId: this.keyId,
      publicKeySha256: this.publicKeySha256,
      backing: this.backing,
      exportable: this.exportable,
      attestation: new SealedAttestation(`attestation:${this.keyId}:${PLANTED_SECRET}`),
    };
  }

  authorize(challenge: EnclaveChallenge, policy: AccessControlPolicy): PresenceResult {
    void challenge;
    void policy;
    return { satisfied: this.presenceSatisfied, method: this.presenceMethod, cancelled: this.presenceCancelled };
  }

  sign(challenge: EnclaveChallenge): EnclaveSignature | null {
    if (!this.signs) return null;
    return {
      keyId: this.signedKeyOverride ?? challenge.keyId,
      nonce: this.signedNonceOverride ?? challenge.nonce,
      signatureSha256: this.signatureSha256,
      attestationSha256: this.attestationSha256,
    };
  }

  revoke(keyId: string, fromEpoch: number): boolean {
    void keyId;
    void fromEpoch;
    return this.revokes;
  }

  retainedChallenges(): number {
    return this.retainedChallengeCount;
  }

  retainedAuthSessions(): number {
    return this.retainedAuthSessionCount;
  }
}
