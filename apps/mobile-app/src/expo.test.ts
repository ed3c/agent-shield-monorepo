import type { ProductOutcome } from "../../../packages/contracts/src/product/index.ts";
import {
  ADMITTED_TOOLCHAIN,
  FakeExpoPlatform,
  PLANTED_SECRET,
  REDACTED,
  SealedBuildLog,
  actionRefusal,
  assertActionCatalog,
  assertBuildSubject,
  assertExpoTransition,
  assertScreenCatalog,
  assertToolchain,
  combineLanes,
  expectedArtifactDigest,
  expoAdapterState,
  isExpoOutcome,
  projectViewState,
  runLane,
  runtimeImportRefusal,
  validateExpoLifecycle,
  viewToneFor,
  type BuildSubject,
  type ExpoActionDefinition,
  type ExpoActionRequest,
  type ExpoOutcome,
  type ExpoPlatformReceipt,
  type MobilePlatform,
  type ScreenTarget,
  type ShippedModule,
  type ToolchainSubject,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`UX-EXPO ${message}`);
}

// A control that only asserts "something threw" also passes when a later line throws a
// TypeError for an unrelated reason, which makes a dead guard look load-bearing under a plant
// check. Every control must fail through this adapter's own contract error.
function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid expo contract: "), `${message} threw "${text}" rather than an expo contract error`);
}

const SOURCE = "a".repeat(64);
const CONFIG = "b".repeat(64);
const RECEIPT = "c".repeat(64);

function toolchain(overrides: Partial<ToolchainSubject> = {}): ToolchainSubject {
  return { ...ADMITTED_TOOLCHAIN, ...overrides };
}

function subject(platform: MobilePlatform = "ios", overrides: Partial<BuildSubject> = {}): BuildSubject {
  return { platform, sourceSha256: SOURCE, appConfigSha256: CONFIG, toolchain: toolchain(), ...overrides };
}

const MODULES: ShippedModule[] = [
  { path: "apps/mobile-app/src/screens/home.tsx", imports: ["react", "react-native", "./state.ts"] },
  { path: "apps/mobile-app/src/screens/state.ts", imports: ["expo-constants"] },
];

const TARGETS: ScreenTarget[] = [
  { targetId: "approve-settlement", role: "button", label: "Approve settlement", critical: true },
  { targetId: "settlement-amount", role: "field", label: "Settlement amount", critical: true },
  { targetId: "receipt-list", role: "list", label: "Receipts", critical: false },
  { targetId: "status-banner", role: "region", label: "Status", critical: false },
];

const ACTIONS: ExpoActionDefinition[] = [
  { id: "settlement.approve", version: "1.0.0", targetId: "approve-settlement", allowedArgumentKeys: ["intentId"], riskClass: "privileged" },
  { id: "settlement.amount", version: "1.0.0", targetId: "settlement-amount", allowedArgumentKeys: ["amountMinor", "currency"], riskClass: "write" },
  { id: "receipts.list", version: "1.0.0", targetId: "receipt-list", allowedArgumentKeys: [], riskClass: "read" },
];

const SCREENS = assertScreenCatalog(TARGETS);
const CATALOG = assertActionCatalog(ACTIONS, SCREENS);

function request(overrides: Partial<ExpoActionRequest> = {}): ExpoActionRequest {
  return { actionId: "settlement.approve", actionVersion: "1.0.0", arguments: { intentId: "intent-1" }, ...overrides };
}

function lane(
  platform: MobilePlatform = "ios",
  adapter = new FakeExpoPlatform(),
  action: { request: ExpoActionRequest; catalog: typeof CATALOG } | null = { request: request(), catalog: CATALOG },
): ExpoPlatformReceipt {
  return runLane({ subject: subject(platform), modules: MODULES, adapter, action }).receipt;
}

