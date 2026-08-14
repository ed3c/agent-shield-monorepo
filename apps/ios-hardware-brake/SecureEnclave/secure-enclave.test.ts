import {
  FakeSecureEnclaveBridge,
  KeyRegistry,
  PLANTED_SECRET,
  REDACTED,
  SealedAttestation,
  assertAccessControlPolicy,
  assertPlatformSubject,
  assertSecureEnclaveTransition,
  isSecureEnclaveOutcome,
  runProvisioning,
  runRevocation,
  runRotation,
  runSigning,
  secureEnclaveProviderState,
  validateSecureEnclaveLifecycle,
  verifyHardwareEvidence,
  type AccessControlPolicy,
  type CreatedKey,
  type EnclaveChallenge,
  type HardwareEvidence,
  type PlatformSubject,
  type SecureEnclaveBridge,
  type SecureEnclaveOutcome,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SEC-SE ${message}`);
}

// A control that only asserts "something threw" also passes when a later line throws a
// TypeError for an unrelated reason, which makes a dead guard look load-bearing under a plant
// check. Every control must fail through this provider's own contract error.
function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid secure enclave contract: "), `${message} threw "${text}" rather than a secure enclave contract error`);
}

const DEVICE_REF = "owner-iphone";
const KEY_ID = "se-key-primary";
const EPOCH = 7;
const ISSUED = 1_700_000_000_000;
const EXPIRES = ISSUED + 300_000;
const NOW = ISSUED + 1_000;
const INTENT = "d".repeat(64);
const AUDIENCE = "agent-shield.settlement";

function subject(overrides: Partial<PlatformSubject> = {}): PlatformSubject {
  return {
    osVersion: "18.2",
    deviceModel: "iphone16-2",
    deviceRef: DEVICE_REF,
    appBundleId: "com.example.agentshield",
    appVersion: "1.4.0",
    teamId: "ABCDE12345",
    entitlements: ["keychain-access-groups", "com.apple.developer.devicecheck.appattest-environment"],
    xcodeVersion: "16.2",
    swiftVersion: "6.0",
    environment: "device",
    hardware: "secure-enclave",
    ...overrides,
  };
}

function policy(overrides: Partial<AccessControlPolicy> = {}): AccessControlPolicy {
  return {
    policyId: "hardware-brake-v1",
    userPresenceRequired: true,
    biometry: "current-biometry-set",
    devicePasscodeFallback: true,
    accessGroup: "ABCDE12345.com.example.agentshield",
    accessibility: "when-unlocked-this-device-only",
    ...overrides,
  };
}

function challenge(overrides: Partial<EnclaveChallenge> = {}): EnclaveChallenge {
  return {
    nonce: "a".repeat(32),
    intentDigest: INTENT,
    policyEpoch: EPOCH,
    audience: AUDIENCE,
    keyId: KEY_ID,
    deviceRef: DEVICE_REF,
    issuedAtEpochMs: ISSUED,
    expiresAtEpochMs: EXPIRES,
    ...overrides,
  };
}

const BOUND = { intentDigest: INTENT, policyEpoch: EPOCH, audience: AUDIENCE };

// A provisioned device: the starting point for every signing fixture below.
function provisioned(bridge = new FakeSecureEnclaveBridge()): { bridge: FakeSecureEnclaveBridge; registry: KeyRegistry } {
  const registry = new KeyRegistry();
  const { receipt } = runProvisioning({ subject: subject(), policy: policy(), bridge, registry, epoch: EPOCH });
  ok(receipt.outcome === "ACTIVE", `provisioning fixture reported ${receipt.outcome}`);
  return { bridge, registry };
}

function signOnce(
  overrides: Partial<EnclaveChallenge> = {},
  bridge = new FakeSecureEnclaveBridge(),
  nowEpochMs = NOW,
  registry?: KeyRegistry,
): ReturnType<typeof runSigning>["receipt"] {
  const state = registry === undefined ? provisioned(bridge) : { bridge, registry };
  return runSigning({
    subject: subject(),
    policy: policy(),
    challenge: challenge(overrides),
    bound: BOUND,
    bridge: state.bridge,
    registry: state.registry,
    nowEpochMs,
  }).receipt;
}

// SEC-SE-001. Exact platform subject. The simulator control is the one that matters: every
// other misconfiguration fails loudly, but a simulator runs the whole provider successfully and
// produces something that looks exactly like hardware evidence.
function platformAdmission(): void {
  assertPlatformSubject(subject());

  red(() => assertPlatformSubject(subject({ environment: "simulator" })), "a simulator subject");
  red(() => assertPlatformSubject(subject({ environment: "unknown" })), "an unknown environment");
  red(() => assertPlatformSubject(subject({ hardware: "software" })), "a software-backed subject");
  red(() => assertPlatformSubject(subject({ hardware: "unknown" })), "an unknown backing");
  red(() => assertPlatformSubject(subject({ osVersion: "latest" })), "a moving OS channel");
  red(() => assertPlatformSubject(subject({ appVersion: "1" })), "an imprecise app version");
  red(() => assertPlatformSubject(subject({ teamId: "abcde12345" })), "a malformed team identifier");
  red(() => assertPlatformSubject(subject({ appBundleId: "a b" })), "a malformed bundle identifier");
  red(() => assertPlatformSubject(subject({ xcodeVersion: "x" })), "an imprecise toolchain version");
  red(() => assertPlatformSubject(subject({ swiftVersion: "x" })), "an imprecise language version");
  red(() => assertPlatformSubject(subject({ deviceModel: "A B" })), "a malformed device model");
  red(() => assertPlatformSubject(subject({ deviceRef: "A B" })), "a malformed device reference");
  red(() => assertPlatformSubject(subject({ entitlements: ["keychain-access-groups"] })), "a missing attestation entitlement");
  red(() => assertPlatformSubject(subject({ entitlements: [] })), "an entitlement-free subject");

  // The live probe outranks the admitted claim: a subject that says "device" while the bridge
  // answers "simulator" describes a different device than the one responding.
  const simulator = new FakeSecureEnclaveBridge();
  simulator.environment = "simulator";
  const registry = new KeyRegistry();
  const run = runProvisioning({ subject: subject(), policy: policy(), bridge: simulator, registry, epoch: EPOCH });
  ok(run.receipt.outcome === "UNSUPPORTED_HARDWARE", `a simulator probe reported ${run.receipt.outcome}`);
  ok(run.key === null, "a simulator probe registered a key");
  ok(registry.get(KEY_ID) === null, "a simulator probe left a key in the registry");
}

// SEC-SE-002. Non-exportability. The interface has no export route at all, and a key the
// platform describes as exportable did not come from the enclave whatever else it reported.
function nonExportability(): void {
  const exportable = new FakeSecureEnclaveBridge();
  exportable.exportable = true;
  const first = new KeyRegistry();
  const exported = runProvisioning({ subject: subject(), policy: policy(), bridge: exportable, registry: first, epoch: EPOCH });
  ok(exported.receipt.outcome === "UNSUPPORTED_HARDWARE", `an exportable key reported ${exported.receipt.outcome}`);
  ok(first.get(KEY_ID) === null, "an exportable key was registered");

  const software = new FakeSecureEnclaveBridge();
  software.backing = "software";
  const second = new KeyRegistry();
  const fallback = runProvisioning({ subject: subject(), policy: policy(), bridge: software, registry: second, epoch: EPOCH });
  ok(fallback.receipt.outcome === "UNSUPPORTED_HARDWARE", `a software-backed key reported ${fallback.receipt.outcome}`);
  ok(second.get(KEY_ID) === null, "a software-backed key was registered");

  // The structural half of the property, checked by the type checker rather than at runtime: a
  // future edit that adds an export route to the bridge or a private field to the created key
  // fails to compile instead of failing a test somebody can delete.
  type Forbids<T, K extends string> = K extends keyof T ? never : true;
  const bridgeHasNoExport: Forbids<SecureEnclaveBridge, "exportKey" | "privateKey" | "serializeKey"> = true;
  const keyHasNoPrivateMaterial: Forbids<CreatedKey, "privateKey" | "privateKeyPem" | "secret"> = true;
  void bridgeHasNoExport;
  void keyHasNoPrivateMaterial;
}

// SEC-SE-003. Access control, both at creation and at signing time.
function accessControl(): void {
  assertAccessControlPolicy(policy());

  red(() => assertAccessControlPolicy(policy({ userPresenceRequired: false })), "a policy without user presence");
  red(() => assertAccessControlPolicy(policy({ biometry: "none" })), "a policy without biometry");
  red(() => assertAccessControlPolicy(policy({ biometry: "any-biometry" })), "a policy that survives a new enrolment");
  red(() => assertAccessControlPolicy(policy({ accessGroup: "com.example.agentshield" })), "an access group without a team prefix");
  red(() => assertAccessControlPolicy(policy({ accessibility: "when-unlocked" })), "a key that survives a backup restore");
  red(() => assertAccessControlPolicy(policy({ accessibility: "always" })), "a key readable while locked");
  red(() => assertAccessControlPolicy(policy({ policyId: "A B" })), "a malformed policy identifier");

  // Signing without the local authorization the policy requires.
  const unauthorized = new FakeSecureEnclaveBridge();
  unauthorized.presenceSatisfied = false;
  unauthorized.presenceMethod = null;
  const denied = signOnce({}, unauthorized);
  ok(denied.outcome === "AUTH_FAILED", `an unauthorized signature reported ${denied.outcome}`);
  ok(denied.evidence === null, "an unauthorized signature emitted evidence");

  // A method the policy did not admit is refused even when the device reports success.
  const passcodeOnly = new FakeSecureEnclaveBridge();
  passcodeOnly.presenceMethod = "device-passcode";
  const registry = new KeyRegistry();
  runProvisioning({ subject: subject(), policy: policy(), bridge: passcodeOnly, registry, epoch: EPOCH });
  const refused = runSigning({
    subject: subject(),
    policy: policy({ devicePasscodeFallback: false }),
    challenge: challenge(),
    bound: BOUND,
    bridge: passcodeOnly,
    registry,
    nowEpochMs: NOW,
  }).receipt;
  ok(refused.outcome === "AUTH_FAILED", `an unadmitted fallback reported ${refused.outcome}`);
}

// SEC-SE-004. Challenge binding and anti-replay.
function challengeBinding(): void {
  const green = signOnce();
  ok(green.outcome === "ACTIVE", `the bound challenge reported ${green.outcome}`);
  ok(green.evidence !== null, "the bound challenge emitted no evidence");

  const mismatches: [string, Partial<EnclaveChallenge>][] = [
    ["another intent", { intentDigest: "e".repeat(64) }],
    ["another policy epoch", { policyEpoch: EPOCH + 1 }],
    ["another audience", { audience: "agent-shield.other" }],
    ["another device", { deviceRef: "other-iphone" }],
    ["an unregistered key", { keyId: "se-key-unknown" }],
    ["a short nonce", { nonce: "short" }],
    ["an unaddressed intent", { intentDigest: "not-a-digest" }],
    ["an inverted validity window", { issuedAtEpochMs: EXPIRES, expiresAtEpochMs: ISSUED }],
    ["a fractional validity window", { expiresAtEpochMs: EXPIRES + 0.5 }],
  ];
  for (const [label, overrides] of mismatches) {
    const receipt = signOnce(overrides);
    ok(receipt.outcome === "AUTH_FAILED", `${label} reported ${receipt.outcome}`);
    ok(receipt.evidence === null, `${label} emitted evidence`);
  }

  const stale = signOnce({}, new FakeSecureEnclaveBridge(), EXPIRES);
  ok(stale.outcome === "CHALLENGE_EXPIRED", `a stale challenge reported ${stale.outcome}`);

  // Two pairs of rules share a fixture unless the fixture is shaped to separate them, and the
  // plant check found both pairs: disabling either of the two rules below left the suite green
  // because a neighbour was catching its control.
  //
  // The device binding is checked twice for different reasons -- against the device this
  // process is running on, and against the device the key was registered to. Only a challenge
  // that matches the registered key but not the running subject tells them apart, which is
  // exactly the shape of evidence produced on one device and presented on another.
  const state2 = provisioned(new FakeSecureEnclaveBridge());
  const foreign = runSigning({
    subject: subject({ deviceRef: "other-iphone" }),
    policy: policy(),
    challenge: challenge({ nonce: "7".repeat(32) }),
    bound: BOUND,
    bridge: state2.bridge,
    registry: state2.registry,
    nowEpochMs: NOW,
  }).receipt;
  ok(foreign.outcome === "AUTH_FAILED", `a challenge for another running device reported ${foreign.outcome}`);

  // The intent binding is likewise checked for shape and for equality. Binding the caller's
  // expectation to the same malformed value leaves only the shape rule able to fire.
  const shapeless = runSigning({
    subject: subject(),
    policy: policy(),
    challenge: challenge({ nonce: "8".repeat(32), intentDigest: "not-a-digest" }),
    bound: { ...BOUND, intentDigest: "not-a-digest" },
    bridge: state2.bridge,
    registry: state2.registry,
    nowEpochMs: NOW,
  }).receipt;
  ok(shapeless.outcome === "AUTH_FAILED", `an unaddressed intent reported ${shapeless.outcome}`);

  // Replay: the same nonce against the same key, on a registry that has already spent it.
  const bridge = new FakeSecureEnclaveBridge();
  const state = provisioned(bridge);
  const first = signOnce({}, state.bridge, NOW, state.registry);
  ok(first.outcome === "ACTIVE", `the first use reported ${first.outcome}`);
  const replayed = signOnce({}, state.bridge, NOW, state.registry);
  ok(replayed.outcome === "REPLAY_REFUSED", `a replayed nonce reported ${replayed.outcome}`);

  // A different nonce against the same key still works: the ledger is scoped, not a lockout.
  const fresh = signOnce({ nonce: "b".repeat(32) }, state.bridge, NOW, state.registry);
  ok(fresh.outcome === "ACTIVE", `a fresh nonce reported ${fresh.outcome}`);

  // The bridge answered a challenge nobody asked.
  const wrongChallenge = new FakeSecureEnclaveBridge();
  wrongChallenge.signedNonceOverride = "c".repeat(32);
  const crossed = signOnce({}, wrongChallenge);
  ok(crossed.outcome === "SIGN_FAILED", `a crossed signature reported ${crossed.outcome}`);

  const wrongKey = new FakeSecureEnclaveBridge();
  wrongKey.signedKeyOverride = "se-key-other";
  ok(signOnce({}, wrongKey).outcome === "SIGN_FAILED", "a signature from another key was admitted");

  const unaddressed = new FakeSecureEnclaveBridge();
  unaddressed.signatureSha256 = "not-a-digest";
  ok(signOnce({}, unaddressed).outcome === "SIGN_FAILED", "an unaddressed signature was admitted");
}

// SEC-SE-005. A verifier that rejects forged key, device, intent and epoch metadata.
function evidenceAuthenticity(): void {
  const bridge = new FakeSecureEnclaveBridge();
  const state = provisioned(bridge);
  const receipt = signOnce({}, state.bridge, NOW, state.registry);
  const evidence = receipt.evidence as HardwareEvidence;

  ok(verifyHardwareEvidence(evidence, state.registry, BOUND) === null, "genuine evidence was refused");

  const forgeries: [string, HardwareEvidence][] = [
    ["a substituted public key", { ...evidence, publicKeySha256: "9".repeat(64) }],
    ["a substituted device", { ...evidence, deviceRef: "other-iphone" }],
    ["an unregistered key", { ...evidence, keyId: "se-key-unknown" }],
    ["an unaddressed signature", { ...evidence, signatureSha256: "not-a-digest" }],
    ["an unaddressed attestation", { ...evidence, attestationSha256: "not-a-digest" }],
  ];
  for (const [label, forged] of forgeries) {
    ok(verifyHardwareEvidence(forged, state.registry, BOUND) !== null, `${label} was admitted`);
  }
  ok(verifyHardwareEvidence(evidence, state.registry, { ...BOUND, intentDigest: "e".repeat(64) }) !== null, "cross-intent evidence was admitted");
  ok(verifyHardwareEvidence(evidence, state.registry, { ...BOUND, policyEpoch: EPOCH + 1 }) !== null, "cross-epoch evidence was admitted");
}

// SEC-SE-006. Rotation and revocation invalidate the outgoing key and its evidence.
function lifecycleRotation(): void {
  const bridge = new FakeSecureEnclaveBridge();
  const state = provisioned(bridge);
  const evidence = signOnce({}, state.bridge, NOW, state.registry).evidence as HardwareEvidence;
  ok(verifyHardwareEvidence(evidence, state.registry, BOUND) === null, "evidence was refused before revocation");

  // Without a human admit the rotation parks and changes nothing.
  const parked = runRotation({
    subject: subject(), keyId: KEY_ID, fromEpoch: EPOCH, toEpoch: EPOCH + 1,
    bridge: state.bridge, registry: state.registry, humanApprovalRef: null,
  }).receipt;
  ok(parked.outcome === "ROTATING", `an unapproved rotation reported ${parked.outcome}`);
  ok(state.registry.get(KEY_ID)?.revokedFromEpoch === null, "an unapproved rotation revoked the key");
  ok(verifyHardwareEvidence(evidence, state.registry, BOUND) === null, "an unapproved rotation invalidated evidence");

  red(() => runRotation({
    subject: subject(), keyId: KEY_ID, fromEpoch: EPOCH, toEpoch: EPOCH,
    bridge: state.bridge, registry: state.registry, humanApprovalRef: "admit-1",
  }), "a rotation that does not advance the epoch");

  const rotated = runRotation({
    subject: subject(), keyId: KEY_ID, fromEpoch: EPOCH, toEpoch: EPOCH + 1,
    bridge: state.bridge, registry: state.registry, humanApprovalRef: "admit-1",
  }).receipt;
  ok(rotated.outcome === "REVOKED", `an approved rotation reported ${rotated.outcome}`);

  // Evidence bound to the epoch the revocation names is no longer admissible, and a challenge
  // at that epoch cannot produce new evidence either.
  ok(verifyHardwareEvidence({ ...evidence, policyEpoch: EPOCH + 1 }, state.registry, { ...BOUND, policyEpoch: EPOCH + 1 }) !== null, "revoked evidence was admitted");
  const afterRevocation = runSigning({
    subject: subject(), policy: policy(), challenge: challenge({ nonce: "f".repeat(32), policyEpoch: EPOCH + 1 }),
    bound: { ...BOUND, policyEpoch: EPOCH + 1 }, bridge: state.bridge, registry: state.registry, nowEpochMs: NOW,
  }).receipt;
  ok(afterRevocation.outcome === "REVOKED", `a revoked key reported ${afterRevocation.outcome}`);

  // Evidence from before the revocation epoch stays admissible: revocation names an epoch, it
  // does not rewrite history.
  ok(verifyHardwareEvidence(evidence, state.registry, BOUND) === null, "pre-revocation evidence was retroactively refused");

  // An approved rotation on a device that cannot confirm the revocation. The revocation path
  // had this control and the rotation path did not, which the plant check caught: the branch
  // was reachable in production and unreachable in the suite.
  const stuck = new FakeSecureEnclaveBridge();
  const stuckState = provisioned(stuck);
  stuck.revokes = false;
  const stalled = runRotation({
    subject: subject(), keyId: KEY_ID, fromEpoch: EPOCH, toEpoch: EPOCH + 1,
    bridge: stuckState.bridge, registry: stuckState.registry, humanApprovalRef: "admit-7",
  }).receipt;
  ok(stalled.outcome === "RECOVERY_REQUIRED", `a rotation the device refused reported ${stalled.outcome}`);
  ok(stuckState.registry.get(KEY_ID)?.revokedFromEpoch === null, "a refused rotation was recorded as done");

  // A standalone revocation still needs its human admit.
  const solo = provisioned(new FakeSecureEnclaveBridge());
  red(() => runRevocation({
    subject: subject(), keyId: KEY_ID, fromEpoch: EPOCH, toEpoch: EPOCH + 1,
    bridge: solo.bridge, registry: solo.registry, humanApprovalRef: null,
  }), "an unapproved revocation");
  const revoked = runRevocation({
    subject: subject(), keyId: KEY_ID, fromEpoch: EPOCH, toEpoch: EPOCH + 1,
    bridge: solo.bridge, registry: solo.registry, humanApprovalRef: "admit-2",
  }).receipt;
  ok(revoked.outcome === "REVOKED", `an approved revocation reported ${revoked.outcome}`);
}

// SEC-SE-007. No biometric result, key material or device secret reaches a receipt. The fake
// bridge plants a canary inside the attestation blob so a redaction that stops working turns
// this red rather than quiet.
function privacy(): void {
  const sealed = new SealedAttestation(`attestation:${PLANTED_SECRET}`);

  ok(sealed.toJSON() === REDACTED, "toJSON leaked the attestation");
  ok(sealed.toString() === REDACTED, "toString leaked the attestation");
  ok(`${sealed}` === REDACTED, "template interpolation leaked the attestation");
  ok(String(sealed) === REDACTED, "String() leaked the attestation");
  ok(JSON.stringify(sealed) === `"${REDACTED}"`, "JSON serialization leaked the attestation");
  ok(JSON.stringify({ sealed }).includes(PLANTED_SECRET) === false, "nested serialization leaked the attestation");
  ok((sealed as unknown as Record<symbol, () => string>)[Symbol.for("nodejs.util.inspect.custom")]() === REDACTED, "the inspect hook leaked the attestation");
  ok(Object.values(sealed).some((value) => String(value).includes(PLANTED_SECRET)) === false, "an own property leaked the attestation");
  // The digest is a public fact and stays reachable, and the bytes are still usable inside a
  // scoped call. A wrapper that redacted everything would be unusable rather than safe.
  ok(/^[a-f0-9]{64}$/.test(sealed.sha256), "the attestation digest is absent");
  ok(sealed.use((value) => value.includes(PLANTED_SECRET)), "the scoped accessor could not reach the bytes");
  ok(sealed.byteLength > 0, "the attestation length is absent");

  const bridge = new FakeSecureEnclaveBridge();
  const state = provisioned(bridge);
  const signing = signOnce({}, state.bridge, NOW, state.registry);
  const rotation = runRotation({
    subject: subject(), keyId: KEY_ID, fromEpoch: EPOCH, toEpoch: EPOCH + 1,
    bridge: state.bridge, registry: state.registry, humanApprovalRef: null,
  }).receipt;
  const provisioning = runProvisioning({
    subject: subject(), policy: policy(), bridge: new FakeSecureEnclaveBridge(), registry: new KeyRegistry(), epoch: EPOCH,
  }).receipt;

  for (const [label, receipt] of [["signing", signing], ["rotation", rotation], ["provisioning", provisioning]] as const) {
    const text = JSON.stringify(receipt);
    ok(text.includes(PLANTED_SECRET) === false, `the ${label} receipt carried the planted secret`);
    ok(text.includes("attestation:") === false, `the ${label} receipt carried a raw attestation blob`);
  }
  // The presence method is a policy class, not a biometric outcome: the receipt may say which
  // control was used and may never say what it measured. `PresenceMethod` has exactly two
  // members and neither is a measurement, so there is nothing here to redact.
  ok(signing.evidence?.presenceMethod === "biometry", "the presence method is absent from the evidence");
}

// SEC-SE-008. Cleanup accounting and human-owned recovery.
function cleanupAndRecovery(): void {
  const leakedChallenge = new FakeSecureEnclaveBridge();
  const state = provisioned(leakedChallenge);
  leakedChallenge.retainedChallengeCount = 1;
  const leaked = signOnce({}, state.bridge, NOW, state.registry);
  ok(leaked.outcome === "FAILED_CLEANUP", `a retained challenge reported ${leaked.outcome}`);
  ok(leaked.sessionsCleared === false, "a retained challenge was reported as cleared");
  // The evidence was genuinely produced, so it is preserved rather than discarded: a cleanup
  // failure is a separate fact from a signing failure, and collapsing them loses one of them.
  ok(leaked.evidence !== null, "a cleanup failure discarded produced evidence");

  const leakedSession = new FakeSecureEnclaveBridge();
  leakedSession.retainedAuthSessionCount = 1;
  const provisioning = runProvisioning({
    subject: subject(), policy: policy(), bridge: leakedSession, registry: new KeyRegistry(), epoch: EPOCH,
  }).receipt;
  ok(provisioning.outcome === "FAILED_CLEANUP", `a retained authorization session reported ${provisioning.outcome}`);

  // A device that cannot confirm revocation is the lost-device case. It must report that a
  // human recovery ceremony is required, never perform an automatic replacement.
  const lost = new FakeSecureEnclaveBridge();
  const lostState = provisioned(lost);
  lost.revokes = false;
  const recovery = runRevocation({
    subject: subject(), keyId: KEY_ID, fromEpoch: EPOCH, toEpoch: EPOCH + 1,
    bridge: lostState.bridge, registry: lostState.registry, humanApprovalRef: "admit-3",
  }).receipt;
  ok(recovery.outcome === "RECOVERY_REQUIRED", `an unconfirmed revocation reported ${recovery.outcome}`);
  ok(lostState.registry.get(KEY_ID)?.revokedFromEpoch === null, "an unconfirmed revocation was recorded as done");

  const unknownKey = runRotation({
    subject: subject(), keyId: "se-key-unknown", fromEpoch: EPOCH, toEpoch: EPOCH + 1,
    bridge: lostState.bridge, registry: lostState.registry, humanApprovalRef: "admit-4",
  }).receipt;
  ok(unknownKey.outcome === "RECOVERY_REQUIRED", `rotating an unknown key reported ${unknownKey.outcome}`);
}

// Every terminal state the issue names must be produced by a distinct fixture. A state only
// tests can construct is a state no producer emits, and this provider is the producer.
function stateSeparation(): void {
  const outcomes = new Set<SecureEnclaveOutcome>();
  const fixtures: [string, () => SecureEnclaveOutcome][] = [
    ["active", () => signOnce().outcome],
    ["absent device", () => {
      const bridge = new FakeSecureEnclaveBridge();
      bridge.available = false;
      return runProvisioning({ subject: subject(), policy: policy(), bridge, registry: new KeyRegistry(), epoch: EPOCH }).receipt.outcome;
    }],
    ["unsupported hardware", () => {
      const bridge = new FakeSecureEnclaveBridge();
      bridge.hardware = "software";
      return runProvisioning({ subject: subject(), policy: policy(), bridge, registry: new KeyRegistry(), epoch: EPOCH }).receipt.outcome;
    }],
    ["user refused", () => {
      const bridge = new FakeSecureEnclaveBridge();
      bridge.presenceCancelled = true;
      return signOnce({}, bridge).outcome;
    }],
    ["auth failed", () => {
      const bridge = new FakeSecureEnclaveBridge();
      bridge.createsKey = false;
      return runProvisioning({ subject: subject(), policy: policy(), bridge, registry: new KeyRegistry(), epoch: EPOCH }).receipt.outcome;
    }],
    ["challenge expired", () => signOnce({}, new FakeSecureEnclaveBridge(), EXPIRES).outcome],
    ["replay refused", () => {
      const state = provisioned(new FakeSecureEnclaveBridge());
      signOnce({}, state.bridge, NOW, state.registry);
      return signOnce({}, state.bridge, NOW, state.registry).outcome;
    }],
    ["sign failed", () => {
      const bridge = new FakeSecureEnclaveBridge();
      bridge.signs = false;
      return signOnce({}, bridge).outcome;
    }],
    ["rotating", () => {
      const state = provisioned(new FakeSecureEnclaveBridge());
      return runRotation({
        subject: subject(), keyId: KEY_ID, fromEpoch: EPOCH, toEpoch: EPOCH + 1,
        bridge: state.bridge, registry: state.registry, humanApprovalRef: null,
      }).receipt.outcome;
    }],
    ["revoked", () => {
      const state = provisioned(new FakeSecureEnclaveBridge());
      return runRevocation({
        subject: subject(), keyId: KEY_ID, fromEpoch: EPOCH, toEpoch: EPOCH + 1,
        bridge: state.bridge, registry: state.registry, humanApprovalRef: "admit-5",
      }).receipt.outcome;
    }],
    ["recovery required", () => {
      const bridge = new FakeSecureEnclaveBridge();
      const state = provisioned(bridge);
      bridge.revokes = false;
      return runRevocation({
        subject: subject(), keyId: KEY_ID, fromEpoch: EPOCH, toEpoch: EPOCH + 1,
        bridge: state.bridge, registry: state.registry, humanApprovalRef: "admit-6",
      }).receipt.outcome;
    }],
    ["failed cleanup", () => {
      const bridge = new FakeSecureEnclaveBridge();
      const state = provisioned(bridge);
      bridge.retainedChallengeCount = 1;
      return signOnce({}, state.bridge, NOW, state.registry).outcome;
    }],
  ];
  for (const [label, invoke] of fixtures) {
    const outcome = invoke();
    ok(outcome !== undefined, `${label} produced no outcome`);
    outcomes.add(outcome);
  }
  ok(outcomes.size === 12, `the fixtures cover ${outcomes.size} distinct outcomes, expected 12`);
}

// The transition table itself. The provider only ever builds legal traces, so disabling the
// transition guard left the whole suite green until this function existed -- the enforcement
// point was being type-checked and never executed.
function transitionLegality(): void {
  ok(validateSecureEnclaveLifecycle(["UNPROVISIONED", "ABSENT_DEVICE"]) === "ABSENT_DEVICE", "a legal trace was refused");
  ok(isSecureEnclaveOutcome("ROTATING"), "ROTATING is not recognised as an outcome");
  ok(isSecureEnclaveOutcome("SIGNED") === false, "SIGNED is treated as an outcome");

  // Signing without the states that earn it. These are the edges the issue's state machine does
  // not contain, and their absence is what makes "sign without user presence" unreachable
  // rather than merely guarded.
  red(() => assertSecureEnclaveTransition("ACTIVE", "SIGNED"), "signing straight from ACTIVE");
  red(() => assertSecureEnclaveTransition("CHALLENGE_RECEIVED", "SIGNED"), "signing without a presence check");
  red(() => assertSecureEnclaveTransition("REVOKED", "ACTIVE"), "resurrecting a revoked key");
  red(() => assertSecureEnclaveTransition("UNPROVISIONED", "ACTIVE"), "activating an unprovisioned device");

  red(() => validateSecureEnclaveLifecycle(["UNPROVISIONED", "ACTIVE"]), "a trace that skipped provisioning");
  red(() => validateSecureEnclaveLifecycle(["UNPROVISIONED", "DEVICE_CHECKED"]), "a trace that stopped short of an outcome");
  red(() => validateSecureEnclaveLifecycle(["ACTIVE"]), "a single-state trace");
}

// The evidence boundary. Nothing a deterministic run can reach is allowed to claim a device.
function evidenceBoundary(): void {
  ok(secureEnclaveProviderState.deviceKeyGeneration === "NOT_EXERCISED", "a device key generation was claimed");
  ok(secureEnclaveProviderState.userPresenceAuthorization === "NOT_EXERCISED", "a user presence authorization was claimed");
  ok(secureEnclaveProviderState.attestationVerification === "NOT_EXERCISED", "an attestation verification was claimed");
  ok(secureEnclaveProviderState.lostDeviceRecovery === "NOT_IMPLEMENTED", "a lost-device recovery was claimed");
  ok(secureEnclaveProviderState.productionSigningAuthority === "NOT_IMPLEMENTED", "a production signing authority was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const secureEnclaveNeverPasses: NeverPass<typeof secureEnclaveProviderState> = true;
void secureEnclaveNeverPasses;

platformAdmission();
nonExportability();
accessControl();
challengeBinding();
evidenceAuthenticity();
lifecycleRotation();
privacy();
cleanupAndRecovery();
stateSeparation();
transitionLegality();
evidenceBoundary();

console.log("SEC-SE GREEN: platform admission, non-exportability, access control, challenge binding, evidence authenticity, lifecycle, privacy, cleanup, transition legality");
