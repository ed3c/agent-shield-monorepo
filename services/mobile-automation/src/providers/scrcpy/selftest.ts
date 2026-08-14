import {
  FakeScrcpyPort,
  SCRCPY_ACTIONS,
  SCRCPY_KEYS,
  assertAction,
  assertAdbHostSubject,
  assertToolSubject,
  capabilityRefusal,
  physicalDeviceEvidence,
  projectScrcpySession,
  scrcpyProviderState,
  type AdbHostSubject,
  type ScrcpyAction,
  type ScrcpyCapability,
  type ScrcpyPolicy,
  type ScrcpySessionOptions,
  type ScrcpySessionRequest,
  type ScrcpyToolSubject,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`QA-SCRCPY ${message}`);
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
  ok(text.startsWith("invalid scrcpy contract: "), `${message} threw "${text}" rather than a scrcpy contract error`);
}

const NOW = 1_700_000_000_000;

const ADB_HOST: AdbHostSubject = { platformToolsVersion: "35.0.2", adbProtocolVersion: "1.0.41" };

const TOOL: ScrcpyToolSubject = {
  version: "2.7",
  sourceCommit: "5".repeat(40),
  binarySha256: "a".repeat(64),
  serverSha256: "e".repeat(64),
  license: "Apache-2.0",
  licenseSha256: "b".repeat(64),
  sbomSha256: "c".repeat(64),
  noticesSha256: "d".repeat(64),
};

function policy(overrides: Partial<ScrcpyPolicy> = {}): ScrcpyPolicy {
  return {
    maxWidth: 1_080,
    maxHeight: 2_400,
    maxBitrateKbps: 8_000,
    maxFramesPerSecond: 60,
    maxStreamSeconds: 30,
    maxActionsPerMinute: 20,
    maxTextLength: 128,
    retainFrames: false,
    maxRetainedBytes: 0,
    ...overrides,
  };
}

function capability(overrides: Partial<ScrcpyCapability> = {}): ScrcpyCapability {
  return {
    actorId: "operator-1",
    scopes: ["scrcpy.stream", "scrcpy.act"],
    leaseId: "lease-emulator-5554",
    nonce: "n".repeat(24),
    expiresAtEpochMs: NOW + 600_000,
    ...overrides,
  };
}

function action(overrides: Partial<ScrcpyAction> = {}): ScrcpyAction {
  return { kind: "tap", target: null, x: 100, y: 200, toX: null, toY: null, text: null, key: null, ...overrides };
}

function request(overrides: Partial<ScrcpySessionRequest> = {}): ScrcpySessionRequest {
  return {
    leaseId: "lease-emulator-5554",
    serial: "emulator-5554",
    targetClass: "android-emulator",
    requestedScopes: ["scrcpy.stream", "scrcpy.act"],
    actions: [action()],
    streamSeconds: 5,
    ...overrides,
  };
}

function run(overrides: Partial<ScrcpySessionRequest> = {}, tune: Partial<ScrcpySessionOptions> = {}) {
  const port = (tune.port as FakeScrcpyPort) ?? new FakeScrcpyPort();
  return {
    port,
    receipt: projectScrcpySession(request(overrides), {
      adbHost: tune.adbHost ?? ADB_HOST,
      tool: tune.tool ?? TOOL,
      policy: tune.policy ?? policy(),
      capability: tune.capability ?? capability(),
      workerId: tune.workerId ?? "worker-1",
      nowEpochMs: tune.nowEpochMs ?? NOW,
      port,
    }),
  };
}