// UX-EXPO-001. Bun is the tooling and Hermes or JSC is the runtime, and the app never sees Bun.
function toolchainSplit(): void {
  assertToolchain(toolchain());
  assertToolchain(toolchain({ appRuntime: "jsc" }));

  red(() => assertToolchain(toolchain({ appRuntime: "bun" })), "an app runtime of bun");
  red(() => assertToolchain(toolchain({ appRuntime: "node" })), "an app runtime of node");
  red(() => assertToolchain(toolchain({ bunVersion: "1.3" })), "an imprecise bun version");
  red(() => assertToolchain(toolchain({ typescriptVersion: "latest" })), "a moving TypeScript channel");
  red(() => assertToolchain(toolchain({ expoSdkVersion: "52" })), "an imprecise Expo SDK version");
  red(() => assertToolchain(toolchain({ reactNativeVersion: "0.76" })), "an imprecise React Native version");

  ok(runtimeImportRefusal(MODULES) === null, "the admitted module set was refused");
  // The control #48 names: runtime code that requires a Bun API. The allowlist refuses it
  // together with everything else no device runtime provides, including the API that does not
  // exist yet.
  const refusals: [string, ShippedModule[]][] = [
    ["a bun import", [{ path: "apps/mobile-app/src/a.ts", imports: ["bun"] }]],
    ["a bun subpath import", [{ path: "apps/mobile-app/src/a.ts", imports: ["bun:sqlite"] }]],
    ["a node filesystem import", [{ path: "apps/mobile-app/src/a.ts", imports: ["node:fs"] }]],
    ["a child process import", [{ path: "apps/mobile-app/src/a.ts", imports: ["node:child_process"] }]],
    ["an unrecognised package", [{ path: "apps/mobile-app/src/a.ts", imports: ["some-server-sdk"] }]],
    ["a module outside the app", [{ path: "services/runtime-fabric/src/a.ts", imports: ["react"] }]],
  ];
  for (const [label, modules] of refusals) {
    ok(runtimeImportRefusal(modules) !== null, `${label} was admitted into the shipped runtime`);
  }
  ok(runtimeImportRefusal([]) !== null, "an empty shipped runtime was admitted");

  // A build with a server-only import fails before anything is produced, not at launch.
  const bunImport = runLane({
    subject: subject(), modules: [{ path: "apps/mobile-app/src/a.ts", imports: ["node:fs"] }],
    adapter: new FakeExpoPlatform(), action: { request: request(), catalog: CATALOG },
  }).receipt;
  ok(bunImport.outcome === "BUILD_FAILED", `a server-only import reported ${bunImport.outcome}`);
  ok(bunImport.artifactSha256 === null, "a refused build produced an artifact");
}

// UX-EXPO-002. The same inputs produce the same artifact and different inputs do not.
function deterministicBuild(): void {
  ok(expectedArtifactDigest(subject()) === expectedArtifactDigest(subject()), "the artifact digest is not deterministic");

  const varied: [string, BuildSubject][] = [
    ["platform", subject("android")],
    ["source", subject("ios", { sourceSha256: "9".repeat(64) })],
    ["config", subject("ios", { appConfigSha256: "8".repeat(64) })],
    ["expo sdk", subject("ios", { toolchain: toolchain({ expoSdkVersion: "51.0.0" }) })],
    ["react native", subject("ios", { toolchain: toolchain({ reactNativeVersion: "0.75.0" }) })],
    ["typescript", subject("ios", { toolchain: toolchain({ typescriptVersion: "5.6.0" }) })],
    ["bun", subject("ios", { toolchain: toolchain({ bunVersion: "1.3.13" }) })],
    ["app runtime", subject("ios", { toolchain: toolchain({ appRuntime: "jsc" }) })],
  ];
  const base = expectedArtifactDigest(subject());
  for (const [label, changed] of varied) {
    ok(expectedArtifactDigest(changed) !== base, `changing the ${label} did not change the artifact digest`);
  }

  red(() => assertBuildSubject(subject("ios", { sourceSha256: "short" })), "an unaddressed source");
  red(() => assertBuildSubject(subject("ios", { appConfigSha256: "short" })), "an unaddressed configuration");

  // The control #48 names: a stale generated config. The build used one the subject does not.
  const stale = new FakeExpoPlatform();
  stale.builtFromConfigOverride = "7".repeat(64);
  ok(lane("ios", stale).outcome === "ARTIFACT_FAILED", "a stale configuration was admitted");

  const tampered = new FakeExpoPlatform();
  tampered.artifactDigestOverride = "6".repeat(64);
  ok(lane("ios", tampered).outcome === "ARTIFACT_FAILED", "an artifact the subject does not produce was admitted");

  const crossPlatform = new FakeExpoPlatform();
  crossPlatform.artifactPlatformOverride = "android";
  ok(lane("ios", crossPlatform).outcome === "ARTIFACT_FAILED", "a cross-platform artifact was admitted");

  const drifted = new FakeExpoPlatform();
  drifted.toolchain = toolchain({ expoSdkVersion: "51.0.0" });
  ok(lane("ios", drifted).outcome === "ABSENT_TOOLCHAIN", "a drifted host toolchain was admitted");
}

