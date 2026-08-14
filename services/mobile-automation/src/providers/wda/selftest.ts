import {
  FakeWdaPort,
  WDA_ACTIONS,
  assertAction,
  assertHostSubject,
  assertToolchainSubject,
  capabilityRefusal,
  physicalDeviceEvidence,
  projectWdaSession,
  wdaProviderState,
  type WdaAction,
  type WdaCapability,
  type WdaHostSubject,
  type WdaPolicy,
  type WdaSessionOptions,
  type WdaSessionRequest,
  type WdaToolchainSubject,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`QA-WDA ${message}`);
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
  ok(text.startsWith("invalid wda contract: "), `${message} threw "${text}" rather than a wda contract error`);
}

const NOW = 1_700_000_000_000;

const HOST: WdaHostSubject = { platform: "darwin", osVersion: "15.3.1", xcodeVersion: "16.2", xcodeBuild: "16C5032a" };

const TOOLCHAIN: WdaToolchainSubject = {
  version: "8.12.1",
  sourceCommit: "4".repeat(40),
  artifactSha256: "a".repeat(64),
  license: "BSD-3-Clause",
  licenseSha256: "b".repeat(64),
  sbomSha256: "c".repeat(64),
  noticesSha256: "d".repeat(64),
};

function policy(overrides: Partial<WdaPolicy> = {}): WdaPolicy {
  return {
    screenWidth: 1_170,
    screenHeight: 2_532,
    maxFrameBytes: 262_144,
    maxFramesPerSecond: 15,
    maxStreamSeconds: 30,
    maxActionsPerMinute: 20,
    maxTextLength: 128,
    maxDerivedDataMb: 0,
    requireSecureFieldRedaction: true,
    ...overrides,
  };
}

function capability(overrides: Partial<WdaCapability> = {}): WdaCapability {
  return {
    actorId: "operator-1",
    scopes: ["wda.stream", "wda.act"],
    leaseId: "lease-00008110-001A2C3D4E5F6G7H",
    nonce: "n".repeat(24),
    expiresAtEpochMs: NOW + 600_000,
    ...overrides,
  };
}

function action(overrides: Partial<WdaAction> = {}): WdaAction {
  return { kind: "tap", target: null, x: 100, y: 200, toX: null, toY: null, text: null, button: null, ...overrides };
}

function request(overrides: Partial<WdaSessionRequest> = {}): WdaSessionRequest {
  return {
    leaseId: "lease-00008110-001A2C3D4E5F6G7H",
    udid: "00008110-001A2C3D4E5F6G7H",
    targetClass: "ios-simulator",
    requestedScopes: ["wda.stream", "wda.act"],
    actions: [action()],
    streamSeconds: 4,
    ...overrides,
  };
}

function run(overrides: Partial<WdaSessionRequest> = {}, tune: Partial<WdaSessionOptions> = {}) {
  const port = (tune.port as FakeWdaPort) ?? new FakeWdaPort();
  return {
    port,
    receipt: projectWdaSession(request(overrides), {
      host: tune.host ?? HOST,
      toolchain: tune.toolchain ?? TOOLCHAIN,
      policy: tune.policy ?? policy(),
      capability: tune.capability ?? capability(),
      workerId: tune.workerId ?? "worker-1",
      nowEpochMs: tune.nowEpochMs ?? NOW,
      port,
    }),
  };
}