// QA-SCRCPY-001 exact admission
function exactAdmission(): void {
  ok(run().receipt.outcome === "RELEASED", `the happy path reported ${run().receipt.outcome}`);

  red(() => assertAdbHostSubject({ ...ADB_HOST, platformToolsVersion: "latest" }), "a moving platform-tools channel");
  red(() => assertAdbHostSubject({ ...ADB_HOST, adbProtocolVersion: "" }), "an absent ADB protocol version");

  for (const [label, patch] of [
    ["a moving channel", { version: "latest" }],
    ["a mutable source ref", { sourceCommit: "main" }],
    ["a wrong binary digest", { binarySha256: "nope" }],
    ["a wrong server digest", { serverSha256: "nope" }],
    ["an unknown licence", { license: "Proprietary" as never }],
    ["an absent SBOM", { sbomSha256: "" }],
    ["absent notices", { noticesSha256: "nope" }],
  ] as const) {
    red(() => assertToolSubject({ ...TOOL, ...patch }), `${label} in the tool subject`);
  }

  // The client and the pushed server are separate artifacts; one digest for both would let a
  // swapped server ride in under a verified client.
  red(() => assertToolSubject({ ...TOOL, serverSha256: TOOL.binarySha256 }), "one digest standing for both artifacts");

  // Three distinct rules all report ABSENT_ADB. Asserting the outcome alone would let any one
  // of them cover for the others, so each names its own reason.
  const noAdb = new FakeScrcpyPort();
  noAdb.adb = { present: false, platformToolsVersion: null, adbProtocolVersion: null };
  const noAdbReceipt = run({}, { port: noAdb }).receipt;
  ok(noAdbReceipt.outcome === "ABSENT_ADB", "an absent ADB host produced a projection");
  ok(noAdbReceipt.detail.includes("no ADB host"), `the absence rule did not catch it: ${noAdbReceipt.detail}`);

  const oldTools = new FakeScrcpyPort();
  oldTools.adb = { ...oldTools.adb, platformToolsVersion: "30.0.0" };
  const oldToolsReceipt = run({}, { port: oldTools }).receipt;
  ok(oldToolsReceipt.outcome === "ABSENT_ADB", "drifted platform-tools were admitted");
  ok(oldToolsReceipt.detail.includes("platform-tools"), `the platform-tools rule did not catch it: ${oldToolsReceipt.detail}`);

  const oldProtocol = new FakeScrcpyPort();
  oldProtocol.adb = { ...oldProtocol.adb, adbProtocolVersion: "1.0.40" };
  const protocolReceipt = run({}, { port: oldProtocol }).receipt;
  ok(protocolReceipt.outcome === "ABSENT_ADB", "a drifted ADB protocol was admitted");
  ok(protocolReceipt.detail.includes("protocol"), `the protocol rule did not catch it: ${protocolReceipt.detail}`);

  // Likewise the three TOOL_REFUSED rules.
  const noTool = new FakeScrcpyPort();
  noTool.toolInstalled = false;
  const noToolReceipt = run({}, { port: noTool }).receipt;
  ok(noToolReceipt.outcome === "TOOL_REFUSED", "an absent scrcpy was admitted");
  ok(noToolReceipt.detail.includes("not installed"), `the installation rule did not catch it: ${noToolReceipt.detail}`);

  const oldTool = new FakeScrcpyPort();
  oldTool.toolVersion = "1.25";
  const oldToolReceipt = run({}, { port: oldTool }).receipt;
  ok(oldToolReceipt.outcome === "TOOL_REFUSED", "a version-drifted scrcpy was admitted");
  ok(oldToolReceipt.detail.includes("version"), `the version rule did not catch it: ${oldToolReceipt.detail}`);

  // The control the issue names: a mutable installer left a binary at the right version that
  // is not the artifact that was admitted. Version agreement alone would wave it through.
  const swapped = new FakeScrcpyPort();
  swapped.toolBinarySha256 = "f".repeat(64);
  const swappedReceipt = run({}, { port: swapped }).receipt;
  ok(swappedReceipt.outcome === "TOOL_REFUSED", `a swapped binary at the admitted version reported ${swappedReceipt.outcome}`);
  ok(swappedReceipt.detail.includes("artifact"), `the artifact rule did not catch it: ${swappedReceipt.detail}`);
}

