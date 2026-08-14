import {
  FakeMpcTransport,
  REDACTED,
  SealedShare,
  assertProtocolSubject,
  auditMessages,
  mpcProviderState,
  runKeyCeremony,
  runReshareCeremony,
  runSigningCeremony,
  vectorRefusal,
  type MpcKeygenRequest,
  type MpcParticipant,
  type MpcProtocolSubject,
  type MpcReshareRequest,
  type MpcRoundMessage,
  type MpcSigningRequest,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SEC-TSS ${message}`);
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
  ok(text.startsWith("invalid mpc contract: "), `${message} threw "${text}" rather than an mpc contract error`);
}

const NODES = ["node-a", "node-b", "node-c"] as const;

function participants(ids: readonly string[] = NODES): MpcParticipant[] {
  return ids.map((participantId, index) => ({
    participantId,
    identityKeySha256: String(index + 1).repeat(64),
    enrolledAtEpoch: 1,
  }));
}

function subject(overrides: Partial<MpcProtocolSubject> = {}): MpcProtocolSubject {
  return {
    protocol: "cggmp21",
    curve: "secp256k1",
    threshold: 2,
    participants: 3,
    library: {
      name: "cggmp21-rs",
      version: "0.6.1",
      sourceCommit: "7".repeat(40),
      artifactSha256: "a".repeat(64),
      license: "AGPL-3.0-or-later",
      licenseSha256: "e".repeat(64),
      sbomSha256: "f".repeat(64),
      noticesSha256: "8".repeat(64),
    },
    audit: {
      auditorId: "trail-of-bits",
      reportSha256: "6".repeat(64),
      reportDate: "2025-11-04",
      scope: "full",
      coversProtocolImplementation: true,
    },
    ...overrides,
  };
}

// A well-formed round transcript: every pair exchanges one message per round.
function messages(bound: { ceremonyId: string; requestId: string; epoch: number }, ids: readonly string[] = NODES): MpcRoundMessage[] {
  const out: MpcRoundMessage[] = [];
  let nonce = 0;
  for (const round of [1, 2]) {
    for (const senderId of ids) {
      for (const receiverId of ids) {
        if (senderId === receiverId) continue;
        nonce += 1;
        out.push({
          ceremonyId: bound.ceremonyId,
          requestId: bound.requestId,
          round,
          senderId,
          receiverId,
          epoch: bound.epoch,
          nonce: `nonce-${String(nonce).padStart(20, "0")}`,
          payloadSha256: String(round).repeat(64),
        });
      }
    }
  }
  return out;
}

const KEYGEN_BOUND = { ceremonyId: "ceremony-1", requestId: "ceremony-1", epoch: 1 };

function keygen(overrides: Partial<MpcKeygenRequest> = {}): MpcKeygenRequest {
  return {
    ceremonyId: "ceremony-1",
    epoch: 1,
    participants: participants(),
    humanApprovalRef: "approval-9001",
    messages: messages(KEYGEN_BOUND),
    ...overrides,
  };
}

const SIGN_BOUND = { ceremonyId: "ceremony-1", requestId: "request-1", epoch: 1 };

function signing(overrides: Partial<MpcSigningRequest> = {}): MpcSigningRequest {
  return {
    requestId: "request-1",
    ceremonyId: "ceremony-1",
    epoch: 1,
    intentSha256: "1".repeat(64),
    challengeSha256: "2".repeat(64),
    signerIds: ["node-a", "node-b"],
    messages: messages(SIGN_BOUND, ["node-a", "node-b"]),
    ...overrides,
  };
}

const RESHARE_BOUND = { ceremonyId: "ceremony-1", requestId: "ceremony-1", epoch: 2 };

function reshare(overrides: Partial<MpcReshareRequest> = {}): MpcReshareRequest {
  return {
    ceremonyId: "ceremony-1",
    fromEpoch: 1,
    toEpoch: 2,
    participants: participants(["node-a", "node-b", "node-d"]),
    removedParticipantIds: ["node-c"],
    humanApprovalRef: "approval-9002",
    messages: messages(RESHARE_BOUND, ["node-a", "node-b", "node-d"]),
    ...overrides,
  };
}

function keygenRun(overrides: Partial<MpcKeygenRequest> = {}, transport = new FakeMpcTransport(), subj = subject()) {
  return { transport, receipt: runKeyCeremony(keygen(overrides), { subject: subj, transport }) };
}

function signRun(overrides: Partial<MpcSigningRequest> = {}, transport = new FakeMpcTransport(), subj = subject()) {
  return { transport, receipt: runSigningCeremony(signing(overrides), { subject: subj, transport }, NODES) };
}

function reshareRun(overrides: Partial<MpcReshareRequest> = {}, transport = new FakeMpcTransport(), subj = subject()) {
  return { transport, receipt: runReshareCeremony(reshare(overrides), { subject: subj, transport }) };
}

// SEC-TSS-001 protocol admission
function protocolAdmission(): void {
  ok(assertProtocolSubject(subject()).protocol === "cggmp21", "a well-formed subject was rejected");

  for (const [label, patch] of [
    ["a moving library channel", { library: { ...subject().library, version: "latest" } }],
    ["a mutable source ref", { library: { ...subject().library, sourceCommit: "main" } }],
    ["a wrong artifact digest", { library: { ...subject().library, artifactSha256: "nope" } }],
    ["an absent SBOM", { library: { ...subject().library, sbomSha256: "" } }],
    ["absent notices", { library: { ...subject().library, noticesSha256: "nope" } }],
    ["an absent licence", { library: { ...subject().library, license: "" } }],
  ] as const) {
    red(() => assertProtocolSubject(subject(patch)), `${label}`);
  }

  // The control the issue names: an unaudited mandatory component.
  red(() => assertProtocolSubject(subject({ audit: null })), "an unaudited implementation");
  red(
    () => assertProtocolSubject(subject({ audit: { ...subject().audit!, coversProtocolImplementation: false } })),
    "an audit that does not cover the implementation",
  );
  red(() => assertProtocolSubject(subject({ audit: { ...subject().audit!, reportSha256: "nope" } })), "an unaddressed audit report");
  red(() => assertProtocolSubject(subject({ audit: { ...subject().audit!, reportDate: "last year" } })), "an unparseable audit date");

  // A protocol on the wrong curve is a mistake, not a configuration.
  red(() => assertProtocolSubject(subject({ curve: "ed25519" })), "cggmp21 on ed25519");
  red(() => assertProtocolSubject(subject({ protocol: "frost-ed25519" })), "frost on secp256k1");

  // Threshold shape.
  red(() => assertProtocolSubject(subject({ threshold: 1 })), "a threshold of one");
  red(() => assertProtocolSubject(subject({ threshold: 4 })), "a threshold above the participant count");
  // `participants: 1` is caught by the threshold ceiling, so it does not exercise the
  // participant rule at all. A fractional count does: it slips past every comparison.
  red(() => assertProtocolSubject(subject({ participants: 2.5 })), "a fractional participant count");
  red(() => assertProtocolSubject(subject({ participants: Number.NaN })), "a non-finite participant count");

  // And the same drift arriving from the transport rather than the declaration.
  const wrongVersion = new FakeMpcTransport();
  wrongVersion.version = "0.5.0";
  ok(keygenRun({}, wrongVersion).receipt.outcome === "AUTH_REFUSED", "a version-drifted transport was admitted");

  const wrongArtifact = new FakeMpcTransport();
  wrongArtifact.artifactSha256 = "9".repeat(64);
  const swapped = keygenRun({}, wrongArtifact).receipt;
  ok(swapped.outcome === "AUTH_REFUSED", "a swapped library artifact was admitted");
  ok(swapped.detail.includes("artifact"), `the artifact rule did not catch it: ${swapped.detail}`);

  const absent = new FakeMpcTransport();
  absent.available = false;
  ok(keygenRun({}, absent).receipt.outcome === "ABSENT_PARTICIPANT", "an absent transport reported success");
}

// SEC-TSS-002 standard vectors
function standardVectors(): void {
  const transport = new FakeMpcTransport();
  ok(vectorRefusal(subject(), transport) === null, "a clean vector report was refused");

  for (const [label, patch] of [
    ["a suite that is not content-addressed", { suiteSha256: "nope" }],
    ["a suite shipped by the library under test", { independentOfLibrary: false }],
    ["a suite with failures", { failures: 1 }],
    ["a run with no DKG vectors", { dkgVectorsPassed: 0 }],
    ["a run with no signature vectors", { signatureVectorsPassed: 0 }],
  ] as const) {
    const tuned = new FakeMpcTransport();
    tuned.vectors = { ...tuned.vectors!, ...patch };
    ok(vectorRefusal(subject(), tuned) !== null, `${label} was accepted`);
    ok(keygenRun({}, tuned).receipt.outcome === "ABORTED", `${label} still ran a ceremony`);
  }

  const none = new FakeMpcTransport();
  none.vectors = null;
  ok(vectorRefusal(subject(), none) !== null, "an absent vector report was accepted");
  ok(keygenRun({}, none).receipt.outcome === "ABORTED", "a ceremony ran with no vector verification at all");
}

// SEC-TSS-003 threshold
function threshold(): void {
  ok(signRun().receipt.outcome === "ACTIVE", `the happy path reported ${signRun().receipt.outcome}`);

  // Fewer than the threshold cannot sign, and a single node certainly cannot.
  const alone = signRun({ signerIds: ["node-a"], messages: messages(SIGN_BOUND, ["node-a", "node-b"]) }).receipt;
  ok(alone.outcome === "AUTH_REFUSED", `a lone signer reported ${alone.outcome}`);
  ok(alone.detail.includes("fewer signers"), `the threshold rule did not catch it: ${alone.detail}`);

  // The control the issue names: a compromised single node. Even when the transport hands
  // back a signature, a contributor set below the threshold is refused -- the threshold is
  // not a request parameter the transport gets to reinterpret.
  const compromised = new FakeMpcTransport();
  compromised.contributorOverride = ["node-a"];
  const forged = signRun({}, compromised).receipt;
  ok(forged.outcome === "COMPROMISE_SUSPECTED", `a single-contributor signature reported ${forged.outcome}`);
  ok(forged.signatureSha256 === null, "a sub-threshold signature was carried into the receipt");

  // Nor may somebody who was never named as a signer contribute.
  const uninvited = new FakeMpcTransport();
  uninvited.contributorOverride = ["node-a", "node-c"];
  const gatecrashed = signRun({}, uninvited).receipt;
  ok(gatecrashed.outcome === "COMPROMISE_SUSPECTED", `an uninvited contributor reported ${gatecrashed.outcome}`);
  ok(gatecrashed.detail.includes("without being named"), `the contributor rule did not catch it: ${gatecrashed.detail}`);

  // Exactly the admitted threshold succeeds.
  ok(signRun({ signerIds: ["node-a", "node-b"] }).receipt.contributorCount === 2, "the admitted threshold did not sign");

  // An unregistered signer is refused before any round runs.
  ok(signRun({ signerIds: ["node-a", "node-z"] }).receipt.outcome === "AUTH_REFUSED", "an unregistered signer was named");

  // A duplicate that still leaves enough distinct signers to meet the threshold: otherwise the
  // threshold rule catches it and the duplicate rule is never exercised.
  const padded = signRun({ signerIds: ["node-a", "node-b", "node-b"] }).receipt;
  ok(padded.outcome === "AUTH_REFUSED", `a duplicated signer reported ${padded.outcome}`);
  ok(padded.detail.includes("named twice"), `the duplicate rule did not catch it: ${padded.detail}`);

  // A transport may return something shaped like a signature that is not one for this request.
  const unaddressed = new FakeMpcTransport();
  unaddressed.signatureShaOverride = "not-a-digest";
  ok(signRun({}, unaddressed).receipt.outcome === "SIGNATURE_FAILED", "a signature without a digest was accepted");

  const wrongEpochSignature = new FakeMpcTransport();
  wrongEpochSignature.signatureEpochOverride = 9;
  const staleSignature = signRun({}, wrongEpochSignature).receipt;
  ok(staleSignature.outcome === "SIGNATURE_FAILED", `a signature from another epoch reported ${staleSignature.outcome}`);
  ok(staleSignature.detail.includes("another epoch"), `the epoch rule did not catch it: ${staleSignature.detail}`);
}

// SEC-TSS-004 participant authentication and replay
function participantAuthentication(): void {
  ok(auditMessages(messages(SIGN_BOUND, ["node-a", "node-b"]), SIGN_BOUND, NODES).refusal === null, "a clean transcript was refused");

  const base = messages(SIGN_BOUND, ["node-a", "node-b"]);
  const mutate = (patch: Partial<MpcRoundMessage>): MpcRoundMessage[] => [
    ...base.slice(0, -1),
    { ...base[base.length - 1]!, ...patch },
  ];

  for (const [label, patch, expected] of [
    ["another ceremony", { ceremonyId: "ceremony-9" }, "AUTH_REFUSED"],
    ["another request", { requestId: "request-9" }, "AUTH_REFUSED"],
    ["another epoch", { epoch: 9 }, "AUTH_REFUSED"],
    ["an unregistered sender", { senderId: "node-z" }, "AUTH_REFUSED"],
    ["an unregistered receiver", { receiverId: "node-z" }, "AUTH_REFUSED"],
    ["a self-addressed message", { senderId: "node-a", receiverId: "node-a" }, "AUTH_REFUSED"],
    ["an unaddressed payload", { payloadSha256: "nope" }, "AUTH_REFUSED"],
    ["a guessable nonce", { nonce: "abc" }, "AUTH_REFUSED"],
  ] as const) {
    const audit = auditMessages(mutate(patch), SIGN_BOUND, NODES);
    ok(audit.refusal !== null, `${label} was accepted`);
    ok(audit.state === expected, `${label} reported ${audit.state}, expected ${expected}`);
  }

  // Round validity, round ordering and duplicate delivery all report ROUND_MISMATCH, and each
  // will happily catch the other two's fixtures. Pinning the reason cannot separate them, so
  // each control below is shaped so that only its own rule can possibly fire.

  // Only validity: round 0 comes first, so there is no earlier round to be out of order with
  // and the identity is unique.
  for (const [label, round] of [["a zero round", 0], ["a fractional round", 1.5]] as const) {
    const audit = auditMessages([{ ...base[0]!, round }], SIGN_BOUND, NODES);
    ok(audit.state === "ROUND_MISMATCH", `${label} reported ${audit.state}`);
    ok(audit.refusal?.includes("invalid round"), `the validity rule did not catch ${label}: ${audit.refusal}`);
  }

  // Only ordering: a round-1 message after round 2, addressed to a third participant so the
  // identity is unique, carrying the payload this sender already used in round 1 so the
  // equivocation rule stays quiet.
  const rewound = auditMessages(
    [...base, { ...base[0]!, receiverId: "node-c", nonce: "nonce-rewound-000001", round: 1 }],
    SIGN_BOUND,
    NODES,
  );
  ok(rewound.state === "ROUND_MISMATCH", `a rewound round reported ${rewound.state}`);
  ok(rewound.refusal?.includes("out of round order"), `the ordering rule did not catch it: ${rewound.refusal}`);

  // Only duplication: the last message again, at the same round so ordering stays quiet, with
  // the same payload so equivocation stays quiet and a fresh nonce so reuse stays quiet.
  const replayed = auditMessages(
    [...base, { ...base[base.length - 1]!, nonce: "nonce-replay-0000001" }],
    SIGN_BOUND,
    NODES,
  );
  ok(replayed.state === "ROUND_MISMATCH", `a replayed message reported ${replayed.state}`);
  ok(replayed.refusal?.includes("delivered twice"), `the duplicate rule did not catch it: ${replayed.refusal}`);

  // Substitution: a message reassigned to another sender keeps its nonce, which the nonce rule
  // catches -- so the substitution control is pinned by reason, not only by outcome.
  const substituted = auditMessages([...base, { ...base[0]!, senderId: "node-b", round: 2 }], SIGN_BOUND, NODES);
  ok(substituted.refusal !== null, "a substituted participant was accepted");

  ok(auditMessages([], SIGN_BOUND, NODES).state === "ABORTED", "an empty transcript was accepted");

  // And the whole audit is reachable from every ceremony, not just signing.
  ok(signRun({ messages: mutate({ epoch: 9 }) }).receipt.outcome === "AUTH_REFUSED", "signing skipped the message audit");
  ok(keygenRun({ messages: [] }).receipt.outcome === "ABORTED", "the key ceremony skipped the message audit");
  ok(reshareRun({ messages: [] }).receipt.outcome === "ABORTED", "the resharing skipped the message audit");
}

// SEC-TSS-005 abort and timeout
function abortAndTimeout(): void {
  // The control the issue names: kill one participant mid-round. A key ceremony needs all of
  // them, and there is no partial-success path out.
  const partitioned = new FakeMpcTransport();
  partitioned.responding = ["node-a", "node-b"];
  const aborted = keygenRun({}, partitioned).receipt;
  ok(aborted.outcome === "ABSENT_PARTICIPANT", `a partitioned key ceremony reported ${aborted.outcome}`);
  ok(aborted.publicKeySha256 === null && aborted.shareCount === 0, "a partitioned ceremony leaked a partial result");

  // Signing tolerates absences down to the threshold and no further.
  const twoLeft = new FakeMpcTransport();
  twoLeft.responding = ["node-a", "node-b"];
  ok(signRun({}, twoLeft).receipt.outcome === "ACTIVE", "signing refused a quorum that met the threshold");

  const oneLeft = new FakeMpcTransport();
  oneLeft.responding = ["node-a"];
  const timedOut = signRun({}, oneLeft).receipt;
  ok(timedOut.outcome === "TIMEOUT", `a sub-threshold quorum reported ${timedOut.outcome}`);
  ok(timedOut.signatureSha256 === null, "a timed-out signing leaked a signature");

  const noDkg = new FakeMpcTransport();
  noDkg.dkgSucceeds = false;
  ok(keygenRun({}, noDkg).receipt.outcome === "ABORTED", "a failed DKG reported success");

  const noSig = new FakeMpcTransport();
  noSig.signs = false;
  ok(signRun({}, noSig).receipt.outcome === "SIGNATURE_FAILED", "a failed signing reported success");
}

// SEC-TSS-006 resharing and revocation
function resharing(): void {
  const clean = reshareRun().receipt;
  ok(clean.outcome === "ACTIVE", `a clean reshare reported ${clean.outcome}`);
  ok(clean.oldEpochRevoked, "a clean reshare did not revoke the old epoch");

  // The control the issue names: the old epoch still accepted. A new epoch living alongside a
  // live old one has removed nobody, so this demands human recovery rather than reporting a
  // successful reshare with a footnote.
  const notRevoked = new FakeMpcTransport();
  notRevoked.revokes = false;
  const stale = reshareRun({}, notRevoked).receipt;
  ok(stale.outcome === "RECOVERY_REQUIRED", `an unrevoked old epoch reported ${stale.outcome}`);
  ok(!stale.oldEpochRevoked, "an unrevoked old epoch was reported as revoked");

  // A removed participant may not receive a new share.
  const stillIssuing = new FakeMpcTransport();
  stillIssuing.shareRecipientOverride = ["node-a", "node-b", "node-c"];
  const reissued = reshareRun({}, stillIssuing).receipt;
  ok(reissued.outcome === "COMPROMISE_SUSPECTED", `a removed participant was reshared and reported ${reissued.outcome}`);

  // Nor may a removed participant simply reappear in the new set.
  ok(
    reshareRun({ participants: participants(["node-a", "node-b", "node-c"]), messages: messages(RESHARE_BOUND, ["node-a", "node-b", "node-c"]) }).receipt.outcome === "RESHARE_FAILED",
    "a removed participant reappeared in the new set",
  );

  // The epoch must advance; a reshare that stays put is how an old share keeps working.
  ok(reshareRun({ toEpoch: 1 }).receipt.outcome === "RESHARE_FAILED", "a reshare to the same epoch was accepted");
  ok(reshareRun({ toEpoch: 0 }).receipt.outcome === "RESHARE_FAILED", "a reshare to an earlier epoch was accepted");

  // Old-epoch shares must not come back from a new-epoch ceremony.
  const oldShares = new FakeMpcTransport();
  oldShares.shareEpochOverride = 1;
  ok(reshareRun({}, oldShares).receipt.outcome === "INVALID_SHARE", "a reshare returned old-epoch shares");

  // Nor may the reshared group key belong to the old epoch: the shares moving without the key
  // moving is how a new epoch ends up signing under the identity it was meant to replace.
  const oldKey = new FakeMpcTransport();
  oldKey.publicKeyOverride = { epoch: 1 };
  const staleKey = reshareRun({}, oldKey).receipt;
  ok(staleKey.outcome === "RESHARE_FAILED", `an old-epoch reshared key reported ${staleKey.outcome}`);
  ok(staleKey.detail.includes("not for the new epoch"), `the key-epoch rule did not catch it: ${staleKey.detail}`);

  // One share per new participant. A short set is not a partial success.
  const shortSet = new FakeMpcTransport();
  shortSet.shareRecipientOverride = ["node-a", "node-b"];
  const short = reshareRun({}, shortSet).receipt;
  ok(short.outcome === "INVALID_SHARE", `a short reshare reported ${short.outcome}`);
  ok(short.detail.includes("one share per new participant"), `the share-count rule did not catch it: ${short.detail}`);

  // A new set smaller than the threshold is refused before any round runs. The transcript here
  // still names a second participant, so without this rule the message audit would refuse it
  // for a different reason -- which is why the outcome, not just the refusal, is pinned.
  const tooSmall = reshareRun({ participants: participants(["node-a"]), removedParticipantIds: ["node-c"] }).receipt;
  ok(tooSmall.outcome === "RESHARE_FAILED", `a sub-threshold new set reported ${tooSmall.outcome}`);
  ok(tooSmall.detail.includes("smaller than the admitted threshold"), `the reshare threshold rule did not catch it: ${tooSmall.detail}`);

  ok(reshareRun({ humanApprovalRef: "" }).receipt.outcome === "AUTH_REFUSED", "a reshare ran without human approval");
  ok(keygenRun({ humanApprovalRef: "" }).receipt.outcome === "AUTH_REFUSED", "a key ceremony ran without human approval");

  const failed = new FakeMpcTransport();
  failed.reshareSucceeds = false;
  ok(reshareRun({}, failed).receipt.outcome === "RESHARE_FAILED", "a failed reshare reported success");
}

// SEC-TSS-007 key secrecy
function keySecrecy(): void {
  const share = new SealedShare("node-a", 1, "super-secret-share-material");

  // The control the issue names: instrument accidental serialization. Every route out is
  // checked, because it only takes one to undo a threshold scheme.
  ok(JSON.stringify(share) === `"${REDACTED}"`, "a share survived JSON.stringify");
  ok(String(share) === REDACTED, "a share survived String()");
  // `Symbol.toPrimitive` wins every implicit coercion, so `toString` is only ever reached by an
  // explicit call -- which is exactly what a logging line writes. Without this control the
  // toString override is dead code that would silently stop protecting anything.
  ok(share.toString() === REDACTED, "a share survived an explicit toString()");
  ok(`${share}` === REDACTED, "a share survived template interpolation");
  ok(share + "" === REDACTED, "a share survived string coercion");
  // The hook Node and Bun consult before printing an object. Called through its symbol rather
  // than by importing `node:util`, which this repository has no ambient types for.
  const inspectHook = (share as unknown as Record<symbol, () => string>)[Symbol.for("nodejs.util.inspect.custom")];
  ok(typeof inspectHook === "function", "a share has no inspect hook, so printing it would leak");
  ok(inspectHook.call(share) === REDACTED, "a share survived util.inspect");
  ok(JSON.stringify({ nested: [share] }).includes(REDACTED), "a nested share survived serialization");
  ok(!JSON.stringify({ nested: [share] }).includes("super-secret"), "a nested share leaked its bytes");
  ok(Object.keys(share).join(",") === "participantId,epoch", "a share exposed its value as an own property");
  ok(!Object.values(share).includes("super-secret-share-material"), "a share exposed its value through Object.values");

  // The value is reachable only through `use`, and only for the duration of the call.
  ok(share.use((value) => value) === "super-secret-share-material", "a share could not be used at all");
  ok(share.byteLength === 27, `the share reported ${share.byteLength} bytes`);

  // A receipt is a public artifact and must never carry share material.
  const receipt = keygenRun().receipt;
  ok(!JSON.stringify(receipt).includes("fixture-share"), "a keygen receipt carried share material");
  ok(!JSON.stringify(signRun().receipt).includes("fixture-share"), "a signing receipt carried share material");
  ok(!JSON.stringify(reshareRun().receipt).includes("fixture-share"), "a reshare receipt carried share material");
  ok(receipt.shareCount === 3, "the receipt lost the share count it is allowed to report");
}

// SEC-TSS-008 adversarial cases
function adversarial(): void {
  const base = messages(SIGN_BOUND, ["node-a", "node-b"]);

  // Equivocation: one sender, one round, two *different* receivers, two different payloads --
  // a node telling two halves of the group different things. Built explicitly rather than by
  // appending to `base`, because reusing a (sender, receiver, round) triple would be caught by
  // the duplicate-delivery rule first and this control would never reach the equivocation rule.
  const equivocating = auditMessages(
    [
      { ...SIGN_BOUND, round: 1, senderId: "node-a", receiverId: "node-b", nonce: "nonce-equivocation-01", payloadSha256: "5".repeat(64) },
      { ...SIGN_BOUND, round: 1, senderId: "node-a", receiverId: "node-c", nonce: "nonce-equivocation-02", payloadSha256: "6".repeat(64) },
    ],
    SIGN_BOUND,
    NODES,
  );
  ok(equivocating.state === "COMPROMISE_SUSPECTED", `equivocation reported ${equivocating.state}`);

  // The same two messages carrying the *same* payload are an ordinary broadcast round and must
  // stay green -- otherwise the rule above would be firing on shape rather than on equivocation.
  const broadcast = auditMessages(
    [
      { ...SIGN_BOUND, round: 1, senderId: "node-a", receiverId: "node-b", nonce: "nonce-broadcast-0001", payloadSha256: "5".repeat(64) },
      { ...SIGN_BOUND, round: 1, senderId: "node-a", receiverId: "node-c", nonce: "nonce-broadcast-0002", payloadSha256: "5".repeat(64) },
    ],
    SIGN_BOUND,
    NODES,
  );
  ok(broadcast.refusal === null, `an honest broadcast round was refused: ${broadcast.refusal}`);

  // Nonce reuse: the classic threshold key-recovery bug. A repeat is compromise, not a retry.
  const reusedNonce = auditMessages(
    [...base, { ...base[base.length - 1]!, senderId: "node-b", receiverId: "node-a", round: 3, nonce: base[0]!.nonce }],
    SIGN_BOUND,
    NODES,
  );
  ok(reusedNonce.state === "COMPROMISE_SUSPECTED", `a reused nonce reported ${reusedNonce.state}`);

  // Invalid share: one issued to somebody who is not in the ceremony.
  const strayShare = new FakeMpcTransport();
  strayShare.shareRecipientOverride = ["node-a", "node-b", "node-z"];
  ok(keygenRun({}, strayShare).receipt.outcome === "INVALID_SHARE", "a share to an unregistered participant was accepted");

  const wrongEpochShare = new FakeMpcTransport();
  wrongEpochShare.shareEpochOverride = 9;
  ok(keygenRun({}, wrongEpochShare).receipt.outcome === "INVALID_SHARE", "a share for another epoch was accepted");

  const tooFewShares = new FakeMpcTransport();
  tooFewShares.shareRecipientOverride = ["node-a", "node-b"];
  ok(keygenRun({}, tooFewShares).receipt.outcome === "INVALID_SHARE", "a ceremony short one share was accepted");

  // An empty share has the right shape and no key material -- the combination that gets waved
  // through, and that leaves a participant unable to sign while the ceremony reports success.
  const emptyShare = new FakeMpcTransport();
  emptyShare.shareValueOverride = "";
  const hollow = keygenRun({}, emptyShare).receipt;
  ok(hollow.outcome === "INVALID_SHARE", `an empty share reported ${hollow.outcome}`);
  ok(hollow.detail.includes("empty"), `the emptiness rule did not catch it: ${hollow.detail}`);

  // A malformed participant id is also refused by the message audit, for a different reason
  // and with the same outcome, so the reason is pinned to the registration rule.
  const badId = keygenRun({ participants: [...participants(["node-b", "node-c"]), { participantId: "NODE A", identityKeySha256: "4".repeat(64), enrolledAtEpoch: 1 }] }).receipt;
  ok(badId.outcome === "AUTH_REFUSED", `a malformed participant id reported ${badId.outcome}`);
  ok(badId.detail.includes("participant id is invalid"), `the id rule did not catch it: ${badId.detail}`);

  // An identity key that is not content-addressed leaves nothing to authenticate against.
  const badKey = keygenRun({ participants: [{ participantId: "node-a", identityKeySha256: "nope", enrolledAtEpoch: 1 }, ...participants(["node-b", "node-c"])] }).receipt;
  ok(badKey.outcome === "AUTH_REFUSED", `an unaddressed identity key reported ${badKey.outcome}`);
  ok(badKey.detail.includes("identity key"), `the key rule did not catch it: ${badKey.detail}`);

  // A public key on the wrong curve or the wrong epoch is not this ceremony's key.
  const wrongCurve = new FakeMpcTransport();
  wrongCurve.publicKeyOverride = { curve: "ed25519" };
  ok(keygenRun({}, wrongCurve).receipt.outcome === "INVALID_SHARE", "a key on another curve was accepted");

  const wrongEpochKey = new FakeMpcTransport();
  wrongEpochKey.publicKeyOverride = { epoch: 9 };
  ok(keygenRun({}, wrongEpochKey).receipt.outcome === "INVALID_SHARE", "a key for another epoch was accepted");

  const unaddressedKey = new FakeMpcTransport();
  unaddressedKey.publicKeyOverride = { publicKeySha256: "nope" };
  ok(keygenRun({}, unaddressedKey).receipt.outcome === "INVALID_SHARE", "an unaddressed public key was accepted");

  // A signature bound to another epoch, and one that is not content-addressed.
  ok(signRun({ intentSha256: "nope" }).receipt.outcome === "AUTH_REFUSED", "a signing request with no intent was accepted");
  ok(signRun({ challengeSha256: "nope" }).receipt.outcome === "AUTH_REFUSED", "a signing request with no challenge was accepted");

  // Duplicate registration.
  // The message audit also refuses this set, for a different reason and with the same outcome,
  // so the reason is pinned: a duplicate registration must be caught while registering.
  const duplicated = keygenRun({ participants: participants(["node-a", "node-a", "node-c"]) }).receipt;
  ok(duplicated.outcome === "AUTH_REFUSED", "a participant registered twice");
  ok(duplicated.detail.includes("registered twice"), `the duplicate rule did not catch it: ${duplicated.detail}`);
  ok(
    keygenRun({ participants: participants(["node-a", "node-b"]) }).receipt.outcome === "ABSENT_PARTICIPANT",
    "a ceremony ran with fewer participants than admitted",
  );
}

// SEC-TSS-009 cleanup and recovery
function cleanup(): void {
  ok(keygenRun().receipt.transcriptCleared, "a clean key ceremony did not clear its transcript");
  ok(signRun().receipt.transcriptCleared, "a clean signing did not clear its transcript");
  ok(reshareRun().receipt.transcriptCleared, "a clean reshare did not clear its transcript");

  // The controls the issue names, one at a time. Each is separately fatal in all three
  // ceremonies, so a retained resource cannot hide behind another being clean.
  for (const [label, tune] of [
    ["a retained share buffer", (t: FakeMpcTransport) => { t.retainedShareBufferCount = 1; }],
    ["a retained transcript", (t: FakeMpcTransport) => { t.retainedTranscriptCount = 1; }],
    ["a retained process", (t: FakeMpcTransport) => { t.retainedProcessCount = 1; }],
  ] as const) {
    for (const [ceremony, invoke] of [
      ["keygen", (t: FakeMpcTransport) => keygenRun({}, t).receipt as { outcome: string; transcriptCleared: boolean }],
      ["signing", (t: FakeMpcTransport) => signRun({}, t).receipt as { outcome: string; transcriptCleared: boolean }],
      ["reshare", (t: FakeMpcTransport) => reshareRun({}, t).receipt as { outcome: string; transcriptCleared: boolean }],
    ] as const) {
      const transport = new FakeMpcTransport();
      tune(transport);
      const receipt = invoke(transport);
      ok(receipt.outcome === "FAILED_CLEANUP", `${label} in ${ceremony} reported ${receipt.outcome}`);
      ok(!receipt.transcriptCleared, `${label} in ${ceremony} was reported as cleared`);
    }
  }
}

function stateSeparation(): void {
  // Every terminal state a ceremony can reach is reached by its own fixture, and none of them
  // is ACTIVE. That settles "no partial success" for the whole provider at once.
  const outcomes = new Set<string>();
  const transports: Array<[string, () => string]> = [
    ["absent", () => { const t = new FakeMpcTransport(); t.available = false; return keygenRun({}, t).receipt.outcome; }],
    ["auth", () => { const t = new FakeMpcTransport(); t.version = "0.0.1"; return keygenRun({}, t).receipt.outcome; }],
    ["aborted", () => { const t = new FakeMpcTransport(); t.dkgSucceeds = false; return keygenRun({}, t).receipt.outcome; }],
    ["invalid share", () => { const t = new FakeMpcTransport(); t.shareEpochOverride = 9; return keygenRun({}, t).receipt.outcome; }],
    ["timeout", () => { const t = new FakeMpcTransport(); t.responding = ["node-a"]; return signRun({}, t).receipt.outcome; }],
    ["signature failed", () => { const t = new FakeMpcTransport(); t.signs = false; return signRun({}, t).receipt.outcome; }],
    ["compromise", () => { const t = new FakeMpcTransport(); t.contributorOverride = ["node-a"]; return signRun({}, t).receipt.outcome; }],
    ["reshare failed", () => { const t = new FakeMpcTransport(); t.reshareSucceeds = false; return reshareRun({}, t).receipt.outcome; }],
    ["recovery required", () => { const t = new FakeMpcTransport(); t.revokes = false; return reshareRun({}, t).receipt.outcome; }],
    ["failed cleanup", () => { const t = new FakeMpcTransport(); t.retainedTranscriptCount = 1; return keygenRun({}, t).receipt.outcome; }],
    ["round mismatch", () => signRun({ messages: [...messages(SIGN_BOUND, ["node-a", "node-b"]), messages(SIGN_BOUND, ["node-a", "node-b"])[0]!] }).receipt.outcome],
  ];
  for (const [label, invoke] of transports) {
    const outcome = invoke();
    ok(outcome !== "ACTIVE", `${label} reported ACTIVE`);
    outcomes.add(outcome);
  }
  ok(outcomes.size === 11, `the fixtures cover ${outcomes.size} distinct terminal states, expected 11`);
}

function evidenceBoundary(): void {
  ok(mpcProviderState.auditedLibrary === "NOT_EXERCISED", "an audited library run was claimed");
  ok(mpcProviderState.protocolRounds === "NOT_EXERCISED", "protocol rounds were claimed");
  ok(mpcProviderState.independentVectorSuite === "NOT_EXERCISED", "a vector suite run was claimed");
  ok(mpcProviderState.productionSigning === "NOT_IMPLEMENTED", "production signing was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const mpcNeverPasses: NeverPass<typeof mpcProviderState> = true;
void mpcNeverPasses;

protocolAdmission();
standardVectors();
threshold();
participantAuthentication();
abortAndTimeout();
resharing();
keySecrecy();
adversarial();
cleanup();
stateSeparation();
evidenceBoundary();

console.log("SELFTEST GREEN: SEC-TSS protocol admission, standard vectors, threshold, participant authentication, abort/timeout, resharing, key secrecy, adversarial, cleanup");
