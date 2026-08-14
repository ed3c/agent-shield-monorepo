import { createHash } from "node:crypto";
import {
  assertSecurityRouteForTier,
  securityEvidenceForOutcome,
  validateSecurityLifecycle,
} from "./state-machine.ts";
import {
  SECURITY_CHALLENGE_SCHEMA,
  SECURITY_SETTLEMENT_RECEIPT_SCHEMA,
  SETTLEMENT_INTENT_SCHEMA,
  type SecurityChallenge,
  type SecurityClaim,
  type SecurityHardwareEvidence,
  type SecurityOpaqueRef,
  type SecurityProviderReceipt,
  type SecurityRevocation,
  type SecurityRiskDecision,
  type SecurityRiskTier,
  type SecuritySettlementReceipt,
  type SecurityState,
  type SettlementIntent,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const SAFE_CODE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const CURRENCY = /^[A-Z0-9]{2,12}$/;
const AMOUNT_MINOR = /^[1-9][0-9]{0,29}$/;
const MAX_INTENT_MS = 3_600_000;
const MAX_CHALLENGE_MS = 300_000;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// SEC-FND-008. Absolute security language has no admissible measurement model.
const ABSOLUTE_CLAIM = /\b(?:unhackable|unbreakable|impenetrable|immune|invulnerable|tamper-?proof|zero[- ]risk|no[- ]risk|absolutely secure|completely secure|fully secure|totally secure|guaranteed secure|cannot be (?:hacked|breached|compromised)|impossible to (?:hack|breach|compromise))\b/i;
const MEASURED_CLAIM = /(?:\b\d{1,3}(?:\.\d+)?\s*%|\b(?:100|99(?:\.\d+)?)\b)/;

export function fail(message: string): never {
  throw new Error(`invalid security contract: ${message}`);
}

// SEC-FND-005. There is deliberately no denylist of secret-looking field names here. Every
// object in this family is closed by exactKeys and no field accepts free-form JSON, so a key
// named `privateKey`, `shard`, `pin` or `nfcPayload` is refused by exactly the rule that
// refuses a key named `x`. A denylist stacked on top would be dead code that reads like a
// second independent barrier: disabling it changes no control.
function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${name} must be a plain own-key object`);
  for (const key of Object.keys(value)) {
    if (key.length === 0 || key.length > 128 || /\p{Cc}/u.test(key) || FORBIDDEN_OBJECT_KEYS.has(key)) {
      fail(`${name} contains an unsafe object key`);
    }
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) fail(`${name}.${key} is not allowed`);
  for (const key of allowed) if (!Object.hasOwn(value, key)) fail(`${name}.${key} is required`);
}

function text(value: unknown, name: string, pattern?: RegExp, maxLength = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    fail(`${name} must be a non-empty bounded string`);
  }
  if (/\p{Cc}/u.test(value)) fail(`${name} contains control characters`);
  if (pattern && !pattern.test(value)) fail(`${name} has an invalid format`);
  return value;
}

function nullableText(value: unknown, name: string, pattern?: RegExp, maxLength = 512): string | null {
  return value === null ? null : text(value, name, pattern, maxLength);
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") fail(`${name} must be a boolean`);
  return value;
}

function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function enumValue<T extends string>(value: unknown, name: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail(`${name} is invalid`);
  return value as T;
}

function sortedUnique(
  value: unknown,
  name: string,
  maxItems: number,
  validate: (entry: string, index: number) => void,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(`${name} must be an array of at most ${maxItems} items`);
  const result = value.map((entry, index) => {
    const item = text(entry, `${name}[${index}]`, undefined, 256);
    validate(item, index);
    return item;
  });
  if (new Set(result).size !== result.length) fail(`${name} contains duplicates`);
  return result.sort();
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

export function validateSecurityOpaqueRef(value: unknown, name = "subject"): SecurityOpaqueRef {
  const ref = record(value, name);
  exactKeys(ref, ["kind", "id", "sha256"], name);
  return {
    kind: enumValue(ref.kind, `${name}.kind`, ["broker-secret", "key", "device", "card", "session"] as const),
    id: text(ref.id, `${name}.id`, SAFE_ID, 128),
    sha256: text(ref.sha256, `${name}.sha256`, SHA_256, 64),
  };
}

export function validateSecurityClaim(value: unknown, name = "claim"): SecurityClaim {
  const claim = record(value, name);
  exactKeys(claim, ["text", "measurementModel"], name);
  const claimText = text(claim.text, `${name}.text`, undefined, 512);
  const measurementModel = nullableText(claim.measurementModel, `${name}.measurementModel`, undefined, 256);
  if (ABSOLUTE_CLAIM.test(claimText)) fail(`${name}.text makes an absolute security claim`);
  if (MEASURED_CLAIM.test(claimText) && measurementModel === null) {
    fail(`${name}.text states a security number without naming its measurement model`);
  }
  return { text: claimText, measurementModel };
}

// SEC-FND-001. Canonical intent. The amount is a decimal minor-unit string so no float
// rounding can change it; it is normalized to bigint for comparison only.
export function validateSettlementIntent(value: unknown): SettlementIntent {
  const intent = record(value, "settlementIntent");
  exactKeys(
    intent,
    ["schema", "intentId", "actorKind", "actorId", "target", "amountMinor", "currency", "purpose", "evidenceRefs", "policyEpoch", "issuedAtEpochMs", "expiresAtEpochMs"],
    "settlementIntent",
  );
  if (intent.schema !== SETTLEMENT_INTENT_SCHEMA) fail("settlementIntent.schema is unsupported");
  const issuedAtEpochMs = integer(intent.issuedAtEpochMs, "settlementIntent.issuedAtEpochMs", 1, Number.MAX_SAFE_INTEGER);
  const expiresAtEpochMs = integer(intent.expiresAtEpochMs, "settlementIntent.expiresAtEpochMs", 1, Number.MAX_SAFE_INTEGER);
  if (expiresAtEpochMs <= issuedAtEpochMs) fail("settlementIntent must expire after it is issued");
  if (expiresAtEpochMs - issuedAtEpochMs > MAX_INTENT_MS) fail("settlementIntent exceeds the maximum validity window");
  const evidenceRefs = sortedUnique(intent.evidenceRefs, "settlementIntent.evidenceRefs", 32, (entry, index) => {
    if (!SAFE_ID.test(entry)) fail(`settlementIntent.evidenceRefs[${index}] is invalid`);
  });
  if (evidenceRefs.length === 0) fail("settlementIntent requires at least one evidence reference");
  return {
    schema: SETTLEMENT_INTENT_SCHEMA,
    intentId: text(intent.intentId, "settlementIntent.intentId", SAFE_ID, 128),
    actorKind: enumValue(intent.actorKind, "settlementIntent.actorKind", ["human", "agent"] as const),
    actorId: text(intent.actorId, "settlementIntent.actorId", SAFE_ID, 128),
    target: text(intent.target, "settlementIntent.target", SAFE_ID, 128),
    amountMinor: text(intent.amountMinor, "settlementIntent.amountMinor", AMOUNT_MINOR, 30),
    currency: text(intent.currency, "settlementIntent.currency", CURRENCY, 12),
    purpose: text(intent.purpose, "settlementIntent.purpose", undefined, 256),
    evidenceRefs,
    policyEpoch: integer(intent.policyEpoch, "settlementIntent.policyEpoch", 0, Number.MAX_SAFE_INTEGER),
    issuedAtEpochMs,
    expiresAtEpochMs,
  };
}

export function settlementIntentDigest(intent: SettlementIntent): string {
  return createHash("sha256").update(canonical(intent)).digest("hex");
}

export function intentAmountMinor(intent: SettlementIntent): bigint {
  return BigInt(intent.amountMinor);
}

export function validateSecurityRiskDecision(value: unknown, intent: SettlementIntent): SecurityRiskDecision {
  const decision = record(value, "riskDecision");
  exactKeys(decision, ["intentDigest", "policyEpoch", "tier", "humanAdmitRequired", "reasonCodes", "detail"], "riskDecision");
  const intentDigest = text(decision.intentDigest, "riskDecision.intentDigest", SHA_256, 64);
  if (intentDigest !== settlementIntentDigest(intent)) fail("riskDecision.intentDigest does not bind this intent");
  const policyEpoch = integer(decision.policyEpoch, "riskDecision.policyEpoch", 0, Number.MAX_SAFE_INTEGER);
  if (policyEpoch !== intent.policyEpoch) fail("riskDecision.policyEpoch does not match the intent");
  const tier = enumValue(decision.tier, "riskDecision.tier", ["low", "high"] as const);
  const humanAdmitRequired = bool(decision.humanAdmitRequired, "riskDecision.humanAdmitRequired");
  if (tier === "high" && !humanAdmitRequired) fail("a high-risk decision must require Human Admit");
  return {
    intentDigest,
    policyEpoch,
    tier,
    humanAdmitRequired,
    reasonCodes: sortedUnique(decision.reasonCodes, "riskDecision.reasonCodes", 16, (entry, index) => {
      if (!SAFE_CODE.test(entry)) fail(`riskDecision.reasonCodes[${index}] is invalid`);
    }),
    detail: validateSecurityClaim({ text: text(decision.detail, "riskDecision.detail", undefined, 512), measurementModel: null }, "riskDecision.detail").text,
  };
}

// SEC-FND-003. A challenge binds nonce, intent digest, policy epoch, audience, subjects and
// a bounded expiry. Nothing else can be substituted for any of them.
export function validateSecurityChallenge(value: unknown, intent: SettlementIntent): SecurityChallenge {
  const challenge = record(value, "securityChallenge");
  exactKeys(
    challenge,
    ["schema", "nonce", "intentDigest", "policyEpoch", "audience", "subjects", "issuedAtEpochMs", "expiresAtEpochMs"],
    "securityChallenge",
  );
  if (challenge.schema !== SECURITY_CHALLENGE_SCHEMA) fail("securityChallenge.schema is unsupported");
  const intentDigest = text(challenge.intentDigest, "securityChallenge.intentDigest", SHA_256, 64);
  if (intentDigest !== settlementIntentDigest(intent)) fail("securityChallenge.intentDigest does not bind this intent");
  const policyEpoch = integer(challenge.policyEpoch, "securityChallenge.policyEpoch", 0, Number.MAX_SAFE_INTEGER);
  if (policyEpoch !== intent.policyEpoch) fail("securityChallenge.policyEpoch does not match the intent");
  const issuedAtEpochMs = integer(challenge.issuedAtEpochMs, "securityChallenge.issuedAtEpochMs", 1, Number.MAX_SAFE_INTEGER);
  const expiresAtEpochMs = integer(challenge.expiresAtEpochMs, "securityChallenge.expiresAtEpochMs", 1, Number.MAX_SAFE_INTEGER);
  if (expiresAtEpochMs <= issuedAtEpochMs) fail("securityChallenge must expire after it is issued");
  if (expiresAtEpochMs - issuedAtEpochMs > MAX_CHALLENGE_MS) fail("securityChallenge exceeds the maximum challenge window");
  if (expiresAtEpochMs > intent.expiresAtEpochMs) fail("securityChallenge cannot outlive its intent");
  if (!Array.isArray(challenge.subjects) || challenge.subjects.length === 0 || challenge.subjects.length > 8) {
    fail("securityChallenge.subjects must name between 1 and 8 opaque subjects");
  }
  const subjects = challenge.subjects.map((entry, index) => validateSecurityOpaqueRef(entry, `securityChallenge.subjects[${index}]`));
  if (new Set(subjects.map((entry) => `${entry.kind} ${entry.id}`)).size !== subjects.length) {
    fail("securityChallenge.subjects contains duplicates");
  }
  return {
    schema: SECURITY_CHALLENGE_SCHEMA,
    nonce: text(challenge.nonce, "securityChallenge.nonce", SHA_256, 64),
    intentDigest,
    policyEpoch,
    audience: text(challenge.audience, "securityChallenge.audience", SAFE_ID, 128),
    subjects,
    issuedAtEpochMs,
    expiresAtEpochMs,
  };
}

export function validateSecurityHardwareEvidence(value: unknown, name = "hardwareEvidence"): SecurityHardwareEvidence {
  const evidence = record(value, name);
  exactKeys(evidence, ["challengeNonce", "intentDigest", "policyEpoch", "subject", "attestationSha256", "detail"], name);
  return {
    challengeNonce: text(evidence.challengeNonce, `${name}.challengeNonce`, SHA_256, 64),
    intentDigest: text(evidence.intentDigest, `${name}.intentDigest`, SHA_256, 64),
    policyEpoch: integer(evidence.policyEpoch, `${name}.policyEpoch`, 0, Number.MAX_SAFE_INTEGER),
    subject: validateSecurityOpaqueRef(evidence.subject, `${name}.subject`),
    attestationSha256: text(evidence.attestationSha256, `${name}.attestationSha256`, SHA_256, 64),
    detail: text(evidence.detail, `${name}.detail`, undefined, 512),
  };
}

// SEC-FND-003 and SEC-FND-006 together: evidence must answer this exact challenge, from a
// subject the challenge named, before expiry, and it must not be bound to a revoked epoch.
export function admitSecurityHardwareEvidence(
  evidence: SecurityHardwareEvidence,
  challenge: SecurityChallenge,
  revocations: readonly SecurityRevocation[],
  nowEpochMs: number,
): void {
  if (evidence.challengeNonce !== challenge.nonce) fail("hardware evidence answers a different challenge");
  if (evidence.intentDigest !== challenge.intentDigest) fail("hardware evidence binds a different intent");
  if (evidence.policyEpoch !== challenge.policyEpoch) fail("hardware evidence binds a different policy epoch");
  if (nowEpochMs < challenge.issuedAtEpochMs) fail("hardware evidence predates its challenge");
  if (nowEpochMs >= challenge.expiresAtEpochMs) fail("hardware evidence answers an expired challenge");
  const named = challenge.subjects.some(
    (subject) => subject.kind === evidence.subject.kind && subject.id === evidence.subject.id && subject.sha256 === evidence.subject.sha256,
  );
  if (!named) fail("hardware evidence comes from a subject the challenge did not name");
  for (const revocation of revocations) {
    if (revocation.subject.kind !== evidence.subject.kind || revocation.subject.id !== evidence.subject.id) continue;
    if (evidence.policyEpoch < revocation.revokedFromEpoch) fail("hardware evidence predates a revocation of its subject");
  }
}

export function validateSecurityRevocation(value: unknown, name = "revocation"): SecurityRevocation {
  const revocation = record(value, name);
  exactKeys(revocation, ["subject", "revokedFromEpoch", "reason"], name);
  return {
    subject: validateSecurityOpaqueRef(revocation.subject, `${name}.subject`),
    revokedFromEpoch: integer(revocation.revokedFromEpoch, `${name}.revokedFromEpoch`, 0, Number.MAX_SAFE_INTEGER),
    reason: text(revocation.reason, `${name}.reason`, undefined, 256),
  };
}

export function validateSecurityProviderReceipt(value: unknown, name = "providerReceipt"): SecurityProviderReceipt {
  const receipt = record(value, name);
  exactKeys(receipt, ["kind", "providerId", "providerVersion", "subject", "implementation", "state", "auditRef", "detail"], name);
  const implementation = enumValue(receipt.implementation, `${name}.implementation`, ["IMPLEMENTED", "NOT_IMPLEMENTED"] as const);
  const state = enumValue(receipt.state, `${name}.state`, ["PASS", "FAIL", "ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED"] as const);
  if (implementation === "NOT_IMPLEMENTED" && state !== "NOT_IMPLEMENTED") {
    fail(`${name} cannot report a state other than NOT_IMPLEMENTED for an unimplemented provider`);
  }
  const kind = enumValue(receipt.kind, `${name}.kind`, ["policy", "workflow", "broker", "ledger", "hardware", "crypto", "chain"] as const);
  const auditRef = nullableText(receipt.auditRef, `${name}.auditRef`, SAFE_ID, 128);
  // SEC-FND-007. An audited capability cannot claim PASS without naming the audit that
  // produced it, and no schema check can supply that reference.
  if (state === "PASS" && (kind === "hardware" || kind === "crypto" || kind === "chain") && auditRef === null) {
    fail(`${name} cannot report PASS for an audited capability without an audit reference`);
  }
  return {
    kind,
    providerId: text(receipt.providerId, `${name}.providerId`, SAFE_ID, 128),
    providerVersion: text(receipt.providerVersion, `${name}.providerVersion`, SAFE_VERSION, 64),
    subject: receipt.subject === null ? null : validateSecurityOpaqueRef(receipt.subject, `${name}.subject`),
    implementation,
    state,
    auditRef,
    detail: text(receipt.detail, `${name}.detail`, undefined, 512),
  };
}

// SEC-FND-004. Each provider kind may appear at most once, so one receipt cannot be counted
// as another capability's evidence by repetition.
export function validateSecurityProviderReceipts(value: unknown, name = "providerReceipts"): SecurityProviderReceipt[] {
  if (!Array.isArray(value) || value.length > 7) fail(`${name} must be an array of at most 7 receipts`);
  const receipts = value.map((entry, index) => validateSecurityProviderReceipt(entry, `${name}[${index}]`));
  if (new Set(receipts.map((entry) => entry.kind)).size !== receipts.length) {
    fail(`${name} contains more than one receipt for the same provider kind`);
  }
  return receipts;
}

export function validateSecuritySettlementReceipt(value: unknown): SecuritySettlementReceipt {
  const receipt = record(value, "settlementReceipt");
  exactKeys(
    receipt,
    ["schema", "intentId", "intentDigest", "policyEpoch", "tier", "lifecycle", "outcome", "state", "providerReceipts", "humanAdmit", "claims", "exclusions", "detail"],
    "settlementReceipt",
  );
  if (receipt.schema !== SECURITY_SETTLEMENT_RECEIPT_SCHEMA) fail("settlementReceipt.schema is unsupported");
  if (!Array.isArray(receipt.lifecycle)) fail("settlementReceipt.lifecycle must be an array");
  const lifecycle = receipt.lifecycle as SecurityState[];
  const outcome = validateSecurityLifecycle(lifecycle);
  const tier = enumValue(receipt.tier, "settlementReceipt.tier", ["low", "high"] as const) as SecurityRiskTier;
  assertSecurityRouteForTier(lifecycle, tier);
  if (receipt.outcome !== outcome) fail("settlementReceipt.outcome does not match its own lifecycle");
  if (receipt.state !== securityEvidenceForOutcome(outcome)) fail("settlementReceipt.state does not match its outcome");

  const humanAdmit = record(receipt.humanAdmit, "settlementReceipt.humanAdmit");
  exactKeys(humanAdmit, ["required", "granted", "approverId"], "settlementReceipt.humanAdmit");
  const required = bool(humanAdmit.required, "settlementReceipt.humanAdmit.required");
  const granted = bool(humanAdmit.granted, "settlementReceipt.humanAdmit.granted");
  const approverId = nullableText(humanAdmit.approverId, "settlementReceipt.humanAdmit.approverId", SAFE_ID, 128);
  if (granted && approverId === null) fail("granted Human Admit must name its approver");
  if (!granted && approverId !== null) fail("an ungranted Human Admit cannot name an approver");
  if (tier === "high" && !required) fail("a high-risk settlement must require Human Admit");
  if (required && !granted && outcome === "SUBMISSION_PENDING") {
    fail("a settlement awaiting Human Admit cannot reach submission");
  }

  if (!Array.isArray(receipt.claims) || receipt.claims.length > 16) fail("settlementReceipt.claims must be an array of at most 16 claims");
  return {
    schema: SECURITY_SETTLEMENT_RECEIPT_SCHEMA,
    intentId: text(receipt.intentId, "settlementReceipt.intentId", SAFE_ID, 128),
    intentDigest: text(receipt.intentDigest, "settlementReceipt.intentDigest", SHA_256, 64),
    policyEpoch: integer(receipt.policyEpoch, "settlementReceipt.policyEpoch", 0, Number.MAX_SAFE_INTEGER),
    tier,
    lifecycle: [...lifecycle],
    outcome,
    state: securityEvidenceForOutcome(outcome),
    providerReceipts: validateSecurityProviderReceipts(receipt.providerReceipts, "settlementReceipt.providerReceipts"),
    humanAdmit: { required, granted, approverId },
    claims: receipt.claims.map((entry, index) => validateSecurityClaim(entry, `settlementReceipt.claims[${index}]`)),
    exclusions: sortedUnique(receipt.exclusions, "settlementReceipt.exclusions", 32, (entry, index) => {
      if (!SAFE_ID.test(entry)) fail(`settlementReceipt.exclusions[${index}] is invalid`);
    }),
    detail: text(receipt.detail, "settlementReceipt.detail", undefined, 512),
  };
}

export function assertSecurityReceiptMatchesIntent(receiptValue: unknown, intentValue: unknown): void {
  const receipt = validateSecuritySettlementReceipt(receiptValue);
  const intent = validateSettlementIntent(intentValue);
  if (receipt.intentId !== intent.intentId) fail("settlementReceipt.intentId does not match the intent");
  if (receipt.intentDigest !== settlementIntentDigest(intent)) fail("settlementReceipt.intentDigest does not match the intent");
  if (receipt.policyEpoch !== intent.policyEpoch) fail("settlementReceipt.policyEpoch does not match the intent");
}