// QA-SCRCPY-002 target lease
function targetLease(): void {
  const foreign = new FakeScrcpyPort();
  foreign.leaseOverride = { ownerWorkerId: "worker-2" };
  const foreignReceipt = run({}, { port: foreign }).receipt;
  ok(foreignReceipt.outcome === "LEASE_REFUSED", "a lease owned by another worker was spent");
  ok(foreignReceipt.detail.includes("another worker"), `the owner rule did not catch it: ${foreignReceipt.detail}`);

  const otherSerial = new FakeScrcpyPort();
  otherSerial.leaseOverride = { serial: "emulator-5556" };
  const otherSerialReceipt = run({}, { port: otherSerial }).receipt;
  ok(otherSerialReceipt.outcome === "LEASE_REFUSED", "a lease for another serial was spent");
  ok(otherSerialReceipt.detail.includes("another target"), `the serial rule did not catch it: ${otherSerialReceipt.detail}`);

  // A duplicate lease id is refused here rather than later by the capability binding, which
  // would report the same outcome for a different reason.
  const otherLease = new FakeScrcpyPort();
  otherLease.leaseOverride = { leaseId: "lease-somebody-else" };
  const otherLeaseReceipt = run({}, { port: otherLease }).receipt;
  ok(otherLeaseReceipt.outcome === "LEASE_REFUSED", "a lease the request did not name was spent");
  ok(otherLeaseReceipt.detail.includes("names a different lease"), `the lease-id rule did not catch it: ${otherLeaseReceipt.detail}`);

  const otherClass = new FakeScrcpyPort();
  otherClass.leaseOverride = { targetClass: "android-device" };
  const otherClassReceipt = run({}, { port: otherClass }).receipt;
  ok(otherClassReceipt.outcome === "LEASE_REFUSED", "a device lease satisfied an emulator request");
  ok(otherClassReceipt.detail.includes("target class"), `the class rule did not catch it: ${otherClassReceipt.detail}`);

  const none = new FakeScrcpyPort();
  none.targetAvailable = false;
  ok(run({}, { port: none }).receipt.outcome === "ABSENT_TARGET", "an absent target was not reported as absent");

  // A serial is never a path, a URL or a host:port that could redirect the ADB client.
  for (const serial of ["../etc", "http://elsewhere", "host:5555", "ab"]) {
    ok(run({ serial }).receipt.outcome === "ABSENT_TARGET", `the serial ${serial} reached a lease`);
  }
}

// QA-SCRCPY-003 authenticated frames and input
function authentication(): void {
  const lease = new FakeScrcpyPort().acquire("emulator-5554", "worker-1");
  ok(lease !== null, "the fixture port refused to lease");

  for (const [label, patch] of [
    ["a capability for another lease", { leaseId: "lease-other" }],
    ["a guessable nonce", { nonce: "abc" }],
    ["an expired capability", { expiresAtEpochMs: NOW - 1 }],
  ] as const) {
    ok(capabilityRefusal(capability(patch), lease, ["scrcpy.stream"], NOW) !== null, `${label} was accepted`);
  }
  ok(capabilityRefusal(capability(), lease, ["scrcpy.stream", "scrcpy.act"], NOW) === null, "a valid capability was refused");
  ok(capabilityRefusal(capability(), { ...lease, expiresAtEpochMs: NOW - 1 }, [], NOW) !== null, "an expired lease was accepted");

  // The control: an anonymous request that merely reached the port. Reaching it is not
  // authorisation, and a watcher cannot escalate into injecting input.
  const readOnly = run({}, { capability: capability({ scopes: ["scrcpy.stream"] }) }).receipt;
  ok(readOnly.outcome === "AUTH_REFUSED", `a read-only capability injected input and reported ${readOnly.outcome}`);
  ok(readOnly.detail.includes("scrcpy.act"), "the refusal did not name the missing scope");

  ok(run({ requestedScopes: ["scrcpy.stream"] }).receipt.outcome === "AUTH_REFUSED", "input ran without the act scope on the request");
  ok(run({ requestedScopes: [], streamSeconds: 0 }).receipt.outcome === "AUTH_REFUSED", "an unscoped session injected input");
}