// QA-WDA-001 host and toolchain admission
function hostAdmission(): void {
  ok(run().receipt.outcome === "RELEASED", `the happy path reported ${run().receipt.outcome}`);

  for (const [label, patch] of [
    ["a non-darwin platform", { platform: "linux" as never }],
    ["a moving Xcode channel", { xcodeVersion: "latest" }],
    ["a malformed macOS version", { osVersion: "" }],
    ["a malformed Xcode build", { xcodeBuild: "" }],
  ] as const) {
    red(() => assertHostSubject({ ...HOST, ...patch }), `${label} in the host subject`);
  }

  for (const [label, patch] of [
    ["a moving channel", { version: "latest" }],
    ["a mutable source ref", { sourceCommit: "main" }],
    ["a wrong artifact digest", { artifactSha256: "nope" }],
    ["an unknown licence", { license: "Proprietary" as never }],
    ["an absent SBOM", { sbomSha256: "" }],
    ["absent notices", { noticesSha256: "nope" }],
  ] as const) {
    red(() => assertToolchainSubject({ ...TOOLCHAIN, ...patch }), `${label} in the toolchain subject`);
  }

  // The control the issue names: a Linux runner must not be able to report a projection.
  const linux = new FakeWdaPort();
  linux.host = { platform: "linux", osVersion: null, xcodeVersion: null, xcodeBuild: null };
  ok(run({}, { port: linux }).receipt.outcome === "ABSENT_MAC_HOST", "a Linux host produced a projection");

  // That fixture is refused by whichever rule runs first, and a bare Linux host trips the
  // version rule too. So the platform rule needs a host that is wrong *only* in its platform,
  // or it would be dead code reporting somebody else's reason.
  const linuxLookalike = new FakeWdaPort();
  linuxLookalike.host = { ...linuxLookalike.host, platform: "linux" };
  const lookalike = run({}, { port: linuxLookalike }).receipt;
  ok(lookalike.outcome === "ABSENT_MAC_HOST", `a platform-only mismatch reported ${lookalike.outcome}`);
  ok(lookalike.detail.includes("not the admitted darwin"), `the platform rule did not catch it: ${lookalike.detail}`);

  const wrongOs = new FakeWdaPort();
  wrongOs.host = { ...wrongOs.host, osVersion: "14.0" };
  ok(run({}, { port: wrongOs }).receipt.outcome === "ABSENT_MAC_HOST", "a drifted macOS version was admitted");

  const wrongXcode = new FakeWdaPort();
  wrongXcode.host = { ...wrongXcode.host, xcodeBuild: "15A240d" };
  ok(run({}, { port: wrongXcode }).receipt.outcome === "ABSENT_XCODE", "a drifted Xcode build was admitted");

  const absentWda = new FakeWdaPort();
  absentWda.toolchainInstalled = false;
  ok(run({}, { port: absentWda }).receipt.outcome === "ABSENT_XCODE", "an absent WebDriverAgent was admitted");

  const driftedWda = new FakeWdaPort();
  driftedWda.toolchainVersion = "7.0.0";
  ok(run({}, { port: driftedWda }).receipt.outcome === "ABSENT_XCODE", "a version-drifted WebDriverAgent was admitted");
}

// QA-WDA-002 target lease
function targetLease(): void {
  const foreign = new FakeWdaPort();
  foreign.leaseOverride = { ownerWorkerId: "worker-2" };
  ok(run({}, { port: foreign }).receipt.outcome === "AUTH_REFUSED", "a lease owned by another worker was spent");

  const otherUdid = new FakeWdaPort();
  otherUdid.leaseOverride = { udid: "00008110-999999999999999Z" };
  ok(run({}, { port: otherUdid }).receipt.outcome === "AUTH_REFUSED", "a lease for another UDID was spent");

  // The lease-id rule and the capability's own lease binding both refuse this, and both say
  // AUTH_REFUSED. Asserting the outcome alone would let either one cover for the other, so
  // the reason is pinned: this must be caught while resolving the lease, not later.
  const otherLease = new FakeWdaPort();
  otherLease.leaseOverride = { leaseId: "lease-somebody-else" };
  const mismatched = run({}, { port: otherLease }).receipt;
  ok(mismatched.outcome === "AUTH_REFUSED", "a lease the request did not name was spent");
  ok(mismatched.detail.includes("names a different lease"), `the lease-id rule did not catch it: ${mismatched.detail}`);

  const otherClass = new FakeWdaPort();
  otherClass.leaseOverride = { targetClass: "ios-device" };
  ok(run({}, { port: otherClass }).receipt.outcome === "AUTH_REFUSED", "a device lease satisfied a simulator request");

  const none = new FakeWdaPort();
  none.targetAvailable = false;
  ok(run({}, { port: none }).receipt.outcome === "ABSENT_TARGET", "an absent target was not reported as absent");

  ok(run({ udid: "short" }).receipt.outcome === "ABSENT_TARGET", "a malformed UDID reached a lease");
}

