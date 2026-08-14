import { createHash } from "node:crypto";
import { validateSecureEnclaveLifecycle } from "./state-machine.ts";
import {
  SE_KEY_RECEIPT_SCHEMA,
  SE_LIFECYCLE_RECEIPT_SCHEMA,
  SE_SIGNING_RECEIPT_SCHEMA,
  type AccessControlPolicy,
  type EnclaveChallenge,
  type EnclaveKeyRecord,
  type HardwareEvidence,
  type PlatformSubject,
  type SecureEnclaveBridge,
  type SecureEnclaveKeyReceipt,
  type SecureEnclaveLifecycleReceipt,
  type SecureEnclaveSigningReceipt,
  type SecureEnclaveState,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const BUNDLE_ID = /^[A-Za-z0-9][A-Za-z0-9.-]{2,127}$/;
const TEAM_ID = /^[A-Z0-9]{10}$/;
const SEMVER_ISH = /^[0-9]+(?:\.[0-9]+){1,3}$/;
const ACCESS_GROUP = /^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]{2,127}$/;

// SEC-SE-001. The entitlement that lets a process reach the enclave-backed keychain at all. An
// app without it does not get a weaker key, it gets no key -- so its absence is an admission
// failure rather than a runtime surprise.
const REQUIRED_ENTITLEMENTS = ["keychain-access-groups", "com.apple.developer.devicecheck.appattest-environment"] as const;

// SEC-SE-006. Anything that is not device-bound survives a backup restored onto another
// device, which makes the key useless as evidence that this device was present.
const DEVICE_BOUND_ACCESSIBILITY = new Set(["when-unlocked-this-device-only", "when-passcode-set-this-device-only"]);