// QA-SCRCPY-004 bounded input
function boundedInput(): void {
  const bounds = policy();
  for (const [label, patch] of [
    ["an off-screen x", { x: 1_080 }],
    ["a negative y", { y: -1 }],
    ["a fractional coordinate", { x: 10.5 }],
    ["a tap carrying text", { text: "hello" }],
    ["a tap carrying a key", { key: "home" as const }],
    ["a tap carrying a destination", { toX: 5, toY: 5 }],
  ] as const) {
    red(() => assertAction(action(patch), bounds), `${label}`);
  }

  red(() => assertAction(action({ kind: "swipe", toX: null, toY: null }), bounds), "a swipe without a destination");
  red(() => assertAction(action({ kind: "type-text", x: null, y: null, text: "x".repeat(129) }), bounds), "over-long text");
  red(() => assertAction(action({ kind: "type-text", x: null, y: null, text: "a\nb" }), bounds), "text carrying a newline");
  red(() => assertAction(action({ kind: "type-text", x: null, y: null, text: null }), bounds), "type-text without text");
  red(() => assertAction(action({ kind: "type-text", text: "hi", x: 1, y: 2 }), bounds), "type-text carrying coordinates");
  red(() => assertAction(action({ kind: "press-key", x: null, y: null, key: null }), bounds), "press-key without a key");
  red(() => assertAction(action({ kind: "press-key", x: null, y: null, key: "power" as never }), bounds), "an unadmitted key");
  red(() => assertAction(action({ kind: "press-key", key: "home", x: 1, y: 2 }), bounds), "press-key carrying coordinates");
  red(() => assertAction(action({ kind: "adb-shell" as never, x: null, y: null }), bounds), "an unadmitted action kind");

  ok(assertAction(action(), bounds).kind === "tap", "a well-formed tap was rejected");
  ok(assertAction(action({ kind: "swipe", toX: 20, toY: 30 }), bounds).kind === "swipe", "a well-formed swipe was rejected");

  // The control the issue names: exposing a raw ADB command. There is no field it could
  // occupy -- no command, argv, path or URL -- so this is a property of the type, not a filter.
  const fields = Object.keys(action()).sort().join(",");
  ok(fields === "key,kind,target,text,toX,toY,x,y", `the action grew a field: ${fields}`);
  ok(SCRCPY_ACTIONS.length === 4, `the admitted action set changed size to ${SCRCPY_ACTIONS.length}`);
  ok(SCRCPY_KEYS.length === 5, `the admitted key set changed size to ${SCRCPY_KEYS.length}`);
  ok(!(SCRCPY_KEYS as readonly string[]).includes("power"), "power became an admitted key");

  ok(run({ actions: Array.from({ length: 21 }, () => action()) }).receipt.outcome === "ACTION_FAILED", "an over-rate batch was accepted");
  ok(run({ actions: [action(), action({ x: 99_999 })] }).receipt.outcome === "ACTION_FAILED", "an off-screen action rode along in a batch");

  // The host may refuse an event this side considers well-formed. A partially applied batch
  // is a failure, not a success with a smaller number in it.
  const partial = new FakeScrcpyPort();
  partial.actionResult = { accepted: 2, rejected: 1, durationMs: 700, detail: "the device rejected one event" };
  const partialReceipt = run({}, { port: partial }).receipt;
  ok(partialReceipt.outcome === "ACTION_FAILED", `a partially applied batch reported ${partialReceipt.outcome}`);
  ok(partialReceipt.actionsRejected === 1 && partialReceipt.actionsAccepted === 2, "the accepted/rejected counts were dropped");
}