// QA-WDA-003 authenticated stream and action
function authentication(): void {
  const lease = new FakeWdaPort().acquire("00008110-001A2C3D4E5F6G7H", "worker-1");
  ok(lease !== null, "the fixture port refused to lease");

  for (const [label, patch] of [
    ["a capability for another lease", { leaseId: "lease-other" }],
    ["a guessable nonce", { nonce: "abc" }],
    ["an expired capability", { expiresAtEpochMs: NOW - 1 }],
  ] as const) {
    ok(capabilityRefusal(capability(patch), lease, ["wda.stream"], NOW) !== null, `${label} was accepted`);
  }
  ok(capabilityRefusal(capability(), lease, ["wda.stream", "wda.act"], NOW) === null, "a valid capability was refused");

  // An expired *lease* is separately fatal, so a live token cannot outlive its target.
  ok(capabilityRefusal(capability(), { ...lease, expiresAtEpochMs: NOW - 1 }, [], NOW) !== null, "an expired lease was accepted");

  // The control: an unauthenticated request. Read-only cannot escalate into acting.
  const readOnly = run({}, { capability: capability({ scopes: ["wda.stream"] }) }).receipt;
  ok(readOnly.outcome === "AUTH_REFUSED", `a read-only capability drove the UI and reported ${readOnly.outcome}`);
  ok(readOnly.detail.includes("wda.act"), "the refusal did not name the missing scope");

  // Acting without asking for the scope at all is refused at the request boundary too.
  const unscoped = run({ requestedScopes: ["wda.stream"] }).receipt;
  ok(unscoped.outcome === "AUTH_REFUSED", "actions ran without the act scope on the request");

  // And a stream-scoped session that asks for no stream still may not act unscoped.
  ok(run({ requestedScopes: [], actions: [action()], streamSeconds: 0 }).receipt.outcome === "AUTH_REFUSED", "an unscoped session acted");
}

// QA-WDA-004 bounded actions
function boundedActions(): void {
  const bounds = policy();
  for (const [label, patch] of [
    ["an off-screen x", { x: 1_170 }],
    ["a negative y", { y: -1 }],
    ["a fractional coordinate", { x: 10.5 }],
    ["a tap carrying text", { text: "hello" }],
    ["a tap carrying a button", { button: "home" as const }],
    ["a tap carrying a destination", { toX: 5, toY: 5 }],
  ] as const) {
    red(() => assertAction(action(patch), bounds), `${label}`);
  }

  red(() => assertAction(action({ kind: "swipe", toX: null, toY: null }), bounds), "a swipe without a destination");
  // A coordinate on an action that has no coordinates is not harmless noise: it is the field
  // a caller would reach for to aim a press somewhere the action was never meant to go.
  red(() => assertAction(action({ kind: "type-text", text: "hi", x: 10, y: 20 }), bounds), "type-text carrying coordinates");
  red(() => assertAction(action({ kind: "press-button", button: "home", x: 10, y: 20 }), bounds), "press-button carrying coordinates");
  red(() => assertAction(action({ kind: "type-text", x: null, y: null, text: "x".repeat(129) }), bounds), "over-long text");
  red(() => assertAction(action({ kind: "type-text", x: null, y: null, text: "a\nb" }), bounds), "text carrying a newline");
  red(() => assertAction(action({ kind: "type-text", x: null, y: null, text: null }), bounds), "type-text without text");
  red(() => assertAction(action({ kind: "press-button", x: null, y: null, button: null }), bounds), "press-button without a button");
  red(() => assertAction(action({ kind: "press-button", x: null, y: null, button: "reboot" as never }), bounds), "an unadmitted button");
  red(() => assertAction(action({ kind: "run-xctest" as never, x: null, y: null }), bounds), "an unadmitted action kind");

  ok(assertAction(action(), bounds).kind === "tap", "a well-formed tap was rejected");
  ok(assertAction(action({ kind: "swipe", toX: 20, toY: 30 }), bounds).kind === "swipe", "a well-formed swipe was rejected");

  // The surface is closed by the type. There is no field an XCTest method name or a shell
  // command could arrive in, so the generic-passthrough control has nowhere to land.
  const fields = Object.keys(action()).sort().join(",");
  ok(fields === "button,kind,target,text,toX,toY,x,y", `the action grew a field: ${fields}`);
  ok(WDA_ACTIONS.length === 4, `the admitted action set changed size to ${WDA_ACTIONS.length}`);

  // Rate is enforced on the batch.
  const many = Array.from({ length: 21 }, () => action());
  ok(run({ actions: many }).receipt.outcome === "ACTION_FAILED", "an over-rate batch was accepted");

  // A malformed action inside an otherwise valid batch fails the session, not just the action.
  ok(run({ actions: [action(), action({ x: 99_999 })] }).receipt.outcome === "ACTION_FAILED", "an off-screen action rode along in a batch");

  // The host may also refuse an action this side considers well-formed -- an element that is
  // not on screen, a target that stopped responding. A partially applied batch is a failure,
  // not a success with a smaller number in it.
  const partial = new FakeWdaPort();
  partial.actionResult = { accepted: 2, rejected: 1, durationMs: 900, detail: "the host rejected one action" };
  const partialReceipt = run({}, { port: partial }).receipt;
  ok(partialReceipt.outcome === "ACTION_FAILED", `a partially applied batch reported ${partialReceipt.outcome}`);
  ok(partialReceipt.actionsRejected === 1, "the rejected count was dropped from the receipt");
  ok(partialReceipt.actionsAccepted === 2, "the accepted count was dropped from the receipt");
}

