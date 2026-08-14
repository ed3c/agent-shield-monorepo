import type { SealedShare } from "./sealed-share.ts";

export const MPC_KEYGEN_RECEIPT_SCHEMA = "agent-shield/mpc-keygen-receipt/v1" as const;
export const MPC_SIGNING_RECEIPT_SCHEMA = "agent-shield/mpc-signing-receipt/v1" as const;
export const MPC_RESHARE_RECEIPT_SCHEMA = "agent-shield/mpc-reshare-receipt/v1" as const;

// The three ceremonies of #61 share one state space so that a terminal state means the same
// thing whichever ceremony reached it.
export type MpcState =
  // Key ceremony
  | "UNPROVISIONED"
  | "PROTOCOL_ADMITTED"
  | "PARTICIPANTS_REGISTERED"
  | "DKG_RUNNING"
  | "SHARES_DISTRIBUTED"
  | "PUBLIC_KEY_VERIFIED"
  | "ACTIVE"
  // Signing
  | "REQUEST_VALIDATED"
  | "PARTICIPANTS_AUTHENTICATED"
  | "ROUNDS_RUNNING"
  | "SIGNATURE_ASSEMBLED"
  | "SIGNATURE_VERIFIED"
  // Resharing and recovery
  | "RESHARING_AUTHORIZED"
  | "RESHARING_RUNNING"
  | "NEW_EPOCH_VERIFIED"
  | "OLD_EPOCH_REVOKED"
  // Terminal
  | "ABSENT_PARTICIPANT"
  | "AUTH_REFUSED"
  | "ROUND_MISMATCH"
  | "TIMEOUT"
  | "ABORTED"
  | "INVALID_SHARE"
  | "SIGNATURE_FAILED"
  | "RESHARE_FAILED"
  | "RECOVERY_REQUIRED"
  | "COMPROMISE_SUSPECTED"
  | "FAILED_CLEANUP";

export type MpcOutcome = Extract<MpcState,
  | "ACTIVE"
  | "ABSENT_PARTICIPANT"
  | "AUTH_REFUSED"
  | "ROUND_MISMATCH"
  | "TIMEOUT"
  | "ABORTED"
  | "INVALID_SHARE"
  | "SIGNATURE_FAILED"
  | "RESHARE_FAILED"
  | "RECOVERY_REQUIRED"
  | "COMPROMISE_SUSPECTED"
  | "FAILED_CLEANUP">;

// SEC-TSS-001. Protocol and curve are not independent choices -- a CGGMP21 ceremony on an
// Ed25519 curve is not a configuration, it is a mistake. The admitted pairs are enumerated so
// the mismatch is a rule with one place to live.
export type MpcProtocol = "cggmp21" | "frost-ed25519";
export type MpcCurve = "secp256k1" | "ed25519";

export const ADMITTED_PROTOCOL_CURVES: Readonly<Record<MpcProtocol, MpcCurve>> = {
  cggmp21: "secp256k1",
  "frost-ed25519": "ed25519",
};

export interface MpcLibrarySubject {
  name: string;
  version: string;
  sourceCommit: string;
  artifactSha256: string;
  license: string;
  licenseSha256: string;
  sbomSha256: string;
  noticesSha256: string;
}

// SEC-TSS-001. The audit is admission evidence, not documentation. `null` means unaudited, and
// an unaudited mandatory component is refused rather than noted -- which is the only reading
// of "audited MPC/TSS provider" that does any work.
export interface MpcAudit {
  auditorId: string;
  reportSha256: string;
  reportDate: string;
  scope: "full" | "partial";
  // A partial audit that did not cover the protocol implementation is not an audit of the
  // thing being admitted, however thorough it was about everything else.
  coversProtocolImplementation: boolean;
}

export interface MpcProtocolSubject {
  protocol: MpcProtocol;
  curve: MpcCurve;
  // t-of-n. Both are load-bearing and both are checked against the registered participants.
  threshold: number;
  participants: number;
  library: MpcLibrarySubject;
  audit: MpcAudit | null;
}

export interface MpcParticipant {
  participantId: string;
  // The long-term identity key each participant authenticates its round messages with. A
  // digest only: this provider never holds a participant's private material.
  identityKeySha256: string;
  enrolledAtEpoch: number;
}