// QA-SCRCPY-005 frame bounds and privacy
function framePrivacy(): void {
  const clean = run().receipt;
  ok(clean.framesDelivered === 150, `the receipt delivered ${clean.framesDelivered} frames`);
  ok(clean.retainedBytes === 0, "a default session retained bytes");

  // Each bound refuses for its own reason, so a reader can tell which one a capture broke.
  for (const [label, patch, needle] of [
    ["resolution", { width: 1_081 }, "resolution"],
    ["height", { height: 2_401 }, "resolution"],
    ["bitrate", { bitrateKbps: 8_001 }, "bitrate"],
    ["frame rate", { framesPerSecond: 61 }, "frame rate"],
  ] as const) {
    const port = new FakeScrcpyPort();
    port.stats = { ...port.stats, ...patch };
    const receipt = run({}, { port }).receipt;
    ok(receipt.outcome === "STREAM_FAILED", `an over-${label} stream reported ${receipt.outcome}`);
    ok(receipt.detail.includes(needle), `the ${label} rule did not catch it: ${receipt.detail}`);
  }

  // The control the issue names: prohibited content retention. A policy that does not admit
  // retention must produce nothing on disk.
  const retaining = new FakeScrcpyPort();
  retaining.stats = { ...retaining.stats, retainedBytes: 1 };
  const retained = run({}, { port: retaining }).receipt;
  ok(retained.outcome === "STREAM_FAILED", `retention under a no-retention policy reported ${retained.outcome}`);
  ok(retained.detail.includes("does not admit retention"), `the retention rule did not catch it: ${retained.detail}`);

  // And where retention *is* admitted it is still bounded, which is a separate rule.
  const bounded = new FakeScrcpyPort();
  bounded.stats = { ...bounded.stats, retainedBytes: 4_097 };
  const over = run({}, { port: bounded, policy: policy({ retainFrames: true, maxRetainedBytes: 4_096 }) }).receipt;
  ok(over.outcome === "STREAM_FAILED", `over-bound retention reported ${over.outcome}`);
  ok(over.detail.includes("more than its admitted bytes"), `the retention bound did not catch it: ${over.detail}`);

  const within = new FakeScrcpyPort();
  within.stats = { ...within.stats, retainedBytes: 4_096 };
  const okRetention = run({}, { port: within, policy: policy({ retainFrames: true, maxRetainedBytes: 4_096 }) }).receipt;
  ok(okRetention.outcome === "RELEASED", `admitted retention reported ${okRetention.outcome}`);
  ok(okRetention.retainedBytes === 4_096, "the retained byte count was dropped from the receipt");

  // Unbounded capture: the requested and the observed duration are separately bounded.
  ok(run({ streamSeconds: 31 }).receipt.outcome === "TIMED_OUT", "an over-long stream was requested and admitted");
  const overrun = new FakeScrcpyPort();
  overrun.stats = { ...overrun.stats, durationMs: 30_001 };
  ok(run({}, { port: overrun }).receipt.outcome === "TIMED_OUT", "a stream that ran past its bound was admitted");
  ok(run({ streamSeconds: 0 }).receipt.outcome === "STREAM_FAILED", "a zero-second stream was admitted");
}

// QA-SCRCPY-006 failure separation
function failureSeparation(): void {
  const cases = [
    { label: "absent adb", tune: (p: FakeScrcpyPort) => { p.adb = { present: false, platformToolsVersion: null, adbProtocolVersion: null }; }, expected: "ABSENT_ADB" },
    { label: "refused tool", tune: (p: FakeScrcpyPort) => { p.toolInstalled = false; }, expected: "TOOL_REFUSED" },
    { label: "absent target", tune: (p: FakeScrcpyPort) => { p.targetAvailable = false; }, expected: "ABSENT_TARGET" },
    { label: "refused lease", tune: (p: FakeScrcpyPort) => { p.leaseOverride = { ownerWorkerId: "worker-9" }; }, expected: "LEASE_REFUSED" },
    { label: "start failure", tune: (p: FakeScrcpyPort) => { p.starts = false; }, expected: "START_FAILED" },
    { label: "stream failure", tune: (p: FakeScrcpyPort) => { p.streams = false; }, expected: "STREAM_FAILED" },
    { label: "action failure", tune: (p: FakeScrcpyPort) => { p.acts = false; }, expected: "ACTION_FAILED" },
    { label: "timeout", tune: (p: FakeScrcpyPort) => { p.stats = { ...p.stats, durationMs: 30_001 }; }, expected: "TIMED_OUT" },
    { label: "cleanup failure", tune: (p: FakeScrcpyPort) => { p.releases = false; }, expected: "FAILED_CLEANUP" },
  ] as const;

  for (const item of cases) {
    const port = new FakeScrcpyPort();
    item.tune(port);
    const receipt = run({}, { port }).receipt;
    // Pinning each fixture to its own outcome settles "no device is never a PASS" at the same
    // time: none of these nine values is RELEASED, and the compiler knows it afterwards.
    ok(receipt.outcome === item.expected, `${item.label} reported ${receipt.outcome}, expected ${item.expected}`);
  }
  ok(new Set(cases.map((item) => item.expected)).size === 9, "the failure fixtures stopped covering nine distinct outcomes");
}

