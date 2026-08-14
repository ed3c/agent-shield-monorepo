export const mobileContract = {
  framework: "expo-react-native",
  tooling: "bun-typescript",
  runtime: "hermes-or-jsc",
  accessibilityIdPolicy: "required",
  externalMaestro: "NOT_EXERCISED",
  inAppMcp: "NOT_IMPLEMENTED"
} as const;

export { SealedBuildLog, REDACTED } from "./sealed-build-log.ts";
export { ADMITTED_TOOLCHAIN, FakeExpoPlatform, PLANTED_SECRET } from "./fake-platform.ts";
export { assertExpoTransition, isExpoOutcome, validateExpoLifecycle } from "./state-machine.ts";
export {
  actionRefusal,
  assertActionCatalog,
  assertScreenCatalog,
  assertToolchain,
  fail,
  projectViewState,
  runtimeImportRefusal,
  viewToneFor,
} from "./app.ts";
export {
  assertBuildSubject,
  combineLanes,
  expectedArtifactDigest,
  expoAdapterState,
  runLane,
  type LaneRequest,
} from "./build.ts";
export { ALLOWED_RUNTIME_IMPORTS } from "./types.ts";
export type {
  ActionArgumentValue,
  AppRuntime,
  BuildArtifact,
  BuildSubject,
  CleanupAccount,
  ExpoActionDefinition,
  ExpoActionRequest,
  ExpoBuildReceipt,
  ExpoOutcome,
  ExpoPlatformAdapter,
  ExpoPlatformReceipt,
  ExpoState,
  MobilePlatform,
  ScreenTarget,
  ShippedModule,
  ToolchainSubject,
  ViewState,
  ViewTone,
} from "./types.ts";
