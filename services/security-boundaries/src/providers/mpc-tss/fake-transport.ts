import { SealedShare } from "./sealed-share.ts";
import type {
  MpcKeygenRequest,
  MpcPublicKey,
  MpcReshareRequest,
  MpcSignature,
  MpcSigningRequest,
  MpcTransport,
  MpcVectorReport,
} from "./types.ts";

// Deterministic in-memory stand-in for the audited MPC library. It performs no cryptography:
// the "shares" are fixture strings and the "signature" is a fixed digest. Everything this
// provider is responsible for -- admission, thresholds, message binding, epochs, abort and
// cleanup -- is real and is what the selftest exercises.
//
// A real deployment replaces this with a binding to the audited implementation. Nothing here
// can produce evidence about the protocol itself, which is why `mpcProviderState` records the
// protocol rounds and the vector suite as NOT_EXERCISED.
export class FakeMpcTransport implements MpcTransport {
  available = true;
  version: string | null = "0.6.1";
  artifactSha256: string | null = "a".repeat(64);
  vectors: MpcVectorReport | null = {
    suiteId: "cggmp21-independent-vectors",
    suiteSha256: "9".repeat(64),
    dkgVectorsPassed: 48,
    signatureVectorsPassed: 120,
    failures: 0,
    independentOfLibrary: true,
  };
  dkgSucceeds = true;
  reshareSucceeds = true;
  signs = true;
  revokes = true;
  responding: string[] | null = null;
  retainedTranscriptCount = 0;
  retainedShareBufferCount = 0;
  retainedProcessCount = 0;
  // Lets a fixture claim a signature assembled by too few, or by somebody who was never asked.
  contributorOverride: string[] | null = null;
  // Lets a fixture return a signature that is not content-addressed, or one minted under a
  // different epoch -- the two ways a transport can hand back something that looks like a
  // signature for this request and is not.
  signatureShaOverride: string | null = null;
  signatureEpochOverride: number | null = null;
  shareEpochOverride: number | null = null;
  // An empty share is what a transport returns when a round silently produced nothing. It has
  // the right shape and carries no key material, which is the combination that gets accepted.
  shareValueOverride: string | null = null;
  shareRecipientOverride: string[] | null = null;
  publicKeyOverride: Partial<MpcPublicKey> | null = null;

  probe(): { available: boolean; version: string | null; artifactSha256: string | null } {
    if (!this.available) return { available: false, version: null, artifactSha256: null };
    return { available: true, version: this.version, artifactSha256: this.artifactSha256 };
  }

  verifyVectors(): MpcVectorReport | null {
    return this.vectors === null ? null : { ...this.vectors };
  }

  runDkg(request: MpcKeygenRequest): { publicKey: MpcPublicKey; shares: SealedShare[] } | null {
    if (!this.dkgSucceeds) return null;
    const recipients = this.shareRecipientOverride ?? request.participants.map((participant) => participant.participantId);
    const epoch = this.shareEpochOverride ?? request.epoch;
    return {
      publicKey: {
        ceremonyId: request.ceremonyId,
        epoch: request.epoch,
        curve: "secp256k1",
        publicKeySha256: "b".repeat(64),
        ...this.publicKeyOverride,
      },
      shares: recipients.map((participantId) => new SealedShare(participantId, epoch, this.shareValueOverride ?? `fixture-share-${participantId}`)),
    };
  }

  respondingParticipants(_ceremonyId: string, _round: number): string[] {
    return this.responding ?? ["node-a", "node-b", "node-c"];
  }

  assembleSignature(request: MpcSigningRequest): MpcSignature | null {
    if (!this.signs) return null;
    return {
      requestId: request.requestId,
      epoch: this.signatureEpochOverride ?? request.epoch,
      signatureSha256: this.signatureShaOverride ?? "c".repeat(64),
      contributorIds: this.contributorOverride ?? [...request.signerIds],
    };
  }

  runReshare(request: MpcReshareRequest): { publicKey: MpcPublicKey; shares: SealedShare[] } | null {
    if (!this.reshareSucceeds) return null;
    const recipients = this.shareRecipientOverride ?? request.participants.map((participant) => participant.participantId);
    const epoch = this.shareEpochOverride ?? request.toEpoch;
    return {
      publicKey: {
        ceremonyId: request.ceremonyId,
        epoch: request.toEpoch,
        curve: "secp256k1",
        publicKeySha256: "d".repeat(64),
        ...this.publicKeyOverride,
      },
      shares: recipients.map((participantId) => new SealedShare(participantId, epoch, this.shareValueOverride ?? `fixture-share-${participantId}`)),
    };
  }

  revokeEpoch(_ceremonyId: string, _epoch: number): boolean {
    return this.revokes;
  }

  retainedTranscripts(): number {
    return this.retainedTranscriptCount;
  }

  retainedShareBuffers(): number {
    return this.retainedShareBufferCount;
  }

  retainedProcesses(): number {
    return this.retainedProcessCount;
  }
}