// QA-SCRCPY-007 cleanup
function cleanup(): void {
  const { port, receipt } = run();
  ok(receipt.leaseReleased && port.released.length === 1, "a successful session did not release its lease");
  ok(receipt.forwardsCleared, "a successful session did not clear its forwards");
  ok(receipt.lifecycle.includes("RELEASED"), "a clean session never reached RELEASED");

  for (const [label, tune] of [
    ["a start failure", (p: FakeScrcpyPort) => { p.starts = false; }],
    ["a stream failure", (p: FakeScrcpyPort) => { p.streams = false; }],
    ["an action failure", (p: FakeScrcpyPort) => { p.acts = false; }],
  ] as const) {
    const port2 = new FakeScrcpyPort();
    tune(port2);
    run({}, { port: port2 });
    ok(port2.released.length === 1, `${label} skipped the lease release`);
  }

  // The controls the issue names, one at a time: a left-behind process, forward, socket or
  // temp file. Each is separately fatal, so one cannot hide behind another being clean.
  for (const [label, tune] of [
    ["an orphan process", (p: FakeScrcpyPort) => { p.retained = 1; }],
    ["an orphan forward", (p: FakeScrcpyPort) => { p.forwards = 1; }],
    ["an orphan socket", (p: FakeScrcpyPort) => { p.sockets = 1; }],
    ["a retained temp file", (p: FakeScrcpyPort) => { p.tempBytes = 1; }],
  ] as const) {
    const port3 = new FakeScrcpyPort();
    tune(port3);
    const orphaned = run({}, { port: port3 }).receipt;
    ok(orphaned.outcome === "FAILED_CLEANUP", `${label} reported ${orphaned.outcome}`);
    ok(!orphaned.lifecycle.includes("RELEASED"), `${label} still reached RELEASED`);
  }

  // `forwardsCleared` is about forwards and sockets specifically, so a retained process must
  // not flip it -- otherwise the receipt would blame the wrong resource.
  const busy = new FakeScrcpyPort();
  busy.retained = 1;
  ok(run({}, { port: busy }).receipt.forwardsCleared, "a retained process was reported as an uncleared forward");

  const forwarding = new FakeScrcpyPort();
  forwarding.forwards = 1;
  ok(!run({}, { port: forwarding }).receipt.forwardsCleared, "a retained forward was reported as cleared");
}

// QA-SCRCPY-008 emulator versus device
function targetClassEvidence(): void {
  const receipt = run().receipt;
  ok(receipt.targetClass === "android-emulator", "the receipt lost its target class");
  ok(physicalDeviceEvidence(receipt) === "NOT_EXERCISED", "an emulator session was spent as device evidence");
  ok(physicalDeviceEvidence({ ...receipt, targetClass: "android-device", outcome: "STREAM_FAILED" }) === "FAIL", "a failed device session was not reported");

  // A failed *emulator* session is not negative hardware evidence either. Reporting FAIL there
  // would be a hardware claim sourced from a machine that has no hardware.
  ok(
    physicalDeviceEvidence({ ...receipt, outcome: "STREAM_FAILED" }) === "NOT_EXERCISED",
    "a failed emulator session was spent as negative device evidence",
  );

  const leased = new FakeScrcpyPort().acquire("emulator-5554", "worker-1");
  ok(leased?.targetClass === "android-emulator", "the deterministic fake handed back a physical device");
}

function evidenceBoundary(): void {
  ok(scrcpyProviderState.emulatorProjection === "NOT_EXERCISED", "an emulator projection was claimed");
  ok(scrcpyProviderState.deviceProjection === "NOT_EXERCISED", "a device projection was claimed");
  ok(scrcpyProviderState.cloudAndroidHost === "NOT_IMPLEMENTED", "a cloud Android host was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const scrcpyNeverPasses: NeverPass<typeof scrcpyProviderState> = true;
void scrcpyNeverPasses;

exactAdmission();
targetLease();
authentication();
boundedInput();
framePrivacy();
failureSeparation();
cleanup();
targetClassEvidence();
evidenceBoundary();

console.log("SELFTEST GREEN: QA-SCRCPY exact admission, target lease, authentication, bounded input, frame privacy, failure separation, cleanup, target class");