// UX-EXPO-003. Stable accessibility identity on every target a QA adapter addresses.
function accessibility(): void {
  ok(SCREENS.size === TARGETS.length, "the screen catalog lost a target");

  red(() => assertScreenCatalog([]), "an empty screen catalog");
  red(() => assertScreenCatalog([
    { targetId: "approve-settlement", role: "button", label: "Approve", critical: true },
    { targetId: "approve-settlement", role: "button", label: "Approve again", critical: true },
  ]), "a duplicate target identifier");
  red(() => assertScreenCatalog([{ targetId: "Approve Settlement", role: "button", label: "Approve", critical: true }]), "an unstable target identifier");
  red(() => assertScreenCatalog([{ targetId: "ok", role: "button", label: "Approve", critical: true }]), "a target identifier that is too short to be distinct");
  red(() => assertScreenCatalog([{ targetId: "approve-settlement", role: "button", label: "   ", critical: true }]), "an unlabelled critical target");
  red(() => assertScreenCatalog([{ targetId: "approve-settlement", role: "region", label: "Approve", critical: true }]), "a critical target with a non-interactive role");

  // An action pointing at a target nobody can find, and a state-changing action routed through
  // a target no automated run asserts against.
  red(() => assertActionCatalog([{ ...(ACTIONS[0] as ExpoActionDefinition), targetId: "does-not-exist" }], SCREENS), "an action with no catalogued target");
  red(() => assertActionCatalog([{ ...(ACTIONS[0] as ExpoActionDefinition), targetId: "receipt-list" }], SCREENS), "a privileged action through a non-critical target");
  red(() => assertActionCatalog([ACTIONS[0] as ExpoActionDefinition, ACTIONS[0] as ExpoActionDefinition], SCREENS), "a duplicate action");
  red(() => assertActionCatalog([{ ...(ACTIONS[0] as ExpoActionDefinition), id: "Settlement Approve" }], SCREENS), "a malformed action identifier");
  red(() => assertActionCatalog([{ ...(ACTIONS[0] as ExpoActionDefinition), version: "1" }], SCREENS), "an action without an exact version");
  red(() => assertActionCatalog([{ ...(ACTIONS[0] as ExpoActionDefinition), allowedArgumentKeys: ["intent id"] }], SCREENS), "a malformed argument key");
  red(() => assertActionCatalog([{ ...(ACTIONS[0] as ExpoActionDefinition), allowedArgumentKeys: ["intentId", "intentId"] }], SCREENS), "a duplicate argument key");
}

// UX-EXPO-004. The closed action catalog, and the three shapes a dynamic action arrives in.
function actionClosure(): void {
  ok(actionRefusal(request(), CATALOG) === null, "a catalogued action was refused");
  ok(actionRefusal({ actionId: "receipts.list", actionVersion: "1.0.0", arguments: {} }, CATALOG) === null, "an argument-free action was refused");

  const refusals: [string, ExpoActionRequest][] = [
    ["an uncatalogued action", request({ actionId: "settlement.drain" })],
    ["an uncatalogued action version", request({ actionVersion: "2.0.0" })],
    ["an unadmitted argument key", request({ arguments: { intentId: "intent-1", command: "rm" } as never })],
    ["an over-long argument", request({ arguments: { intentId: "x".repeat(257) } })],
    ["a non-finite argument", request({ arguments: { intentId: Number.NaN } })],
  ];
  for (const [label, value] of refusals) {
    ok(actionRefusal(value, CATALOG) !== null, `${label} was admitted`);
  }

  // A scalar cannot carry a payload and a nested structure can, which is why the nesting rule
  // is the one that stops a downloaded action rather than any denylist of dangerous words.
  const nested = { actionId: "settlement.approve", actionVersion: "1.0.0", arguments: { intentId: { module: "https://example.invalid/patch.js" } } } as unknown as ExpoActionRequest;
  ok(actionRefusal(nested, CATALOG) !== null, "a nested argument structure was admitted");
  const array = { actionId: "settlement.approve", actionVersion: "1.0.0", arguments: { intentId: ["a"] } } as unknown as ExpoActionRequest;
  ok(actionRefusal(array, CATALOG) !== null, "an array argument was admitted");
  const notAnObject = { actionId: "settlement.approve", actionVersion: "1.0.0", arguments: "intentId=1" } as unknown as ExpoActionRequest;
  ok(actionRefusal(notAnObject, CATALOG) !== null, "a string argument bag was admitted");
  const arrayBag = { actionId: "settlement.approve", actionVersion: "1.0.0", arguments: [] } as unknown as ExpoActionRequest;
  ok(actionRefusal(arrayBag, CATALOG) !== null, "an array argument bag was admitted");
  const noPrototype = { actionId: "settlement.approve", actionVersion: "1.0.0", arguments: Object.create({ intentId: "x" }) } as unknown as ExpoActionRequest;
  ok(actionRefusal(noPrototype, CATALOG) !== null, "an inherited-key argument bag was admitted");

  // A refused action stops the lane at ACTION_DENIED rather than reaching OBSERVING.
  const denied = lane("ios", new FakeExpoPlatform(), { request: request({ actionId: "settlement.drain" }), catalog: CATALOG });
  ok(denied.outcome === "ACTION_DENIED", `an uncatalogued action reported ${denied.outcome}`);
}

