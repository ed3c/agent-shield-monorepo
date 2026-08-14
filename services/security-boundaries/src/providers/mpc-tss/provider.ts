import {
  ADMITTED_PROTOCOL_CURVES,
  MPC_KEYGEN_RECEIPT_SCHEMA,
  MPC_RESHARE_RECEIPT_SCHEMA,
  MPC_SIGNING_RECEIPT_SCHEMA,
  type MpcKeygenReceipt,
  type MpcKeygenRequest,
  type MpcProtocolSubject,
  type MpcReshareReceipt,
  type MpcReshareRequest,
  type MpcRoundMessage,
  type MpcSigningReceipt,
  type MpcSigningRequest,
  type MpcState,
  type MpcTransport,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function fail(message: string): never {
  throw new Error(`invalid mpc contract: ${message}`);
}

// SEC-TSS-001. Exact library, exact protocol, exact curve, exact threshold, and an audit that
// actually covers the implementation. The control the issue names is an unaudited mandatory
// component, and that is refused here rather than recorded as a caveat.
export function assertProtocolSubject(subject: MpcProtocolSubject): MpcProtocolSubject {
  const library = subject.library;
  if (!SAFE_ID.test(library.name)) fail("library.name is invalid");
  if (!SAFE_VERSION.test(library.version)) fail("library.version is invalid");
  if (library.version.toLowerCase() === "latest") fail("library.version must be exact, not a moving channel");
  if (!GIT_OID.test(library.sourceCommit)) fail("library.sourceCommit must be a full 40-hex object ID");
  for (const [name, value] of [
    ["artifactSha256", library.artifactSha256],
    ["licenseSha256", library.licenseSha256],
    ["sbomSha256", library.sbomSha256],
    ["noticesSha256", library.noticesSha256],
  ] as const) {
    if (!SHA_256.test(value)) fail(`library.${name} is invalid`);
  }
  if (library.license.length === 0) fail("library.license is absent");

  if (ADMITTED_PROTOCOL_CURVES[subject.protocol] !== subject.curve) {
    fail(`protocol ${subject.protocol} is not admitted on curve ${subject.curve}`);
  }

  // A fractional or non-finite participant count would slip past the comparison below, so the
  // integer check earns its place. A `participants < 2` check would not: threshold >= 2 and
  // threshold <= participants already imply it, and a rule that cannot fail is one more line
  // a reader has to verify is load-bearing before they can trust the rest.
  if (!Number.isSafeInteger(subject.participants)) fail("participants must be a whole number");
  if (!Number.isSafeInteger(subject.threshold) || subject.threshold < 2) fail("threshold must be at least 2");
  // A threshold of n is not a threshold scheme, and a threshold above n can never be met.
  if (subject.threshold > subject.participants) fail("threshold exceeds the participant count");

  const audit = subject.audit;
  if (audit === null) fail("the protocol implementation is unaudited");
  if (!SAFE_ID.test(audit.auditorId)) fail("audit.auditorId is invalid");
  if (!SHA_256.test(audit.reportSha256)) fail("audit.reportSha256 is invalid");
  if (!ISO_DATE.test(audit.reportDate)) fail("audit.reportDate is invalid");
  if (!audit.coversProtocolImplementation) fail("the audit does not cover the protocol implementation");

  return subject;
}

// SEC-TSS-002. An independent suite that actually passed. A suite shipped by the library under
// test proves only that the library agrees with itself.
export function vectorRefusal(subject: MpcProtocolSubject, transport: MpcTransport): string | null {
  const report = transport.verifyVectors();
  if (report === null) return "the transport reported no vector verification";
  if (!SHA_256.test(report.suiteSha256)) return "the vector suite is not content-addressed";
  if (!report.independentOfLibrary) return "the vector suite is not independent of the library under test";
  if (report.failures > 0) return "the vector suite reported failures";
  if (report.dkgVectorsPassed === 0) return "no DKG vectors were verified";
  if (report.signatureVectorsPassed === 0) return "no signature vectors were verified";
  void subject;
  return null;
}

// SEC-TSS-004 and SEC-TSS-008. One pass over the round messages that establishes binding,
// ordering, replay protection and equivocation at once, because they are all properties of
// the same message set and checking them apart is how one of them ends up unchecked.
export interface MessageAudit {
  refusal: string | null;
  state: MpcState | null;
}

export function auditMessages(
  messages: readonly MpcRoundMessage[],
  bound: { ceremonyId: string; requestId: string; epoch: number },
  knownParticipantIds: readonly string[],
): MessageAudit {
  if (messages.length === 0) return { refusal: "the ceremony carried no round messages", state: "ABORTED" };

  const seen = new Set<string>();
  // Equivocation: one sender, one round, two different payloads. This is the signature of a
  // participant telling two halves of the group different things, and it is not a protocol
  // error -- it is evidence of a compromised node.
  const bySenderRound = new Map<string, string>();
  const nonces = new Set<string>();
  let previousRound = 0;

  for (const message of messages) {
    if (message.ceremonyId !== bound.ceremonyId) return { refusal: "a message is bound to another ceremony", state: "AUTH_REFUSED" };
    if (message.requestId !== bound.requestId) return { refusal: "a message is bound to another request", state: "AUTH_REFUSED" };
    if (message.epoch !== bound.epoch) return { refusal: "a message is bound to another epoch", state: "AUTH_REFUSED" };
    if (!knownParticipantIds.includes(message.senderId)) return { refusal: "a message came from an unregistered participant", state: "AUTH_REFUSED" };
    if (!knownParticipantIds.includes(message.receiverId)) return { refusal: "a message is addressed to an unregistered participant", state: "AUTH_REFUSED" };
    if (message.senderId === message.receiverId) return { refusal: "a participant addressed itself", state: "AUTH_REFUSED" };
    if (!SHA_256.test(message.payloadSha256)) return { refusal: "a message payload is not content-addressed", state: "AUTH_REFUSED" };
    if (message.nonce.length < 16) return { refusal: "a message nonce is too short to be unguessable", state: "AUTH_REFUSED" };

    if (!Number.isSafeInteger(message.round) || message.round < 1) return { refusal: "a message names an invalid round", state: "ROUND_MISMATCH" };
    // Rounds may repeat within a round but never go backwards: a reordered transcript is a
    // replay attempt wearing the shape of a late delivery.
    if (message.round < previousRound) return { refusal: "the messages are out of round order", state: "ROUND_MISMATCH" };
    previousRound = message.round;

    const identity = `${message.senderId}|${message.receiverId}|${message.round}`;
    if (seen.has(identity)) return { refusal: "a message was delivered twice", state: "ROUND_MISMATCH" };
    seen.add(identity);

    const senderRound = `${message.senderId}|${message.round}`;
    const previousPayload = bySenderRound.get(senderRound);
    if (previousPayload !== undefined && previousPayload !== message.payloadSha256) {
      return { refusal: "a participant sent two different payloads in one round", state: "COMPROMISE_SUSPECTED" };
    }
    bySenderRound.set(senderRound, message.payloadSha256);

    // Nonce reuse across a ceremony is the classic threshold-signature key-recovery bug, so a
    // repeat is treated as compromise rather than as a retry.
    if (nonces.has(message.nonce)) return { refusal: "a nonce was reused", state: "COMPROMISE_SUSPECTED" };
    nonces.add(message.nonce);
  }

  return { refusal: null, state: null };
}

export interface MpcOptions {
  subject: MpcProtocolSubject;
  transport: MpcTransport;
}

function cleanupRefusal(transport: MpcTransport): string | null {
  if (transport.retainedShareBuffers() > 0) return "a share buffer was retained after the ceremony";
  if (transport.retainedTranscripts() > 0) return "a transcript was retained after the ceremony";
  if (transport.retainedProcesses() > 0) return "a participant process was retained after the ceremony";
  return null;
}

// ---------------------------------------------------------------------------- key ceremony

export function runKeyCeremony(request: MpcKeygenRequest, options: MpcOptions): MpcKeygenReceipt {
  const lifecycle: MpcState[] = ["UNPROVISIONED"];
  const settle = (outcome: MpcState, detail: string, extra: Partial<MpcKeygenReceipt> = {}): MpcKeygenReceipt => ({
    schema: MPC_KEYGEN_RECEIPT_SCHEMA,
    ceremonyId: request.ceremonyId,
    epoch: request.epoch,
    lifecycle: [...lifecycle, outcome],
    outcome: outcome as MpcKeygenReceipt["outcome"],
    publicKeySha256: null,
    shareCount: 0,
    transcriptCleared: false,
    detail,
    ...extra,
  });

  const probe = options.transport.probe();
  if (!probe.available) return settle("ABSENT_PARTICIPANT", "the MPC transport is absent");
  if (probe.version !== options.subject.library.version) {
    return settle("AUTH_REFUSED", "the transport is not the admitted library version");
  }
  if (probe.artifactSha256 !== options.subject.library.artifactSha256) {
    return settle("AUTH_REFUSED", "the transport is not the admitted library artifact");
  }
  const vectors = vectorRefusal(options.subject, options.transport);
  if (vectors !== null) return settle("ABORTED", vectors);
  lifecycle.push("PROTOCOL_ADMITTED");

  if (request.humanApprovalRef.length === 0) return settle("AUTH_REFUSED", "the ceremony carries no human approval reference");
  if (request.participants.length !== options.subject.participants) {
    return settle("ABSENT_PARTICIPANT", "the registered participant count does not match the admitted subject");
  }
  const ids = request.participants.map((participant) => participant.participantId);
  if (new Set(ids).size !== ids.length) return settle("AUTH_REFUSED", "a participant was registered twice");
  for (const participant of request.participants) {
    if (!SAFE_ID.test(participant.participantId)) return settle("AUTH_REFUSED", "a participant id is invalid");
    if (!SHA_256.test(participant.identityKeySha256)) return settle("AUTH_REFUSED", "a participant identity key is not content-addressed");
  }
  lifecycle.push("PARTICIPANTS_REGISTERED");

  const audit = auditMessages(request.messages, { ceremonyId: request.ceremonyId, requestId: request.ceremonyId, epoch: request.epoch }, ids);
  if (audit.refusal !== null) return settle(audit.state ?? "ABORTED", audit.refusal);
  lifecycle.push("DKG_RUNNING");

  // SEC-TSS-005. A partition shows up as a short responder list. Aborting is the safe move and
  // there is no partial-success path out of here.
  const responding = options.transport.respondingParticipants(request.ceremonyId, 1);
  if (responding.length < options.subject.participants) {
    return settle("ABSENT_PARTICIPANT", "a key ceremony requires every participant, and one did not respond");
  }

  const result = options.transport.runDkg(request);
  if (result === null) return settle("ABORTED", "the distributed key generation did not complete");
  if (result.shares.length !== options.subject.participants) {
    return settle("INVALID_SHARE", "the ceremony did not produce one share per participant");
  }
  for (const share of result.shares) {
    if (!ids.includes(share.participantId)) return settle("INVALID_SHARE", "a share was issued to an unregistered participant");
    if (share.epoch !== request.epoch) return settle("INVALID_SHARE", "a share was issued for another epoch");
    if (share.byteLength === 0) return settle("INVALID_SHARE", "a share is empty");
  }
  lifecycle.push("SHARES_DISTRIBUTED");

  if (!SHA_256.test(result.publicKey.publicKeySha256)) return settle("INVALID_SHARE", "the group public key is not content-addressed");
  if (result.publicKey.curve !== options.subject.curve) return settle("INVALID_SHARE", "the group public key is on another curve");
  if (result.publicKey.epoch !== request.epoch) return settle("INVALID_SHARE", "the group public key is for another epoch");
  lifecycle.push("PUBLIC_KEY_VERIFIED");

  const dirty = cleanupRefusal(options.transport);
  if (dirty !== null) return settle("FAILED_CLEANUP", dirty, { publicKeySha256: result.publicKey.publicKeySha256, shareCount: result.shares.length });

  return settle("ACTIVE", "the key ceremony completed and the group public key was verified", {
    publicKeySha256: result.publicKey.publicKeySha256,
    shareCount: result.shares.length,
    transcriptCleared: true,
  });
}

// -------------------------------------------------------------------------------- signing

export function runSigningCeremony(request: MpcSigningRequest, options: MpcOptions, registeredIds: readonly string[]): MpcSigningReceipt {
  const lifecycle: MpcState[] = ["ACTIVE"];
  const settle = (outcome: MpcState, detail: string, extra: Partial<MpcSigningReceipt> = {}): MpcSigningReceipt => ({
    schema: MPC_SIGNING_RECEIPT_SCHEMA,
    requestId: request.requestId,
    ceremonyId: request.ceremonyId,
    epoch: request.epoch,
    lifecycle: [...lifecycle, outcome],
    outcome: outcome as MpcSigningReceipt["outcome"],
    signatureSha256: null,
    contributorCount: 0,
    transcriptCleared: false,
    detail,
    ...extra,
  });

  if (!SHA_256.test(request.intentSha256)) return settle("AUTH_REFUSED", "the request is not bound to an intent");
  if (!SHA_256.test(request.challengeSha256)) return settle("AUTH_REFUSED", "the request is not bound to a challenge");

  // SEC-TSS-003. Fewer than the threshold cannot sign. This is checked on the requested set
  // before any round runs, and again on who actually contributed afterwards -- a signature
  // that arrives with too few contributors is refused even if the transport produced one.
  const signers = new Set(request.signerIds);
  if (signers.size !== request.signerIds.length) return settle("AUTH_REFUSED", "a signer was named twice");
  for (const signerId of request.signerIds) {
    if (!registeredIds.includes(signerId)) return settle("AUTH_REFUSED", "an unregistered participant was named as a signer");
  }
  if (signers.size < options.subject.threshold) {
    return settle("AUTH_REFUSED", "fewer signers than the admitted threshold were named");
  }
  lifecycle.push("REQUEST_VALIDATED");

  const audit = auditMessages(request.messages, { ceremonyId: request.ceremonyId, requestId: request.requestId, epoch: request.epoch }, registeredIds);
  if (audit.refusal !== null) return settle(audit.state ?? "ABORTED", audit.refusal);
  lifecycle.push("PARTICIPANTS_AUTHENTICATED");

  const responding = options.transport.respondingParticipants(request.ceremonyId, 1);
  if (responding.length < options.subject.threshold) {
    return settle("TIMEOUT", "fewer participants responded than the admitted threshold");
  }
  lifecycle.push("ROUNDS_RUNNING");

  const signature = options.transport.assembleSignature(request);
  if (signature === null) return settle("SIGNATURE_FAILED", "the signing rounds did not assemble a signature");
  lifecycle.push("SIGNATURE_ASSEMBLED");

  if (!SHA_256.test(signature.signatureSha256)) return settle("SIGNATURE_FAILED", "the signature is not content-addressed");
  if (signature.epoch !== request.epoch) return settle("SIGNATURE_FAILED", "the signature is for another epoch");
  // The transport's own contributor list is checked rather than trusted: a compromised or
  // buggy transport claiming a signature from one node is exactly what the threshold exists
  // to make useless.
  const contributors = new Set(signature.contributorIds);
  if (contributors.size < options.subject.threshold) {
    return settle("COMPROMISE_SUSPECTED", "a signature was assembled from fewer contributors than the threshold");
  }
  for (const contributorId of contributors) {
    if (!signers.has(contributorId)) return settle("COMPROMISE_SUSPECTED", "a participant contributed without being named as a signer");
  }
  lifecycle.push("SIGNATURE_VERIFIED");

  const dirty = cleanupRefusal(options.transport);
  if (dirty !== null) return settle("FAILED_CLEANUP", dirty, { signatureSha256: signature.signatureSha256, contributorCount: contributors.size });

  return settle("ACTIVE", "the signature was assembled and verified within the admitted threshold", {
    signatureSha256: signature.signatureSha256,
    contributorCount: contributors.size,
    transcriptCleared: true,
  });
}

// ------------------------------------------------------------------ resharing and recovery

export function runReshareCeremony(request: MpcReshareRequest, options: MpcOptions): MpcReshareReceipt {
  const lifecycle: MpcState[] = ["ACTIVE"];
  const settle = (outcome: MpcState, detail: string, extra: Partial<MpcReshareReceipt> = {}): MpcReshareReceipt => ({
    schema: MPC_RESHARE_RECEIPT_SCHEMA,
    ceremonyId: request.ceremonyId,
    fromEpoch: request.fromEpoch,
    toEpoch: request.toEpoch,
    lifecycle: [...lifecycle, outcome],
    outcome: outcome as MpcReshareReceipt["outcome"],
    newPublicKeySha256: null,
    oldEpochRevoked: false,
    transcriptCleared: false,
    detail,
    ...extra,
  });

  if (request.humanApprovalRef.length === 0) return settle("AUTH_REFUSED", "the resharing carries no human approval reference");
  // An epoch that does not advance is how an "old epoch accepted" bug is spelled.
  if (!Number.isSafeInteger(request.toEpoch) || request.toEpoch <= request.fromEpoch) {
    return settle("RESHARE_FAILED", "the new epoch does not advance past the old one");
  }
  if (request.participants.length < options.subject.threshold) {
    return settle("RESHARE_FAILED", "the new participant set is smaller than the admitted threshold");
  }
  const ids = request.participants.map((participant) => participant.participantId);
  for (const removedId of request.removedParticipantIds) {
    if (ids.includes(removedId)) return settle("RESHARE_FAILED", "a removed participant is still in the new set");
  }
  lifecycle.push("RESHARING_AUTHORIZED");

  const audit = auditMessages(request.messages, { ceremonyId: request.ceremonyId, requestId: request.ceremonyId, epoch: request.toEpoch }, ids);
  if (audit.refusal !== null) return settle(audit.state ?? "ABORTED", audit.refusal);
  lifecycle.push("RESHARING_RUNNING");

  const result = options.transport.runReshare(request);
  if (result === null) return settle("RESHARE_FAILED", "the resharing did not complete");
  if (result.publicKey.epoch !== request.toEpoch) return settle("RESHARE_FAILED", "the reshared key is not for the new epoch");
  if (result.shares.length !== request.participants.length) {
    return settle("INVALID_SHARE", "the resharing did not produce one share per new participant");
  }
  for (const share of result.shares) {
    if (share.epoch !== request.toEpoch) return settle("INVALID_SHARE", "a reshared share carries the old epoch");
    if (request.removedParticipantIds.includes(share.participantId)) {
      return settle("COMPROMISE_SUSPECTED", "a removed participant was issued a new share");
    }
  }
  lifecycle.push("NEW_EPOCH_VERIFIED");

  // SEC-TSS-006. Revocation is the whole point of resharing. A new epoch that exists alongside
  // a live old one has not removed anybody, so a failed revocation demands human recovery
  // rather than being reported as a successful reshare.
  if (!options.transport.revokeEpoch(request.ceremonyId, request.fromEpoch)) {
    return settle("RECOVERY_REQUIRED", "the old epoch could not be revoked and remains able to sign", {
      newPublicKeySha256: result.publicKey.publicKeySha256,
    });
  }
  lifecycle.push("OLD_EPOCH_REVOKED");

  const dirty = cleanupRefusal(options.transport);
  if (dirty !== null) {
    return settle("FAILED_CLEANUP", dirty, { newPublicKeySha256: result.publicKey.publicKeySha256, oldEpochRevoked: true });
  }

  return settle("ACTIVE", "the new epoch is active and the old epoch was revoked", {
    newPublicKeySha256: result.publicKey.publicKeySha256,
    oldEpochRevoked: true,
    transcriptCleared: true,
  });
}