// SEC-TSS-004. Every round message is bound to the ceremony, the request, the round, both
// ends and the epoch. Any one of those left unbound is a message that can be replayed into a
// context it was never meant for, so all six are fields rather than conventions.
export interface MpcRoundMessage {
  ceremonyId: string;
  requestId: string;
  round: number;
  senderId: string;
  receiverId: string;
  epoch: number;
  nonce: string;
  payloadSha256: string;
}

// SEC-TSS-002. Vector verification is a fact the transport reports about a real library run,
// not something this provider can conclude on its own.
export interface MpcVectorReport {
  suiteId: string;
  suiteSha256: string;
  dkgVectorsPassed: number;
  signatureVectorsPassed: number;
  failures: number;
  // An independent suite is the point. A vector set shipped by the same library that is being
  // tested proves that the library agrees with itself.
  independentOfLibrary: boolean;
}

export interface MpcSigningRequest {
  requestId: string;
  ceremonyId: string;
  epoch: number;
  // The intent this signature is for. A signature request that is not bound to an intent is a
  // blank cheque, so there is no field for "sign these bytes".
  intentSha256: string;
  challengeSha256: string;
  signerIds: string[];
  messages: MpcRoundMessage[];
}

export interface MpcKeygenRequest {
  ceremonyId: string;
  epoch: number;
  participants: MpcParticipant[];
  // Human authority for the ceremony. #61 keeps ceremony authorisation human-owned, so this
  // is a reference to an approval, never a decision this provider makes.
  humanApprovalRef: string;
  messages: MpcRoundMessage[];
}

export interface MpcReshareRequest {
  ceremonyId: string;
  fromEpoch: number;
  toEpoch: number;
  participants: MpcParticipant[];
  removedParticipantIds: string[];
  humanApprovalRef: string;
  messages: MpcRoundMessage[];
}

export interface MpcPublicKey {
  ceremonyId: string;
  epoch: number;
  curve: MpcCurve;
  publicKeySha256: string;
}

export interface MpcSignature {
  requestId: string;
  epoch: number;
  signatureSha256: string;
  // Which participants actually contributed. The provider checks this against the threshold
  // rather than trusting the transport's own count.
  contributorIds: string[];
}

export interface MpcKeygenReceipt {
  schema: typeof MPC_KEYGEN_RECEIPT_SCHEMA;
  ceremonyId: string;
  epoch: number;
  lifecycle: MpcState[];
  outcome: MpcOutcome;
  publicKeySha256: string | null;
  shareCount: number;
  transcriptCleared: boolean;
  detail: string;
}

export interface MpcSigningReceipt {
  schema: typeof MPC_SIGNING_RECEIPT_SCHEMA;
  requestId: string;
  ceremonyId: string;
  epoch: number;
  lifecycle: MpcState[];
  outcome: MpcOutcome;
  signatureSha256: string | null;
  contributorCount: number;
  transcriptCleared: boolean;
  detail: string;
}

export interface MpcReshareReceipt {
  schema: typeof MPC_RESHARE_RECEIPT_SCHEMA;
  ceremonyId: string;
  fromEpoch: number;
  toEpoch: number;
  lifecycle: MpcState[];
  outcome: MpcOutcome;
  newPublicKeySha256: string | null;
  oldEpochRevoked: boolean;
  transcriptCleared: boolean;
  detail: string;
}

// The audited library, behind a typed boundary. Everything cryptographic happens on the far
// side; everything this repository owns -- admission, thresholds, message binding, epochs,
// abort and cleanup -- happens on this side and is what the selftest exercises.
export interface MpcTransport {
  probe(): { available: boolean; version: string | null; artifactSha256: string | null };
  verifyVectors(): MpcVectorReport | null;
  runDkg(request: MpcKeygenRequest): { publicKey: MpcPublicKey; shares: SealedShare[] } | null;
  // Which participants actually answered this round. A partition shows up here as a short
  // list rather than as a hang.
  respondingParticipants(ceremonyId: string, round: number): string[];
  assembleSignature(request: MpcSigningRequest): MpcSignature | null;
  runReshare(request: MpcReshareRequest): { publicKey: MpcPublicKey; shares: SealedShare[] } | null;
  revokeEpoch(ceremonyId: string, epoch: number): boolean;
  // SEC-TSS-009. What the ceremony left behind.
  retainedTranscripts(): number;
  retainedShareBuffers(): number;
  retainedProcesses(): number;
}
