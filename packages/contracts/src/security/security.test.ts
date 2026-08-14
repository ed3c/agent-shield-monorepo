import {
  SECURITY_CHALLENGE_SCHEMA,
  SECURITY_SETTLEMENT_RECEIPT_SCHEMA,
  SETTLEMENT_INTENT_SCHEMA,
  admitSecurityHardwareEvidence,
  assertSecurityReceiptMatchesIntent,
  assertSecurityRouteForTier,
  assertSecurityTransition,
  intentAmountMinor,
  securityEvidenceForOutcome,
  settlementIntentDigest,
  validateSecurityChallenge,
  validateSecurityClaim,
  validateSecurityHardwareEvidence,
  validateSecurityOpaqueRef,
  validateSecurityProviderReceipts,
  validateSecurityRevocation,
  validateSecurityRiskDecision,
  validateSecuritySettlementReceipt,
  validateSettlementIntent,
  type SecurityOutcome,
  type SecurityState,
  type SettlementIntent,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SEC-FND ${message}`);
}

// A control that only asserts "something threw" also passes when a later line throws a
// TypeError for an unrelated reason, which makes a dead guard look load-bearing under a plant
// check. Every control must fail through this family's own contract error.
function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid security contract: "), `${message} threw "${text}" rather than a security contract error`);
}

const ISSUED = 1_700_000_000_000;
const EXPIRES = ISSUED + 600_000;
const NOW = ISSUED + 1_000;
const NONCE = "a".repeat(64);
const DEVICE = { kind: "device", id: "owner-iphone", sha256: "b".repeat(64) };
const KEY = { kind: "key", id: "mpc-share-ref", sha256: "c".repeat(64) };

function intentValue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: SETTLEMENT_INTENT_SCHEMA,
    intentId: "sec-fixture",
    actorKind: "human",
    actorId: "owner",
    target: "vendor.settlement",
    amountMinor: "1000",
    currency: "USDC",
    purpose: "fixture settlement",
    evidenceRefs: ["evidence-1", "evidence-2"],
    policyEpoch: 4,
    issuedAtEpochMs: ISSUED,
    expiresAtEpochMs: EXPIRES,
    ...overrides,
  };
}

function challengeValue(intent: SettlementIntent, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: SECURITY_CHALLENGE_SCHEMA,
    nonce: NONCE,
    intentDigest: settlementIntentDigest(intent),
    policyEpoch: intent.policyEpoch,
    audience: "agent-shield.settlement",
    subjects: [{ ...DEVICE }],
    issuedAtEpochMs: ISSUED,
    expiresAtEpochMs: ISSUED + 120_000,
    ...overrides,
  };
}

function evidenceValue(intent: SettlementIntent, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    challengeNonce: NONCE,
    intentDigest: settlementIntentDigest(intent),
    policyEpoch: intent.policyEpoch,
    subject: { ...DEVICE },
    attestationSha256: "d".repeat(64),
    detail: "fixture attestation only; no Secure Enclave or CoreNFC receipt",
    ...overrides,
  };
}

const LOW_ROUTE: SecurityState[] = ["DRAFT", "INTENT_VALIDATED", "RISK_EVALUATED", "ROUTED", "SESSION_AUTHORIZED", "OPERATION_PREPARED", "SUBMISSION_PENDING"];
const HIGH_ROUTE: SecurityState[] = ["DRAFT", "INTENT_VALIDATED", "RISK_EVALUATED", "ROUTED", "CHALLENGE_ISSUED", "WAITING_FOR_HARDWARE", "EVIDENCE_VERIFIED", "SIGNING_AUTHORIZED", "OPERATION_PREPARED", "SUBMISSION_PENDING"];

function receiptValue(intent: SettlementIntent, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: SECURITY_SETTLEMENT_RECEIPT_SCHEMA,
    intentId: intent.intentId,
    intentDigest: settlementIntentDigest(intent),
    policyEpoch: intent.policyEpoch,
    tier: "low",
    lifecycle: [...LOW_ROUTE],
    outcome: "SUBMISSION_PENDING",
    state: "NOT_EXERCISED",
    providerReceipts: [
      {
        kind: "policy", providerId: "opa", providerVersion: "0.1.0", subject: null,
        implementation: "NOT_IMPLEMENTED", state: "NOT_IMPLEMENTED", auditRef: null,
        detail: "no policy provider is bound",
      },
    ],
    humanAdmit: { required: false, granted: false, approverId: null },
    claims: [],
    exclusions: ["chain", "custody", "hardware", "production"],
    detail: "deterministic fixture only; no policy, custody, ledger or chain evidence",
    ...overrides,
  };
}

// SEC-FND-001 canonical intent
function canonicalIntent(): void {
  const intent = validateSettlementIntent(intentValue());
  ok(intentAmountMinor(intent) === 1000n, "minor amount lost precision");
  ok(intent.evidenceRefs.join(" ") === "evidence-1 evidence-2", "evidence refs were not canonicalized");
  ok(
    settlementIntentDigest(intent) === settlementIntentDigest(validateSettlementIntent(intentValue({ evidenceRefs: ["evidence-2", "evidence-1"] }))),
    "reordered evidence changed the intent digest",
  );

  for (const [label, overrides] of [
    ["duplicate evidence", { evidenceRefs: ["evidence-1", "evidence-1"] }],
    ["missing evidence", { evidenceRefs: [] }],
    ["zero amount", { amountMinor: "0" }],
    ["float amount", { amountMinor: "10.5" }],
    ["negative amount", { amountMinor: "-5" }],
    ["ambiguous currency", { currency: "us dollars" }],
    ["expiry before issue", { expiresAtEpochMs: ISSUED - 1 }],
    ["unbounded validity", { expiresAtEpochMs: ISSUED + 86_400_000 }],
  ] as const) {
    red(() => validateSettlementIntent(intentValue(overrides)), label);
  }
}

// SEC-FND-002 transition legality
function transitionLegality(): void {
  const intent = validateSettlementIntent(intentValue());
  ok(validateSecuritySettlementReceipt(receiptValue(intent)).outcome === "SUBMISSION_PENDING", "low-risk route failed");

  red(
    () => validateSecuritySettlementReceipt(receiptValue(intent, { lifecycle: ["DRAFT", "SIGNING_AUTHORIZED", "OPERATION_PREPARED", "SUBMISSION_PENDING"] })),
    "jump from DRAFT to authorized",
  );
  // Enforced by the transition table, not by a separate tier guard: CHALLENGE_ISSUED cannot
  // reach SIGNING_AUTHORIZED without EVIDENCE_VERIFIED. An exhaustive walk of the declared
  // transitions finds no legal high-risk path to SUBMISSION_PENDING that skips either state,
  // which is why assertSecurityRouteForTier does not re-check it.
  red(
    () => assertSecurityTransition("CHALLENGE_ISSUED", "SIGNING_AUTHORIZED"),
    "signing authorized straight from a challenge",
  );
  red(
    () => validateSecuritySettlementReceipt(receiptValue(intent, {
      lifecycle: ["DRAFT", "INTENT_VALIDATED", "RISK_EVALUATED", "ROUTED", "CHALLENGE_ISSUED", "SIGNING_AUTHORIZED", "OPERATION_PREPARED", "SUBMISSION_PENDING"],
      tier: "high",
      humanAdmit: { required: true, granted: true, approverId: "owner" },
    })),
    "high-risk submission skipping verified evidence",
  );
  red(() => assertSecurityRouteForTier(LOW_ROUTE, "high"), "high-risk intent skipping the challenge");
  red(() => assertSecurityRouteForTier(HIGH_ROUTE, "low"), "low-risk intent claiming the hardware route");
  // Two different rules, so both need their own control. A terminal outcome has an empty
  // transition set, which the transition walk catches; a resumable outcome is legal to pass
  // through, and only the past-outcome rule separates WAITING_* from the rest.
  red(
    () => validateSecuritySettlementReceipt(receiptValue(intent, { lifecycle: [...LOW_ROUTE, "DENIED"] })),
    "transition out of a terminal outcome",
  );
  const recovery: SecurityState[] = ["DRAFT", "INTENT_VALIDATED", "RISK_EVALUATED", "ROUTED", "SESSION_AUTHORIZED", "WAITING_FOR_HUMAN", "FAILED_RECOVERY"];
  ok(
    validateSecuritySettlementReceipt(receiptValue(intent, {
      lifecycle: recovery, outcome: "FAILED_RECOVERY", state: "FAIL",
      humanAdmit: { required: true, granted: false, approverId: null },
    })).outcome === "FAILED_RECOVERY",
    "human recovery route was rejected",
  );
  red(
    () => validateSecuritySettlementReceipt(receiptValue(intent, {
      lifecycle: ["DRAFT", "INTENT_VALIDATED", "RISK_EVALUATED", "ROUTED", "SESSION_AUTHORIZED", "WAITING_FOR_HUMAN", "OPERATION_PREPARED", "SUBMISSION_PENDING"],
      humanAdmit: { required: true, granted: false, approverId: null },
    })),
    "resuming from WAITING_FOR_HUMAN without granted admit",
  );
}

// SEC-FND-003 challenge binding
function challengeBinding(): void {
  const intent = validateSettlementIntent(intentValue());
  const challenge = validateSecurityChallenge(challengeValue(intent), intent);
  const evidence = validateSecurityHardwareEvidence(evidenceValue(intent));
  admitSecurityHardwareEvidence(evidence, challenge, [], NOW);

  const other = validateSettlementIntent(intentValue({ intentId: "sec-other" }));
  for (const [label, overrides] of [
    ["mismatched intent digest", { intentDigest: settlementIntentDigest(other) }],
    ["drifted policy epoch", { policyEpoch: 5 }],
    ["unbounded challenge window", { expiresAtEpochMs: ISSUED + 3_600_000 }],
    ["duplicate subjects", { subjects: [{ ...DEVICE }, { ...DEVICE }] }],
    ["no subject", { subjects: [] }],
  ] as const) {
    red(() => validateSecurityChallenge(challengeValue(intent, overrides), intent), label);
  }

  // The intent must expire sooner than the maximum challenge window, or the window check
  // fires first and the outlives-its-intent rule is never reached.
  const shortIntent = validateSettlementIntent(intentValue({ expiresAtEpochMs: ISSUED + 60_000 }));
  validateSecurityChallenge(challengeValue(shortIntent, { expiresAtEpochMs: ISSUED + 60_000 }), shortIntent);
  red(
    () => validateSecurityChallenge(challengeValue(shortIntent, { expiresAtEpochMs: ISSUED + 60_001 }), shortIntent),
    "challenge outliving its intent",
  );

  // SEC-FND-003 for the risk decision, which binds the same digest and epoch.
  const decisionValue = {
    intentDigest: settlementIntentDigest(intent), policyEpoch: intent.policyEpoch, tier: "low",
    humanAdmitRequired: false, reasonCodes: ["within-limit"], detail: "within the deterministic limit",
  };
  ok(validateSecurityRiskDecision(decisionValue, intent).tier === "low", "matching risk decision was rejected");
  red(() => validateSecurityRiskDecision({ ...decisionValue, intentDigest: settlementIntentDigest(other) }, intent), "risk decision bound to another intent");
  red(() => validateSecurityRiskDecision({ ...decisionValue, policyEpoch: 5 }, intent), "risk decision on a drifted policy epoch");

  red(() => admitSecurityHardwareEvidence(validateSecurityHardwareEvidence(evidenceValue(intent, { challengeNonce: "e".repeat(64) })), challenge, [], NOW), "replayed nonce");
  red(() => admitSecurityHardwareEvidence(evidence, challenge, [], challenge.expiresAtEpochMs), "stale evidence at expiry");
  red(() => admitSecurityHardwareEvidence(evidence, challenge, [], ISSUED - 1), "evidence predating its challenge");
  red(
    () => admitSecurityHardwareEvidence(validateSecurityHardwareEvidence(evidenceValue(intent, { subject: { ...KEY } })), challenge, [], NOW),
    "evidence from an unnamed subject",
  );
}

// SEC-FND-004 provider separation
function providerSeparation(): void {
  const receipts = validateSecurityProviderReceipts([
    { kind: "policy", providerId: "opa", providerVersion: "0.1.0", subject: null, implementation: "NOT_IMPLEMENTED", state: "NOT_IMPLEMENTED", auditRef: null, detail: "unbound" },
    { kind: "hardware", providerId: "secure-enclave", providerVersion: "0.1.0", subject: { ...DEVICE }, implementation: "NOT_IMPLEMENTED", state: "NOT_IMPLEMENTED", auditRef: null, detail: "unbound" },
  ]);
  ok(receipts.length === 2, "distinct provider receipts were rejected");

  red(
    () => validateSecurityProviderReceipts([
      { kind: "policy", providerId: "opa", providerVersion: "0.1.0", subject: null, implementation: "NOT_IMPLEMENTED", state: "NOT_IMPLEMENTED", auditRef: null, detail: "unbound" },
      { kind: "policy", providerId: "opa-2", providerVersion: "0.1.0", subject: null, implementation: "NOT_IMPLEMENTED", state: "NOT_IMPLEMENTED", auditRef: null, detail: "unbound" },
    ]),
    "one provider receipt proxying another of the same kind",
  );
  red(
    () => validateSecurityProviderReceipts([
      { kind: "crypto", providerId: "mpc", providerVersion: "0.1.0", subject: { ...KEY }, implementation: "IMPLEMENTED", state: "PASS", auditRef: null, detail: "self-declared" },
    ]),
    "audited capability claiming PASS without an audit reference",
  );
  red(
    () => validateSecurityProviderReceipts([
      { kind: "ledger", providerId: "immudb", providerVersion: "0.1.0", subject: null, implementation: "NOT_IMPLEMENTED", state: "PASS", auditRef: "audit-1", detail: "overclaimed" },
    ]),
    "unimplemented provider reporting PASS",
  );
}

// SEC-FND-005 secret-free contracts
//
// The property under test is that every object in this family is closed, so no secret can be
// carried anywhere -- not that a list of secret-sounding names is refused. A denylist would
// be dominated by exactKeys and would fail this file's plant check.
function secretFreeContracts(): void {
  for (const [label, overrides] of [
    ["private key", { privateKey: "0xdeadbeef" }],
    ["shard", { shard: "share-1-of-3" }],
    ["NFC payload", { nfcPayload: "04a2b3" }],
    ["token", { token: "eyJhbGciOi" }],
    ["session bytes", { session: "sid=abc" }],
    ["mnemonic", { mnemonic: "correct horse battery staple" }],
    ["an innocuous extra field", { note: "harmless" }],
  ] as const) {
    red(() => validateSettlementIntent(intentValue(overrides)), `raw ${label}`);
  }
  red(
    () => validateSecurityRevocation({ subject: { ...DEVICE, secret: "x" }, revokedFromEpoch: 5, reason: "lost device" }),
    "extra field inside an opaque ref",
  );
  red(
    () => validateSecurityChallenge(challengeValue(validateSettlementIntent(intentValue()), { keyMaterial: "0x00" }), validateSettlementIntent(intentValue())),
    "extra field on a challenge",
  );

  // An opaque ref is exactly kind/id/sha256, so there is no field for key or device bytes to
  // travel in even when the caller controls every value.
  const ref = validateSecurityOpaqueRef({ ...KEY });
  ok(Object.keys(ref).sort().join(",") === "id,kind,sha256", "an opaque ref grew a field that could carry material");
}

// SEC-FND-006 revocation and recovery
function revocationAndRecovery(): void {
  const intent = validateSettlementIntent(intentValue());
  const challenge = validateSecurityChallenge(challengeValue(intent), intent);
  const evidence = validateSecurityHardwareEvidence(evidenceValue(intent));
  const revocation = validateSecurityRevocation({ subject: { ...DEVICE }, revokedFromEpoch: 5, reason: "device reported lost" });

  red(() => admitSecurityHardwareEvidence(evidence, challenge, [revocation], NOW), "pre-revocation evidence reuse");

  const laterIntent = validateSettlementIntent(intentValue({ policyEpoch: 6 }));
  const laterChallenge = validateSecurityChallenge(challengeValue(laterIntent), laterIntent);
  const laterEvidence = validateSecurityHardwareEvidence(evidenceValue(laterIntent));
  admitSecurityHardwareEvidence(laterEvidence, laterChallenge, [revocation], NOW);

  const unrelated = validateSecurityRevocation({ subject: { ...KEY }, revokedFromEpoch: 9, reason: "key rotated" });
  admitSecurityHardwareEvidence(evidence, challenge, [unrelated], NOW);
}

// SEC-FND-007 evidence honesty
function evidenceHonesty(): void {
  for (const [outcome, evidence] of [
    ["SUBMISSION_PENDING", "NOT_EXERCISED"],
    ["WAITING_FOR_HUMAN", "NOT_EXERCISED"],
    ["WAITING_FOR_HARDWARE", "NOT_EXERCISED"],
    ["ABSENT_PROVIDER", "ABSENT"],
    ["NOT_IMPLEMENTED", "NOT_IMPLEMENTED"],
    ["DENIED", "FAIL"],
    ["REVOKED", "FAIL"],
    ["FAILED_SIGNING", "FAIL"],
  ] as const) {
    ok(securityEvidenceForOutcome(outcome as SecurityOutcome) === evidence, `${outcome} projected as the wrong evidence state`);
  }
  // The strongest state this family can reach is NOT_EXERCISED: a deterministic schema pass
  // is not an audit, a native provider or a production result.
  ok(
    (["SUBMISSION_PENDING", "WAITING_FOR_HUMAN", "WAITING_FOR_HARDWARE", "NOT_EXERCISED"] as const)
      .every((outcome) => securityEvidenceForOutcome(outcome) !== "PASS"),
    "a deterministic contract projected PASS",
  );

  const intent = validateSettlementIntent(intentValue());
  red(() => validateSecuritySettlementReceipt(receiptValue(intent, { state: "PASS" })), "receipt asserting its own PASS");
  red(
    () => validateSecuritySettlementReceipt(receiptValue(intent, {
      tier: "high", lifecycle: [...HIGH_ROUTE], humanAdmit: { required: true, granted: false, approverId: null },
    })),
    "submission while Human Admit is still pending",
  );
  red(
    () => validateSecuritySettlementReceipt(receiptValue(intent, { humanAdmit: { required: false, granted: true, approverId: null } })),
    "granted Human Admit without an approver",
  );
  red(
    () => validateSecurityRiskDecision({
      intentDigest: settlementIntentDigest(intent), policyEpoch: intent.policyEpoch, tier: "high",
      humanAdmitRequired: false, reasonCodes: ["amount-over-limit"], detail: "high risk",
    }, intent),
    "high-risk decision skipping Human Admit",
  );
}

// SEC-FND-008 residual risk
function residualRisk(): void {
  ok(validateSecurityClaim({ text: "residual risk remains in the unaudited signing path", measurementModel: null }).measurementModel === null, "plain residual-risk claim was rejected");
  ok(
    validateSecurityClaim({ text: "97% of sampled intents reached a deterministic decision", measurementModel: "fixture-sample-v1" }).measurementModel === "fixture-sample-v1",
    "measured claim with a named model was rejected",
  );

  for (const claim of [
    "100% immune to replay",
    "this design is unhackable",
    "zero risk of key compromise",
    "impossible to breach",
    "completely secure custody",
    "tamper-proof hardware boundary",
  ]) {
    red(() => validateSecurityClaim({ text: claim, measurementModel: "fixture-sample-v1" }), `absolute claim "${claim}"`);
  }
  red(() => validateSecurityClaim({ text: "99.99% reliable settlement", measurementModel: null }), "percentage claim without a measurement model");

  const intent = validateSettlementIntent(intentValue());
  red(
    () => validateSecuritySettlementReceipt(receiptValue(intent, { claims: [{ text: "100% immune to replay", measurementModel: null }] })),
    "absolute claim inside a receipt",
  );
}

function receiptBinding(): void {
  const intent = validateSettlementIntent(intentValue());
  assertSecurityReceiptMatchesIntent(receiptValue(intent), intentValue());
  red(
    () => assertSecurityReceiptMatchesIntent(receiptValue(intent), intentValue({ amountMinor: "2000" })),
    "receipt bound to a different intent",
  );
}

canonicalIntent();
transitionLegality();
challengeBinding();
providerSeparation();
secretFreeContracts();
revocationAndRecovery();
evidenceHonesty();
residualRisk();
receiptBinding();

console.log("SELFTEST GREEN: SEC-FND canonical intent, transition legality, challenge binding, provider separation, secret-free contracts, revocation, evidence honesty, residual risk");