// QA-WDA-005 frame bounds and privacy
function framePrivacy(): void {
  const clean = run().receipt;
  ok(clean.framesDelivered === 2, `the receipt delivered ${clean.framesDelivered} frames`);

  const oversized = new FakeWdaPort();
  oversized.stream_ = { ...oversized.stream_, frames: [{ sequence: 1, bytes: 262_145, sha256: "a".repeat(64), secureFieldsPresent: false, redacted: false }] };
  ok(run({}, { port: oversized }).receipt.outcome === "STREAM_FAILED", "an oversized frame was accepted");

  const unaddressed = new FakeWdaPort();
  unaddressed.stream_ = { ...unaddressed.stream_, frames: [{ sequence: 1, bytes: 1_024, sha256: "not-a-digest", secureFieldsPresent: false, redacted: false }] };
  ok(run({}, { port: unaddressed }).receipt.outcome === "STREAM_FAILED", "a frame without a digest was accepted");

  const fast = new FakeWdaPort();
  fast.stream_ = { ...fast.stream_, framesPerSecond: 16 };
  ok(run({}, { port: fast }).receipt.outcome === "STREAM_FAILED", "an over-rate stream was accepted");

  // The control the issue names: capturing a prohibited screen.
  const leaking = new FakeWdaPort();
  leaking.stream_ = { ...leaking.stream_, frames: [{ sequence: 1, bytes: 1_024, sha256: "a".repeat(64), secureFieldsPresent: true, redacted: false }] };
  const leaked = run({}, { port: leaking }).receipt;
  ok(leaked.outcome === "STREAM_FAILED", `an unredacted secure field reported ${leaked.outcome}`);
  ok(leaked.detail.includes("secure field"), "the refusal did not name the secure field");

  // Unbounded capture: both the request and the observed duration are held to the policy.
  ok(run({ streamSeconds: 31 }).receipt.outcome === "TIMED_OUT", "an over-long stream was requested and admitted");
  const overrun = new FakeWdaPort();
  overrun.stream_ = { ...overrun.stream_, durationMs: 30_001 };
  ok(run({}, { port: overrun }).receipt.outcome === "TIMED_OUT", "a stream that ran past its bound was admitted");
  ok(run({ streamSeconds: 0 }).receipt.outcome === "STREAM_FAILED", "a zero-second stream was admitted");
}

// QA-WDA-006 failure separation
function failureSeparation(): void {
  const cases = [
    { label: "absent mac host", tune: (p: FakeWdaPort) => { p.host = { platform: "linux", osVersion: null, xcodeVersion: null, xcodeBuild: null }; }, expected: "ABSENT_MAC_HOST" },
    { label: "absent xcode", tune: (p: FakeWdaPort) => { p.toolchainInstalled = false; }, expected: "ABSENT_XCODE" },
    { label: "absent target", tune: (p: FakeWdaPort) => { p.targetAvailable = false; }, expected: "ABSENT_TARGET" },
    { label: "signing refused", tune: (p: FakeWdaPort) => { p.signs = false; }, expected: "SIGNING_REFUSED" },
    { label: "build failure", tune: (p: FakeWdaPort) => { p.builds = false; }, expected: "BUILD_FAILED" },
    { label: "start failure", tune: (p: FakeWdaPort) => { p.starts = false; }, expected: "START_FAILED" },
    { label: "stream failure", tune: (p: FakeWdaPort) => { p.streams = false; }, expected: "STREAM_FAILED" },
    { label: "action failure", tune: (p: FakeWdaPort) => { p.acts = false; }, expected: "ACTION_FAILED" },
    { label: "cleanup failure", tune: (p: FakeWdaPort) => { p.releases = false; }, expected: "FAILED_CLEANUP" },
  ] as const;

  for (const item of cases) {
    const port = new FakeWdaPort();
    item.tune(port);
    const receipt = run({}, { port }).receipt;
    // Pinning each fixture to its own outcome settles "never a skip and never a pass" at the
    // same time: none of these nine values is RELEASED, and the compiler knows it afterwards.
    ok(receipt.outcome === item.expected, `${item.label} reported ${receipt.outcome}, expected ${item.expected}`);
  }
  ok(new Set(cases.map((item) => item.expected)).size === 9, "the failure fixtures stopped covering nine distinct outcomes");

  // An install failure is deliberately folded into BUILD_FAILED -- the runner never landed --
  // and that has to be a decision the fixtures pin, not an accident nobody notices.
  const noInstall = new FakeWdaPort();
  noInstall.installs = false;
  const installReceipt = run({}, { port: noInstall }).receipt;
  ok(installReceipt.outcome === "BUILD_FAILED", `an install failure reported ${installReceipt.outcome}`);
  ok(installReceipt.detail.includes("install"), "the install failure lost its cause");
}