// UX-EXPO-005. Every evidence state renders as something the user can tell apart.
function stateFidelity(): void {
  const target = TARGETS[0] as ScreenTarget;
  const outcomes: ProductOutcome[] = [
    "COMPLETED", "WAITING_FOR_HUMAN", "WAITING_FOR_HARDWARE", "DENIED", "ABSENT_ADAPTER",
    "NOT_IMPLEMENTED", "NOT_EXERCISED", "FAILED_ACTION", "FAILED_PROVIDER", "FAILED_OBSERVATION", "FAILED_CLEANUP",
  ];
  const tones = new Set(outcomes.map(viewToneFor));
  ok(tones.size === outcomes.length, `${outcomes.length} outcomes render as ${tones.size} tones`);

  // The four the issue calls out by name must not collapse into each other. Waiting for a human
  // and waiting for hardware are different asks; denied and absent are different reasons.
  ok(viewToneFor("WAITING_FOR_HUMAN") !== viewToneFor("WAITING_FOR_HARDWARE"), "the two waiting states render alike");
  ok(viewToneFor("DENIED") !== viewToneFor("ABSENT_ADAPTER"), "denied and absent render alike");
  ok(viewToneFor("NOT_IMPLEMENTED") !== viewToneFor("NOT_EXERCISED"), "unimplemented and unexercised render alike");

  const rendered = projectViewState("COMPLETED", target, RECEIPT);
  ok(rendered.tone === "success", "a receipted completion did not render as success");
  ok(rendered.targetId === target.targetId && rendered.label === target.label, "the rendered state lost its accessibility identity");

  // The control #48 names: render an unreceipted success.
  red(() => projectViewState("COMPLETED", target, null), "an unreceipted success");
  red(() => projectViewState("COMPLETED", target, "not-a-digest"), "an unaddressed receipt");
  // Every other state may legitimately have no receipt -- that is what it is reporting.
  ok(projectViewState("WAITING_FOR_HUMAN", target, null).tone === "waiting-human", "a waiting state required a receipt");
  ok(projectViewState("NOT_EXERCISED", target, null).tone === "unexercised", "an unexercised state required a receipt");
}

// UX-EXPO-006. The two platform lanes report independently.
function platformEvidence(): void {
  const ios = lane("ios");
  const android = runLane({ subject: subject("android"), modules: MODULES, adapter: new FakeExpoPlatform(), action: { request: request(), catalog: CATALOG } }).receipt;
  ok(ios.outcome === "CLOSED" && android.outcome === "CLOSED", "a clean lane did not close");
  ok(ios.artifactSha256 !== android.artifactSha256, "the two platforms produced the same artifact");

  const both = combineLanes([ios, android]);
  ok(both.combined === "COMPLETED", `two clean lanes combined to ${both.combined}`);

  // The control: one platform's result standing in for both. A single lane can never combine to
  // COMPLETED, whatever it reported.
  ok(combineLanes([ios]).combined === "NOT_EXERCISED", "one lane was reported as a complete run");
  ok(combineLanes([android]).combined === "NOT_EXERCISED", "one lane was reported as a complete run");
  ok(combineLanes([]).combined === "NOT_EXERCISED", "an empty run was reported as complete");
  red(() => combineLanes([ios, ios]), "one platform reporting two lanes");

  // An absent simulator is not a pass, and it does not become one by the other lane succeeding.
  const noSimulator = new FakeExpoPlatform();
  noSimulator.simulators = ["android"];
  const absent = lane("ios", noSimulator);
  ok(absent.outcome === "SIMULATOR_ABSENT", `an absent simulator reported ${absent.outcome}`);
  const mixed = combineLanes([absent, android]);
  ok(mixed.combined === "FAILED_PROVIDER", `a run with an absent simulator combined to ${mixed.combined}`);
  ok(mixed.detail.includes("ios"), "the combined detail does not name the lane that failed");
}

