import type { AccessibilityTarget, ProductOutcome, ProductRole } from "../../../packages/contracts/src/product/index.ts";
import type { SealedBuildLog } from "./sealed-build-log.ts";

export const EXPO_BUILD_RECEIPT_SCHEMA = "agent-shield/expo-build-receipt/v1" as const;
export const EXPO_PLATFORM_RECEIPT_SCHEMA = "agent-shield/expo-platform-receipt/v1" as const;

// The app lifecycle from `apps/mobile-app/README.md`. The parent README spells the cleanup
// terminal `FAILED_CLEANUP`, matching the `product.*` contract family; issue #48 spells it
// `CLEANUP_FAILED`. The README and the contract family agree, so they win.
export type ExpoState =
  | "UNBUILT"
  | "TOOLCHAIN_CHECKED"
  | "CONFIG_VALIDATED"
  | "BUILDING"
  | "ARTIFACT_READY"
  | "INSTALLING"
  | "LAUNCHED"
  | "ACTION_READY"
  | "OBSERVING"
  | "CLOSED"
  | "ABSENT_TOOLCHAIN"
  | "BUILD_FAILED"
  | "ARTIFACT_FAILED"
  | "SIMULATOR_ABSENT"
  | "INSTALL_FAILED"
  | "LAUNCH_FAILED"
  | "ACTION_DENIED"
  | "TEST_NOT_EXERCISED"
  | "FAILED_CLEANUP";

export type ExpoOutcome = Extract<ExpoState,
  | "CLOSED"
  | "ABSENT_TOOLCHAIN"
  | "BUILD_FAILED"
  | "ARTIFACT_FAILED"
  | "SIMULATOR_ABSENT"
  | "INSTALL_FAILED"
  | "LAUNCH_FAILED"
  | "ACTION_DENIED"
  | "TEST_NOT_EXERCISED"
  | "FAILED_CLEANUP">;

// UX-EXPO-006. The two lanes are separate subjects because they are separate facts. A build
// that only ran on one platform has one lane, and there is no field anywhere that lets the
// other one inherit it.
export type MobilePlatform = "ios" | "android";

// UX-EXPO-001. The app runtime is Hermes or JavaScriptCore. Bun is the tooling that produces
// the bundle and is never present when the bundle runs, so `bun` and `node` are members of this
// union purely so that refusing them is a rule with one place to live.
export type AppRuntime = "hermes" | "jsc" | "bun" | "node";

export interface ToolchainSubject {
  bunVersion: string;
  typescriptVersion: string;
  expoSdkVersion: string;
  reactNativeVersion: string;
  appRuntime: AppRuntime;
}

// UX-EXPO-001. The shipped runtime's import surface, declared rather than discovered.
//
// This is an allowlist and not a denylist of Bun APIs on purpose: a denylist has to be updated
// every time the tooling grows a new global, and the version that has not been updated yet
// looks exactly like a passing check. An allowlist fails closed on anything unrecognised,
// including the API nobody has heard of yet.
export interface ShippedModule {
  path: string;
  imports: string[];
}

export const ALLOWED_RUNTIME_IMPORTS: readonly string[] = [
  "react",
  "react-native",
  "expo",
  "expo-constants",
  "expo-router",
  "expo-status-bar",
];

// UX-EXPO-002. Everything the artifact identity is a function of. Two builds agreeing on all of
// these must produce the same artifact digest, and a build disagreeing on any of them must not.
export interface BuildSubject {
  platform: MobilePlatform;
  sourceSha256: string;
  appConfigSha256: string;
  toolchain: ToolchainSubject;
}

export interface BuildArtifact {
  platform: MobilePlatform;
  artifactSha256: string;
  // What the adapter says it built from. Compared against the pinned subject rather than
  // trusted: a stale generated config is a config the build used and the subject did not name.
  builtFromConfigSha256: string;
  bytes: number;
  log: SealedBuildLog;
}

// UX-EXPO-003. The accessibility catalog. Web, mobile and QA adapters address the same element
// through `targetId`, so a duplicate or absent identifier is a contract break rather than a
// cosmetic problem.
export interface ScreenTarget extends AccessibilityTarget {
  // A target a QA adapter is expected to find and act on. Critical targets carry the stricter
  // labelling rule because they are the ones an automated run asserts against.
  critical: boolean;
}

// UX-EXPO-004. The closed action catalog. A caller selects an ID and admitted argument keys; it
// never supplies a command, script, path, module specifier or selector.
export interface ExpoActionDefinition {
  id: string;
  version: string;
  targetId: string;
  allowedArgumentKeys: string[];
  riskClass: "read" | "write" | "privileged";
}

export type ActionArgumentValue = string | number | boolean;

export interface ExpoActionRequest {
  actionId: string;
  actionVersion: string;
  arguments: Record<string, ActionArgumentValue>;
}

// UX-EXPO-005. What the user is shown. `tone` is what distinguishes the states visually, so the
// mapping from outcome to tone has to be injective or two different situations render the same.
export type ViewTone = "success" | "waiting-human" | "waiting-hardware" | "denied" | "absent" | "unimplemented" | "unexercised" | "failed-action" | "failed-provider" | "failed-observation" | "failed-cleanup";

export interface ViewState {
  tone: ViewTone;
  targetId: string;
  role: ProductRole;
  label: string;
  // Only a receipted completion may claim success, so this is not a caller-supplied flag.
  receiptDigest: string | null;
}

export interface CleanupAccount {
  processes: number;
  ports: number;
  caches: number;
  undeclaredArtifacts: number;
}

export interface ExpoPlatformReceipt {
  schema: typeof EXPO_PLATFORM_RECEIPT_SCHEMA;
  platform: MobilePlatform;
  lifecycle: ExpoState[];
  outcome: ExpoOutcome;
  artifactSha256: string | null;
  cleanupCleared: boolean;
  detail: string;
}

// UX-EXPO-006. The aggregate over both lanes. It carries the two receipts rather than a merged
// verdict: there is no field here that a single platform's result can occupy.
export interface ExpoBuildReceipt {
  schema: typeof EXPO_BUILD_RECEIPT_SCHEMA;
  lanes: ExpoPlatformReceipt[];
  // `NOT_EXERCISED` whenever a lane is missing, whatever the other lane reported.
  combined: Extract<ProductOutcome, "COMPLETED" | "NOT_EXERCISED" | "FAILED_PROVIDER">;
  detail: string;
}

// The host-owned platform adapter. Toolchains, simulators, installs and launches live on the
// far side; admission, determinism, accessibility, action closure, state fidelity, lane
// separation and cleanup accounting are owned here and are what the evals exercise.
export interface ExpoPlatformAdapter {
  probeToolchain(): ToolchainSubject | null;
  probeSimulator(platform: MobilePlatform): boolean;
  build(subject: BuildSubject): BuildArtifact | null;
  install(artifact: BuildArtifact): boolean;
  launch(platform: MobilePlatform): boolean;
  // What the run left behind on the host.
  cleanupAccount(): CleanupAccount;
}