// QA-WDA-007 cleanup
function cleanup(): void {
  const { port, receipt } = run();
  ok(receipt.leaseReleased && port.released.length === 1, "a successful session did not release its lease");
  ok(receipt.lifecycle.includes("RELEASED"), "a clean session never reached RELEASED");

  // Every exit after the lease exists releases it, including the failing ones.
  for (const [label, tune] of [
    ["a signing refusal", (p: FakeWdaPort) => { p.signs = false; }],
    ["a build failure", (p: FakeWdaPort) => { p.builds = false; }],
    ["a start failure", (p: FakeWdaPort) => { p.starts = false; }],
    ["a stream failure", (p: FakeWdaPort) => { p.streams = false; }],
    ["an action failure", (p: FakeWdaPort) => { p.acts = false; }],
  ] as const) {
    const port2 = new FakeWdaPort();
    tune(port2);
    run({}, { port: port2 });
    ok(port2.released.length === 1, `${label} skipped the lease release`);
  }

  // The controls: an orphan process, an orphan port, retained derived data.
  for (const [label, tune] of [
    ["an orphan process", (p: FakeWdaPort) => { p.retained = 1; }],
    ["an orphan port", (p: FakeWdaPort) => { p.ports = 1; }],
    ["retained derived data", (p: FakeWdaPort) => { p.derivedDataMb = 1; }],
  ] as const) {
    const port3 = new FakeWdaPort();
    tune(port3);
    const orphaned = run({}, { port: port3 }).receipt;
    ok(orphaned.outcome === "FAILED_CLEANUP", `${label} reported ${orphaned.outcome}`);
    ok(!orphaned.lifecycle.includes("RELEASED"), `${label} still reached RELEASED`);
  }

  const dirty = new FakeWdaPort();
  dirty.derivedDataMb = 1;
  ok(!run({}, { port: dirty }).receipt.derivedDataCleared, "retained derived data was reported as cleared");
}

// QA-WDA-008 simulator versus device
function targetClassEvidence(): void {
  const receipt = run().receipt;
  ok(receipt.targetClass === "ios-simulator", "the receipt lost its target class");
  ok(physicalDeviceEvidence(receipt) === "NOT_EXERCISED", "a simulator session was spent as device evidence");

  // A failed device session is real negative evidence and says so.
  ok(physicalDeviceEvidence({ ...receipt, targetClass: "ios-device", outcome: "STREAM_FAILED" }) === "FAIL", "a failed device session was not reported");

  // And the case the simulator branch actually exists for: a simulator session that *failed*
  // still says nothing about hardware. Reporting FAIL there would be a negative hardware
  // claim sourced from a machine that has no hardware -- the mirror image of a false PASS.
  ok(
    physicalDeviceEvidence({ ...receipt, outcome: "STREAM_FAILED" }) === "NOT_EXERCISED",
    "a failed simulator session was spent as negative device evidence",
  );

  // Nothing the fake can produce is a positive hardware claim: it only ever leases simulators.
  const leased = new FakeWdaPort().acquire("00008110-001A2C3D4E5F6G7H", "worker-1");
  ok(leased?.targetClass === "ios-simulator", "the deterministic fake handed back a physical device");
}

function evidenceBoundary(): void {
  ok(wdaProviderState.simulatorProjection === "NOT_EXERCISED", "a simulator projection was claimed");
  ok(wdaProviderState.deviceProjection === "NOT_EXERCISED", "a device projection was claimed");
  ok(wdaProviderState.signingIdentity === "NOT_IMPLEMENTED", "a signing identity was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const wdaNeverPasses: NeverPass<typeof wdaProviderState> = true;
void wdaNeverPasses;

hostAdmission();
targetLease();
authentication();
boundedActions();
framePrivacy();
failureSeparation();
cleanup();
targetClassEvidence();
evidenceBoundary();

console.log("SELFTEST GREEN: QA-WDA host admission, target lease, authentication, bounded actions, frame privacy, failure separation, cleanup, target class");