// UX-EXPO-007. No signing identity, device ID, profile or certificate reaches a receipt.
function secrets(): void {
  const sealed = new SealedBuildLog(`signing identity: ${PLANTED_SECRET}`);

  ok(sealed.toJSON() === REDACTED, "toJSON leaked the build log");
  ok(sealed.toString() === REDACTED, "toString leaked the build log");
  ok(`${sealed}` === REDACTED, "template interpolation leaked the build log");
  ok(String(sealed) === REDACTED, "String() leaked the build log");
  ok(JSON.stringify(sealed) === `"${REDACTED}"`, "JSON serialization leaked the build log");
  ok(JSON.stringify({ sealed }).includes(PLANTED_SECRET) === false, "nested serialization leaked the build log");
  ok((sealed as unknown as Record<symbol, () => string>)[Symbol.for("nodejs.util.inspect.custom")]() === REDACTED, "the inspect hook leaked the build log");
  ok(Object.values(sealed).some((value) => String(value).includes(PLANTED_SECRET)) === false, "an own property leaked the build log");
  ok(/^[a-f0-9]{64}$/.test(sealed.sha256), "the build log digest is absent");
  ok(sealed.use((value) => value.includes(PLANTED_SECRET)), "the scoped accessor could not reach the text");
  ok(sealed.byteLength > 0, "the build log length is absent");

  const closed = lane();
  const failedBuild = new FakeExpoPlatform();
  failedBuild.installs = false;
  for (const [label, receipt] of [["closed", closed], ["failed", lane("ios", failedBuild)]] as const) {
    const text = JSON.stringify(receipt);
    ok(text.includes(PLANTED_SECRET) === false, `the ${label} receipt carried the planted secret`);
    ok(text.includes("xcodebuild") === false, `the ${label} receipt carried raw build output`);
  }
  ok(JSON.stringify(combineLanes([closed])).includes(PLANTED_SECRET) === false, "the combined receipt carried the planted secret");
}

// UX-EXPO-008. Host state is accounted for, in each of the four ways a run leaks it.
function cleanup(): void {
  const leaks: [string, (adapter: FakeExpoPlatform) => void][] = [
    ["a process", (adapter) => { adapter.retainedProcesses = 1; }],
    ["a port", (adapter) => { adapter.retainedPorts = 1; }],
    ["a cache", (adapter) => { adapter.retainedCaches = 1; }],
    ["an undeclared artifact", (adapter) => { adapter.undeclaredArtifacts = 1; }],
  ];
  for (const [label, leak] of leaks) {
    const adapter = new FakeExpoPlatform();
    leak(adapter);
    const receipt = lane("ios", adapter);
    ok(receipt.outcome === "FAILED_CLEANUP", `${label} left behind reported ${receipt.outcome}`);
    ok(receipt.cleanupCleared === false, `${label} left behind was reported as cleared`);
    ok(receipt.detail.length > 0, `${label} left behind produced no detail`);
  }

  // A lane that failed for its own reason still reports whether it cleaned up. Two problems,
  // not one -- and the outcome that names the earlier failure is the more useful of the two.
  const failedAndLeaked = new FakeExpoPlatform();
  failedAndLeaked.launches = false;
  failedAndLeaked.retainedProcesses = 1;
  const receipt = lane("ios", failedAndLeaked);
  ok(receipt.outcome === "LAUNCH_FAILED", `a failed lane that leaked reported ${receipt.outcome}`);
  ok(receipt.cleanupCleared === false, "a failed lane that leaked was reported as cleared");

  ok(lane().cleanupCleared === true, "a clean lane was reported as leaking");
}

