import { SealedApdu } from "./sealed-apdu.ts";
import type {
  CardKeyRef,
  CardProfile,
  CardResponse,
  CoreNfcBridge,
  NfcChallenge,
  SessionResult,
  VerificationResult,
} from "./types.ts";

// SEC-NFC-006 and SEC-NFC-008. The APDU the fake card returns carries a value that must never
// appear in a receipt, a log line or an error message. The privacy control searches serialized
// output for it, so a redaction that stops working turns the eval red instead of turning it
// quiet.
export const PLANTED_SECRET = "planted-card-application-key-8b21" as const;

// A deterministic stand-in for the native CoreNFC boundary. Every field is a knob a negative
// control turns, and nothing here performs cryptography: the digests are fixtures.
export class FakeCoreNfcBridge implements CoreNfcBridge {
  available = true;
  entitled = true;
  osVersion = "18.2";

  sessionStarts = true;
  sessionCancelled = false;
  sessionTimedOut = false;

  // `false` means the card left the field, which is a transport fact rather than a verification
  // result and has to stay distinguishable from one.
  answers = true;
  cardRefOverride: string | null = null;
  applicationIdOverride: string | null = null;
  nonceOverride: string | null = null;
  counter = 42;
  cryptogramSha256 = "4".repeat(64);

  verifies = true;
  verifyReason: string | null = null;

  revokes = true;

  retainedSessionCount = 0;
  retainedApduBufferCount = 0;

  probe(): { available: boolean; entitled: boolean; osVersion: string } {
    return { available: this.available, entitled: this.entitled, osVersion: this.osVersion };
  }

  startSession(profile: CardProfile, timeoutMs: number): SessionResult {
    void profile;
    void timeoutMs;
    return {
      started: this.sessionStarts,
      cancelled: this.sessionCancelled,
      timedOut: this.sessionTimedOut,
      entitled: this.entitled,
    };
  }

  transceive(challenge: NfcChallenge): CardResponse | null {
    if (!this.answers) return null;
    return {
      cardRef: this.cardRefOverride ?? challenge.cardRef,
      applicationId: this.applicationIdOverride ?? "A0000006472F0001",
      counter: this.counter,
      nonce: this.nonceOverride ?? challenge.nonce,
      cryptogramSha256: this.cryptogramSha256,
      apdu: new SealedApdu(`00A4040007A0000006472F0001:${PLANTED_SECRET}`),
    };
  }

  verify(response: CardResponse, challenge: NfcChallenge, keyRef: CardKeyRef): VerificationResult {
    void response;
    void challenge;
    void keyRef;
    return { verified: this.verifies, reason: this.verifyReason };
  }

  revoke(cardRef: string, fromEpoch: number): boolean {
    void cardRef;
    void fromEpoch;
    return this.revokes;
  }

  retainedSessions(): number {
    return this.retainedSessionCount;
  }

  retainedApduBuffers(): number {
    return this.retainedApduBufferCount;
  }
}