export function fail(message: string): never {
  throw new Error(`invalid secure enclave contract: ${message}`);
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// SEC-SE-001. Exact OS, device, app, team, entitlement and toolchain subject, and an
// environment that is a real device backed by a real enclave.
//
// The simulator refusal is the one that earns its place: every other check here fails loudly on
// a misconfigured build, but a simulator run succeeds at everything and produces a signature
// that looks exactly like hardware evidence. That is the shape the issue's control has.
export function assertPlatformSubject(subject: PlatformSubject): PlatformSubject {
  if (!SEMVER_ISH.test(subject.osVersion)) fail("osVersion must be an exact version");
  if (!SAFE_ID.test(subject.deviceModel)) fail("deviceModel is invalid");
  if (!SAFE_ID.test(subject.deviceRef)) fail("deviceRef is invalid");
  if (!BUNDLE_ID.test(subject.appBundleId)) fail("appBundleId is invalid");
  if (!SEMVER_ISH.test(subject.appVersion)) fail("appVersion must be an exact version");
  if (!TEAM_ID.test(subject.teamId)) fail("teamId is invalid");
  if (!SEMVER_ISH.test(subject.xcodeVersion)) fail("xcodeVersion must be an exact version");
  if (!SEMVER_ISH.test(subject.swiftVersion)) fail("swiftVersion must be an exact version");
  for (const entitlement of REQUIRED_ENTITLEMENTS) {
    if (!subject.entitlements.includes(entitlement)) fail(`entitlement ${entitlement} is absent`);
  }
  if (subject.environment !== "device") fail(`environment ${subject.environment} cannot produce device hardware evidence`);
  if (subject.hardware !== "secure-enclave") fail(`hardware ${subject.hardware} is not a Secure Enclave`);
  return subject;
}

// SEC-SE-003. The access-control policy the key is created under. Every field here is a rule
// the platform will enforce for the life of the key, so getting it wrong at creation cannot be
// corrected at signing time -- which is why this is admission and not a runtime check.
export function assertAccessControlPolicy(policy: AccessControlPolicy): AccessControlPolicy {
  if (!SAFE_ID.test(policy.policyId)) fail("policyId is invalid");
  if (!policy.userPresenceRequired) fail("userPresenceRequired must be set for a hardware brake key");
  // One rule covers both `none` and `any-biometry`. A separate `biometry === "none"` check was
  // written first and the plant check found it dead: this line already catches it, so the
  // earlier one could be deleted without any control turning red. `any-biometry` is the reason
  // the rule is stricter than "some biometry" -- it keeps working after a new finger or face is
  // enrolled, which is exactly the step an attacker with the passcode performs.
  if (policy.biometry !== "current-biometry-set") fail("biometry policy must be bound to the current enrolled set");
  if (!ACCESS_GROUP.test(policy.accessGroup)) fail("accessGroup must be a team-qualified keychain access group");
  if (!DEVICE_BOUND_ACCESSIBILITY.has(policy.accessibility)) fail(`accessibility ${policy.accessibility} is not device-bound`);
  return policy;
}

export function policyDigest(policy: AccessControlPolicy): string {
  return digest([
    policy.policyId, policy.userPresenceRequired, policy.biometry,
    policy.devicePasscodeFallback, policy.accessGroup, policy.accessibility,
  ]);
}

// SEC-SE-004 and SEC-SE-006. The registered keys plus the nonces already spent against them.
//
// Replay protection and revocation live in the same object because they answer the same
// question -- may this challenge still produce evidence -- and splitting them is how one of
// them ends up consulted on a path the other guards.
export class KeyRegistry {
  readonly #keys = new Map<string, EnclaveKeyRecord>();
  readonly #spentNonces = new Set<string>();

  register(record: EnclaveKeyRecord): void {
    if (this.#keys.has(record.keyId)) fail("a key is already registered under this identifier");
    this.#keys.set(record.keyId, record);
  }

  get(keyId: string): EnclaveKeyRecord | null {
    return this.#keys.get(keyId) ?? null;
  }

  revoke(keyId: string, fromEpoch: number): boolean {
    const record = this.#keys.get(keyId);
    if (record === undefined) return false;
    this.#keys.set(keyId, { ...record, revokedFromEpoch: fromEpoch });
    return true;
  }

  // Scoped to the key: two keys may legitimately be challenged with the same random value, and
  // a global nonce set would turn that coincidence into a refusal.
  isSpent(keyId: string, nonce: string): boolean {
    return this.#spentNonces.has(`${keyId}|${nonce}`);
  }

  spend(keyId: string, nonce: string): void {
    this.#spentNonces.add(`${keyId}|${nonce}`);
  }
}

// SEC-SE-004. Every binding the challenge has to carry, checked in one pass so that no single
// dimension can be left unchecked by a later edit that only remembers the interesting ones.
export function challengeRefusal(
  challenge: EnclaveChallenge,
  bound: { intentDigest: string; policyEpoch: number; audience: string; deviceRef: string },
  registry: KeyRegistry,
  nowEpochMs: number,
): { refusal: string; state: SecureEnclaveState } | null {
  if (challenge.nonce.length < 16) return { refusal: "the challenge nonce is too short to be unguessable", state: "AUTH_FAILED" };
  if (!SHA_256.test(challenge.intentDigest)) return { refusal: "the challenge intent is not content-addressed", state: "AUTH_FAILED" };
  if (challenge.intentDigest !== bound.intentDigest) return { refusal: "the challenge is bound to another intent", state: "AUTH_FAILED" };
  if (challenge.policyEpoch !== bound.policyEpoch) return { refusal: "the challenge is bound to another policy epoch", state: "AUTH_FAILED" };
  if (challenge.audience !== bound.audience) return { refusal: "the challenge is bound to another audience", state: "AUTH_FAILED" };
  if (challenge.deviceRef !== bound.deviceRef) return { refusal: "the challenge is bound to another device", state: "AUTH_FAILED" };

  const record = registry.get(challenge.keyId);
  if (record === null) return { refusal: "the challenge names an unregistered key", state: "AUTH_FAILED" };
  if (record.deviceRef !== challenge.deviceRef) return { refusal: "the registered key belongs to another device", state: "AUTH_FAILED" };
  // SEC-SE-006. Checked before expiry on purpose: a revoked key must not be able to report
  // "expired" and invite a retry with a fresh challenge.
  if (record.revokedFromEpoch !== null && challenge.policyEpoch >= record.revokedFromEpoch) {
    return { refusal: "the key was revoked from this policy epoch", state: "REVOKED" };
  }

  if (!Number.isSafeInteger(challenge.issuedAtEpochMs) || !Number.isSafeInteger(challenge.expiresAtEpochMs)) {
    return { refusal: "the challenge validity window is not a whole number of milliseconds", state: "AUTH_FAILED" };
  }
  if (challenge.expiresAtEpochMs <= challenge.issuedAtEpochMs) return { refusal: "the challenge expires before it was issued", state: "AUTH_FAILED" };
  if (nowEpochMs >= challenge.expiresAtEpochMs) return { refusal: "the challenge has expired", state: "CHALLENGE_EXPIRED" };

  if (registry.isSpent(challenge.keyId, challenge.nonce)) {
    return { refusal: "the challenge nonce was already spent", state: "REPLAY_REFUSED" };
  }
  return null;
}

interface Cleanup {
  cleared: boolean;
  detail: string;
}

// SEC-SE-008. Asked once, after every ceremony, whatever the ceremony's own outcome was. A
// clean failure that leaves an authorization session open is still a failure to clean up.
function cleanup(bridge: SecureEnclaveBridge): Cleanup {
  const challenges = bridge.retainedChallenges();
  const sessions = bridge.retainedAuthSessions();
  if (challenges > 0 || sessions > 0) {
    return { cleared: false, detail: `${challenges} challenge and ${sessions} authorization sessions were retained` };
  }
  return { cleared: true, detail: "no challenge or authorization session was retained" };
}

function keyReceipt(
  deviceRef: string,
  lifecycle: SecureEnclaveState[],
  detail: string,
  key: EnclaveKeyRecord | null,
  sessionsCleared: boolean,
): SecureEnclaveKeyReceipt {
  return {
    schema: SE_KEY_RECEIPT_SCHEMA,
    keyId: key?.keyId ?? null,
    deviceRef,
    lifecycle,
    outcome: validateSecureEnclaveLifecycle(lifecycle),
    publicKeySha256: key?.publicKeySha256 ?? null,
    policyDigest: key?.policyDigest ?? null,
    sessionsCleared,
    detail,
  };
}

export interface ProvisioningRequest {
  subject: PlatformSubject;
  policy: AccessControlPolicy;
  bridge: SecureEnclaveBridge;
  registry: KeyRegistry;
  epoch: number;
}

// UNPROVISIONED → DEVICE_CHECKED → KEY_CREATING → KEY_REGISTERED → ACTIVE
export function runProvisioning(request: ProvisioningRequest): { receipt: SecureEnclaveKeyReceipt; key: EnclaveKeyRecord | null } {
  const { subject, policy, bridge, registry, epoch } = request;
  assertPlatformSubject(subject);
  assertAccessControlPolicy(policy);
  const lifecycle: SecureEnclaveState[] = ["UNPROVISIONED"];

  const probe = bridge.probe();
  if (!probe.available) {
    lifecycle.push("ABSENT_DEVICE");
    return { receipt: keyReceipt(subject.deviceRef, lifecycle, "the native bridge reported no device", null, cleanup(bridge).cleared), key: null };
  }
  // The probe is the live fact; the subject is the claim. Disagreement means the admitted
  // subject describes a different device than the one answering, and the live fact wins.
  if (probe.environment !== "device" || probe.hardware !== "secure-enclave") {
    lifecycle.push("UNSUPPORTED_HARDWARE");
    return {
      receipt: keyReceipt(subject.deviceRef, lifecycle, `the device reported environment ${probe.environment} and backing ${probe.hardware}`, null, cleanup(bridge).cleared),
      key: null,
    };
  }
  lifecycle.push("DEVICE_CHECKED", "KEY_CREATING");

  const created = bridge.createKey(policy);
  if (created === null) {
    lifecycle.push("AUTH_FAILED");
    return { receipt: keyReceipt(subject.deviceRef, lifecycle, "key creation was refused by the platform", null, cleanup(bridge).cleared), key: null };
  }
  // SEC-SE-002. A key the platform says can leave the device was not created in the enclave,
  // whatever else the call reported. This is the only place the property can be established:
  // once the key is registered, every later caller sees an ordinary key record.
  if (created.exportable || created.backing !== "secure-enclave") {
    lifecycle.push("UNSUPPORTED_HARDWARE");
    return {
      receipt: keyReceipt(subject.deviceRef, lifecycle, `the created key is ${created.backing}-backed and ${created.exportable ? "exportable" : "non-exportable"}`, null, cleanup(bridge).cleared),
      key: null,
    };
  }
  if (!SHA_256.test(created.publicKeySha256)) fail("the created public key is not content-addressed");

  const record: EnclaveKeyRecord = {
    keyId: created.keyId,
    publicKeySha256: created.publicKeySha256,
    policyDigest: policyDigest(policy),
    attestationSha256: created.attestation.sha256,
    deviceRef: subject.deviceRef,
    createdAtEpoch: epoch,
    revokedFromEpoch: null,
  };
  registry.register(record);
  lifecycle.push("KEY_REGISTERED");

  const cleared = cleanup(bridge);
  if (!cleared.cleared) {
    lifecycle.push("FAILED_CLEANUP");
    return { receipt: keyReceipt(subject.deviceRef, lifecycle, cleared.detail, record, false), key: record };
  }
  lifecycle.push("ACTIVE");
  return { receipt: keyReceipt(subject.deviceRef, lifecycle, "the key is registered and active", record, true), key: record };
}

export interface SigningRequest {
  subject: PlatformSubject;
  policy: AccessControlPolicy;
  challenge: EnclaveChallenge;
  bound: { intentDigest: string; policyEpoch: number; audience: string };
  bridge: SecureEnclaveBridge;
  registry: KeyRegistry;
  nowEpochMs: number;
}

function signingReceipt(
  request: SigningRequest,
  lifecycle: SecureEnclaveState[],
  detail: string,
  evidence: HardwareEvidence | null,
  sessionsCleared: boolean,
): SecureEnclaveSigningReceipt {
  return {
    schema: SE_SIGNING_RECEIPT_SCHEMA,
    keyId: request.challenge.keyId,
    deviceRef: request.subject.deviceRef,
    policyEpoch: request.bound.policyEpoch,
    lifecycle,
    outcome: validateSecureEnclaveLifecycle(lifecycle),
    evidence,
    sessionsCleared,
    detail,
  };
}

// ACTIVE → CHALLENGE_RECEIVED → USER_PRESENCE_REQUIRED → SIGNED → EVIDENCE_EMITTED → ACTIVE
export function runSigning(request: SigningRequest): { receipt: SecureEnclaveSigningReceipt } {
  const { subject, policy, challenge, bound, bridge, registry, nowEpochMs } = request;
  assertPlatformSubject(subject);
  assertAccessControlPolicy(policy);
  const lifecycle: SecureEnclaveState[] = ["ACTIVE", "CHALLENGE_RECEIVED"];

  const refusal = challengeRefusal(challenge, { ...bound, deviceRef: subject.deviceRef }, registry, nowEpochMs);
  if (refusal !== null) {
    lifecycle.push(refusal.state);
    return { receipt: signingReceipt(request, lifecycle, refusal.refusal, null, cleanup(bridge).cleared) };
  }
  // Spent before the signature exists, not after it succeeds. A signing run that crashes after
  // the enclave has already produced a signature must not leave the nonce replayable.
  registry.spend(challenge.keyId, challenge.nonce);
  lifecycle.push("USER_PRESENCE_REQUIRED");

  const presence = bridge.authorize(challenge, policy);
  // SEC-SE-003. Cancellation and failure are different outcomes: a user who declined is not a
  // device that could not authenticate, and collapsing them loses the distinction the issue's
  // state machine names.
  if (presence.cancelled) {
    lifecycle.push("USER_REFUSED");
    return { receipt: signingReceipt(request, lifecycle, "the user declined the authorization prompt", null, cleanup(bridge).cleared) };
  }
  if (!presence.satisfied || presence.method === null) {
    lifecycle.push("AUTH_FAILED");
    return { receipt: signingReceipt(request, lifecycle, "local authorization was not satisfied", null, cleanup(bridge).cleared) };
  }
  if (presence.method === "device-passcode" && !policy.devicePasscodeFallback) {
    lifecycle.push("AUTH_FAILED");
    return { receipt: signingReceipt(request, lifecycle, "the passcode fallback is not admitted by this policy", null, cleanup(bridge).cleared) };
  }
  lifecycle.push("SIGNED");

  const signature = bridge.sign(challenge);
  if (signature === null) {
    lifecycle.push("SIGN_FAILED");
    return { receipt: signingReceipt(request, lifecycle, "the enclave refused to sign", null, cleanup(bridge).cleared) };
  }
  // The bridge signed something. Whether it signed *this* challenge with *this* key is checked
  // here rather than assumed, because a bridge that answers the wrong challenge is exactly the
  // failure a device-side cache or a race produces.
  if (signature.nonce !== challenge.nonce || signature.keyId !== challenge.keyId) {
    lifecycle.push("SIGN_FAILED");
    return { receipt: signingReceipt(request, lifecycle, "the signature is bound to another challenge", null, cleanup(bridge).cleared) };
  }
  if (!SHA_256.test(signature.signatureSha256) || !SHA_256.test(signature.attestationSha256)) {
    lifecycle.push("SIGN_FAILED");
    return { receipt: signingReceipt(request, lifecycle, "the signature is not content-addressed", null, cleanup(bridge).cleared) };
  }

  const record = registry.get(challenge.keyId) as EnclaveKeyRecord;
  const evidence: HardwareEvidence = {
    keyId: record.keyId,
    deviceRef: record.deviceRef,
    publicKeySha256: record.publicKeySha256,
    intentDigest: challenge.intentDigest,
    challengeNonce: challenge.nonce,
    policyEpoch: challenge.policyEpoch,
    presenceMethod: presence.method,
    signatureSha256: signature.signatureSha256,
    attestationSha256: signature.attestationSha256,
  };
  lifecycle.push("EVIDENCE_EMITTED");

  const cleared = cleanup(bridge);
  if (!cleared.cleared) {
    lifecycle.push("FAILED_CLEANUP");
    return { receipt: signingReceipt(request, lifecycle, cleared.detail, evidence, false) };
  }
  lifecycle.push("ACTIVE");
  return { receipt: signingReceipt(request, lifecycle, "hardware evidence was emitted", evidence, true) };
}

// SEC-SE-005. Verification is a separate entry point from signing on purpose: the party that
// admits evidence is not the party that produced it, and a verifier that can only be reached
// through the producing path is not a verifier.
export function verifyHardwareEvidence(
  evidence: HardwareEvidence,
  registry: KeyRegistry,
  bound: { intentDigest: string; policyEpoch: number },
): string | null {
  const record = registry.get(evidence.keyId);
  if (record === null) return "the evidence names an unregistered key";
  if (record.publicKeySha256 !== evidence.publicKeySha256) return "the evidence carries another public key";
  if (record.deviceRef !== evidence.deviceRef) return "the evidence carries another device";
  if (evidence.intentDigest !== bound.intentDigest) return "the evidence is bound to another intent";
  if (evidence.policyEpoch !== bound.policyEpoch) return "the evidence is bound to another policy epoch";
  if (record.revokedFromEpoch !== null && evidence.policyEpoch >= record.revokedFromEpoch) {
    return "the key was revoked from this policy epoch";
  }
  if (!SHA_256.test(evidence.signatureSha256)) return "the evidence signature is not content-addressed";
  if (!SHA_256.test(evidence.attestationSha256)) return "the evidence attestation is not content-addressed";
  return null;
}

export interface LifecycleRequest {
  subject: PlatformSubject;
  keyId: string;
  fromEpoch: number;
  toEpoch: number;
  bridge: SecureEnclaveBridge;
  registry: KeyRegistry;
  // #59 keeps registration, rotation, revocation and lost-device recovery human-owned, so this
  // is a reference to an approval, never a decision this provider makes.
  humanApprovalRef: string | null;
}

function lifecycleReceipt(
  request: LifecycleRequest,
  lifecycle: SecureEnclaveState[],
  detail: string,
  sessionsCleared: boolean,
): SecureEnclaveLifecycleReceipt {
  return {
    schema: SE_LIFECYCLE_RECEIPT_SCHEMA,
    keyId: request.keyId,
    deviceRef: request.subject.deviceRef,
    lifecycle,
    outcome: validateSecureEnclaveLifecycle(lifecycle),
    fromEpoch: request.fromEpoch,
    toEpoch: request.toEpoch,
    humanApprovalRef: request.humanApprovalRef,
    sessionsCleared,
    detail,
  };
}

// ACTIVE → ROTATING. The ceremony stops there: creating the replacement key needs the human
// admit that #59 reserves, so a rotation this provider could complete on its own would be the
// automatic replacement SEC-SE-008's control forbids.
export function runRotation(request: LifecycleRequest): { receipt: SecureEnclaveLifecycleReceipt } {
  const { registry, bridge, keyId, fromEpoch, toEpoch, humanApprovalRef } = request;
  assertPlatformSubject(request.subject);
  const lifecycle: SecureEnclaveState[] = ["ACTIVE"];

  if (registry.get(keyId) === null) {
    lifecycle.push("RECOVERY_REQUIRED");
    return { receipt: lifecycleReceipt(request, lifecycle, "the key is not registered on this device", cleanup(bridge).cleared) };
  }
  if (!Number.isSafeInteger(toEpoch) || toEpoch <= fromEpoch) fail("a rotation must advance the policy epoch");
  lifecycle.push("ROTATING");

  if (humanApprovalRef === null) {
    return { receipt: lifecycleReceipt(request, lifecycle, "rotation is parked pending human admit", cleanup(bridge).cleared) };
  }
  // The old key stops being admissible at the new epoch whether or not a replacement exists.
  // The alternative -- keeping it valid until the replacement lands -- is a window in which a
  // rotation that was ordered because the key was suspect has not taken effect.
  if (!bridge.revoke(keyId, toEpoch)) {
    lifecycle.push("RECOVERY_REQUIRED");
    return { receipt: lifecycleReceipt(request, lifecycle, "the device could not revoke the outgoing key", cleanup(bridge).cleared) };
  }
  registry.revoke(keyId, toEpoch);
  lifecycle.push("REVOKED");
  return { receipt: lifecycleReceipt(request, lifecycle, "the outgoing key is revoked from the new epoch", cleanup(bridge).cleared) };
}

export function runRevocation(request: LifecycleRequest): { receipt: SecureEnclaveLifecycleReceipt } {
  const { registry, bridge, keyId, toEpoch, humanApprovalRef } = request;
  assertPlatformSubject(request.subject);
  const lifecycle: SecureEnclaveState[] = ["ACTIVE"];

  if (humanApprovalRef === null) fail("revocation requires a human approval reference");
  if (registry.get(keyId) === null) {
    lifecycle.push("RECOVERY_REQUIRED");
    return { receipt: lifecycleReceipt(request, lifecycle, "the key is not registered on this device", cleanup(bridge).cleared) };
  }
  // A lost or wiped device cannot revoke its own key. That is the case recovery exists for, and
  // reporting it as a successful revocation is the failure SEC-SE-006's control looks for.
  if (!bridge.revoke(keyId, toEpoch)) {
    lifecycle.push("RECOVERY_REQUIRED");
    return { receipt: lifecycleReceipt(request, lifecycle, "the device did not confirm revocation", cleanup(bridge).cleared) };
  }
  registry.revoke(keyId, toEpoch);
  lifecycle.push("REVOKED");
  return { receipt: lifecycleReceipt(request, lifecycle, "the key is revoked from the named epoch", cleanup(bridge).cleared) };
}

// The evidence this provider is allowed to claim. Nothing here reaches PASS from a deterministic
// run: a device canary is the only thing that can move any of these, and the selftest pins the
// type so that widening a member to PASS fails to compile.
export const secureEnclaveProviderState = {
  deviceKeyGeneration: "NOT_EXERCISED",
  userPresenceAuthorization: "NOT_EXERCISED",
  attestationVerification: "NOT_EXERCISED",
  lostDeviceRecovery: "NOT_IMPLEMENTED",
  productionSigningAuthority: "NOT_IMPLEMENTED",
} as const;