// The transition table itself. The lane only ever builds legal traces, so without this the
// enforcement point is type-checked and never executed.
function transitionLegality(): void {
  ok(validateExpoLifecycle(["UNBUILT", "ABSENT_TOOLCHAIN"]) === "ABSENT_TOOLCHAIN", "a legal trace was refused");
  ok(isExpoOutcome("CLOSED"), "CLOSED is not recognised as an outcome");
  ok(isExpoOutcome("OBSERVING") === false, "OBSERVING is treated as an outcome");

  red(() => assertExpoTransition("ARTIFACT_READY", "CLOSED"), "closing a run that observed nothing");
  red(() => assertExpoTransition("LAUNCHED", "CLOSED"), "closing a run without an action");
  red(() => assertExpoTransition("ACTION_READY", "CLOSED"), "closing a run without observing");
  red(() => assertExpoTransition("CLOSED", "UNBUILT"), "restarting a closed run");
  red(() => assertExpoTransition("UNBUILT", "BUILDING"), "building without a toolchain check");

  red(() => validateExpoLifecycle(["UNBUILT", "CLOSED"]), "a trace that skipped the whole build");
  red(() => validateExpoLifecycle(["TOOLCHAIN_CHECKED", "CONFIG_VALIDATED", "BUILDING", "BUILD_FAILED"]), "a trace that did not start at UNBUILT");
  red(() => validateExpoLifecycle(["UNBUILT", "TOOLCHAIN_CHECKED"]), "a trace that stopped short of an outcome");
  red(() => validateExpoLifecycle(["UNBUILT"]), "a single-state trace");
}

// Every terminal state #48 names must be produced by a distinct fixture.
function stateSeparation(): void {
  const outcomes = new Set<ExpoOutcome>();
  const fixtures: [string, () => ExpoOutcome][] = [
    ["closed", () => lane().outcome],
    ["absent toolchain", () => {
      const adapter = new FakeExpoPlatform();
      adapter.toolchain = null;
      return lane("ios", adapter).outcome;
    }],
    ["build failed", () => {
      const adapter = new FakeExpoPlatform();
      adapter.builds = false;
      return lane("ios", adapter).outcome;
    }],
    ["artifact failed", () => {
      const adapter = new FakeExpoPlatform();
      adapter.artifactDigestOverride = "6".repeat(64);
      return lane("ios", adapter).outcome;
    }],
    ["simulator absent", () => {
      const adapter = new FakeExpoPlatform();
      adapter.simulators = [];
      return lane("ios", adapter).outcome;
    }],
    ["install failed", () => {
      const adapter = new FakeExpoPlatform();
      adapter.installs = false;
      return lane("ios", adapter).outcome;
    }],
    ["launch failed", () => {
      const adapter = new FakeExpoPlatform();
      adapter.launches = false;
      return lane("ios", adapter).outcome;
    }],
    ["action denied", () => lane("ios", new FakeExpoPlatform(), { request: request({ actionId: "settlement.drain" }), catalog: CATALOG }).outcome],
    ["test not exercised", () => lane("ios", new FakeExpoPlatform(), null).outcome],
    ["failed cleanup", () => {
      const adapter = new FakeExpoPlatform();
      adapter.retainedPorts = 1;
      return lane("ios", adapter).outcome;
    }],
  ];
  for (const [label, invoke] of fixtures) {
    const outcome = invoke();
    ok(outcome !== undefined, `${label} produced no outcome`);
    outcomes.add(outcome);
  }
  ok(outcomes.size === 10, `the fixtures cover ${outcomes.size} distinct outcomes, expected 10`);
}

function evidenceBoundary(): void {
  ok(expoAdapterState.iosBuildInstallLaunch === "NOT_EXERCISED", "an iOS device lane was claimed");
  ok(expoAdapterState.androidBuildInstallLaunch === "NOT_EXERCISED", "an Android device lane was claimed");
  ok(expoAdapterState.deviceRun === "NOT_IMPLEMENTED", "a physical device run was claimed");
  ok(expoAdapterState.storeCompliance === "NOT_IMPLEMENTED", "store compliance was claimed");
  ok(expoAdapterState.cloudDeviceProvider === "NOT_IMPLEMENTED", "a cloud device provider was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const expoNeverPasses: NeverPass<typeof expoAdapterState> = true;
void expoNeverPasses;

toolchainSplit();
deterministicBuild();
accessibility();
actionClosure();
stateFidelity();
platformEvidence();
secrets();
cleanup();
transitionLegality();
stateSeparation();
evidenceBoundary();

console.log("UX-EXPO GREEN: toolchain split, deterministic build, accessibility, action closure, state fidelity, platform evidence, secrets, cleanup, transition legality");
