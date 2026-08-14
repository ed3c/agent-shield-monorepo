import { createHash } from "node:crypto";
import { actionRefusal, assertToolchain, fail, runtimeImportRefusal } from "./app.ts";
import { validateExpoLifecycle } from "./state-machine.ts";
import {
  EXPO_BUILD_RECEIPT_SCHEMA,
  EXPO_PLATFORM_RECEIPT_SCHEMA,
  type BuildSubject,
  type ExpoActionDefinition,
  type ExpoActionRequest,
  type ExpoBuildReceipt,
  type ExpoPlatformAdapter,
  type ExpoPlatformReceipt,
  type ExpoState,
  type MobilePlatform,
  type ShippedModule,
  type ToolchainSubject,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;

// UX-EXPO-002. The artifact identity is a function of exactly the fields of `BuildSubject`, and
// of nothing else. Computing it here rather than accepting the adapter's own identifier is what
// makes "the same inputs produce the same artifact" checkable instead of assumed.
export function expectedArtifactDigest(subject: BuildSubject): string {
  return createHash("sha256").update(JSON.stringify([
    subject.platform,
    subject.sourceSha256,
    subject.appConfigSha256,
    subject.toolchain.bunVersion,
    subject.toolchain.typescriptVersion,
    subject.toolchain.expoSdkVersion,
    subject.toolchain.reactNativeVersion,
    subject.toolchain.appRuntime,
  ])).digest("hex");
}

export function assertBuildSubject(subject: BuildSubject): BuildSubject {
  assertToolchain(subject.toolchain);
  if (!SHA_256.test(subject.sourceSha256)) fail("sourceSha256 is not content-addressed");
  if (!SHA_256.test(subject.appConfigSha256)) fail("appConfigSha256 is not content-addressed");
  return subject;
}

// UX-EXPO-008. Asked once, after every lane, whatever the lane's own outcome was. A build that
// failed and left a simulator booted and a Metro port held is two problems, not one.
function cleanupRefusal(adapter: ExpoPlatformAdapter): string | null {
  const account = adapter.cleanupAccount();
  const leaks = [
    ["processes", account.processes],
    ["ports", account.ports],
    ["caches", account.caches],
    ["undeclared artifacts", account.undeclaredArtifacts],
  ] as const;
  const retained = leaks.filter(([, count]) => count > 0);
  if (retained.length === 0) return null;
  return retained.map(([name, count]) => `${count} ${name}`).join(", ");
}

function platformReceipt(
  platform: MobilePlatform,
  lifecycle: ExpoState[],
  detail: string,
  artifactSha256: string | null,
  cleanupCleared: boolean,
): ExpoPlatformReceipt {
  return {
    schema: EXPO_PLATFORM_RECEIPT_SCHEMA,
    platform,
    lifecycle,
    outcome: validateExpoLifecycle(lifecycle),
    artifactSha256,
    cleanupCleared,
    detail,
  };
}

export interface LaneRequest {
  subject: BuildSubject;
  modules: readonly ShippedModule[];
  adapter: ExpoPlatformAdapter;
  // The action this lane attempted, or `null` for a lane that only built and launched. #48 owns
  // the app lifecycle, not the QA providers (#50-#52), so a lane that attempted nothing reports
  // TEST_NOT_EXERCISED rather than borrowing an external adapter's result.
  action: { request: ExpoActionRequest; catalog: ReadonlyMap<string, ExpoActionDefinition> } | null;
}

// UNBUILT → TOOLCHAIN_CHECKED → CONFIG_VALIDATED → BUILDING → ARTIFACT_READY
//        → INSTALLING → LAUNCHED → ACTION_READY → OBSERVING → CLOSED
export function runLane(request: LaneRequest): { receipt: ExpoPlatformReceipt } {
  const { subject, modules, adapter, action } = request;
  assertBuildSubject(subject);
  const platform = subject.platform;
  const lifecycle: ExpoState[] = ["UNBUILT"];

  const probed = adapter.probeToolchain();
  if (probed === null) {
    lifecycle.push("ABSENT_TOOLCHAIN");
    return { receipt: platformReceipt(platform, lifecycle, "the host has no Expo toolchain", null, cleanupRefusal(adapter) === null) };
  }
  // The probe is the live fact and the subject is the claim. A build pinned to one SDK and run
  // by another produces an artifact neither of them describes.
  if (!sameToolchain(probed, subject.toolchain)) {
    lifecycle.push("ABSENT_TOOLCHAIN");
    return { receipt: platformReceipt(platform, lifecycle, "the host toolchain is not the admitted subject", null, cleanupRefusal(adapter) === null) };
  }
  lifecycle.push("TOOLCHAIN_CHECKED");

  // UX-EXPO-001. Checked before anything is built: a bundle that imports a server-only module
  // builds successfully and fails at launch, where the failure is a red screen rather than a
  // named state.
  const importRefusal = runtimeImportRefusal(modules);
  if (importRefusal !== null) {
    lifecycle.push("BUILD_FAILED");
    return { receipt: platformReceipt(platform, lifecycle, importRefusal, null, cleanupRefusal(adapter) === null) };
  }
  lifecycle.push("CONFIG_VALIDATED", "BUILDING");

  const artifact = adapter.build(subject);
  if (artifact === null) {
    lifecycle.push("BUILD_FAILED");
    return { receipt: platformReceipt(platform, lifecycle, "the build did not produce an artifact", null, cleanupRefusal(adapter) === null) };
  }
  // UX-EXPO-002. Three ways the artifact can fail to be the one that was asked for, and they
  // are checked separately because a stale generated config is a different mistake from a
  // cross-platform artifact.
  if (artifact.platform !== platform) {
    lifecycle.push("ARTIFACT_FAILED");
    return { receipt: platformReceipt(platform, lifecycle, `the ${platform} lane received a ${artifact.platform} artifact`, null, cleanupRefusal(adapter) === null) };
  }
  if (artifact.builtFromConfigSha256 !== subject.appConfigSha256) {
    lifecycle.push("ARTIFACT_FAILED");
    return { receipt: platformReceipt(platform, lifecycle, "the build used a configuration the subject does not name", null, cleanupRefusal(adapter) === null) };
  }
  const expected = expectedArtifactDigest(subject);
  if (artifact.artifactSha256 !== expected) {
    lifecycle.push("ARTIFACT_FAILED");
    return { receipt: platformReceipt(platform, lifecycle, "the artifact digest is not the one the pinned subject produces", null, cleanupRefusal(adapter) === null) };
  }
  lifecycle.push("ARTIFACT_READY");

  // UX-EXPO-006. An absent simulator is an absent simulator. It is not a pass, and it is not a
  // reason to report the other platform's result.
  if (!adapter.probeSimulator(platform)) {
    lifecycle.push("SIMULATOR_ABSENT");
    return { receipt: platformReceipt(platform, lifecycle, `no ${platform} simulator is available on this host`, artifact.artifactSha256, cleanupRefusal(adapter) === null) };
  }
  lifecycle.push("INSTALLING");

  if (!adapter.install(artifact)) {
    lifecycle.push("INSTALL_FAILED");
    return { receipt: platformReceipt(platform, lifecycle, "the artifact did not install", artifact.artifactSha256, cleanupRefusal(adapter) === null) };
  }
  lifecycle.push("LAUNCHED");

  if (!adapter.launch(platform)) {
    lifecycle.push("LAUNCH_FAILED");
    return { receipt: platformReceipt(platform, lifecycle, "the app did not launch", artifact.artifactSha256, cleanupRefusal(adapter) === null) };
  }
  lifecycle.push("ACTION_READY");

  if (action === null) {
    lifecycle.push("TEST_NOT_EXERCISED");
    return { receipt: platformReceipt(platform, lifecycle, "the app launched and no action was attempted", artifact.artifactSha256, cleanupRefusal(adapter) === null) };
  }
  // UX-EXPO-004. The closed catalog is consulted here rather than by the caller, so a lane
  // cannot reach OBSERVING with an action the app does not admit. ACTION_DENIED has exactly one
  // producer, and this is it.
  const denial = actionRefusal(action.request, action.catalog);
  if (denial !== null) {
    lifecycle.push("ACTION_DENIED");
    return { receipt: platformReceipt(platform, lifecycle, denial, artifact.artifactSha256, cleanupRefusal(adapter) === null) };
  }
  lifecycle.push("OBSERVING");

  const residue = cleanupRefusal(adapter);
  if (residue !== null) {
    lifecycle.push("FAILED_CLEANUP");
    return { receipt: platformReceipt(platform, lifecycle, `the run retained ${residue}`, artifact.artifactSha256, false) };
  }
  lifecycle.push("CLOSED");
  return { receipt: platformReceipt(platform, lifecycle, "the lane closed cleanly", artifact.artifactSha256, true) };
}

function sameToolchain(probed: ToolchainSubject, claimed: ToolchainSubject): boolean {
  return probed.bunVersion === claimed.bunVersion
    && probed.typescriptVersion === claimed.typescriptVersion
    && probed.expoSdkVersion === claimed.expoSdkVersion
    && probed.reactNativeVersion === claimed.reactNativeVersion
    && probed.appRuntime === claimed.appRuntime;
}

// UX-EXPO-006. The aggregate over both lanes.
//
// The control the issue names is one platform's result standing in for both. There is no field
// on `ExpoBuildReceipt` a single lane can occupy, and the combined verdict is `NOT_EXERCISED`
// whenever a lane is missing -- whatever the lane that did run reported. That is the whole
// mechanism: the honest answer is available and the dishonest one is not expressible.
export function combineLanes(lanes: readonly ExpoPlatformReceipt[]): ExpoBuildReceipt {
  const platforms = lanes.map((lane) => lane.platform);
  if (new Set(platforms).size !== platforms.length) fail("a platform reported two lanes");

  const missing = (["ios", "android"] as const).filter((platform) => !platforms.includes(platform));
  if (missing.length > 0) {
    return {
      schema: EXPO_BUILD_RECEIPT_SCHEMA,
      lanes: [...lanes],
      combined: "NOT_EXERCISED",
      detail: `no lane ran for ${missing.join(" and ")}`,
    };
  }
  const failed = lanes.filter((lane) => lane.outcome !== "CLOSED");
  if (failed.length > 0) {
    return {
      schema: EXPO_BUILD_RECEIPT_SCHEMA,
      lanes: [...lanes],
      combined: "FAILED_PROVIDER",
      detail: failed.map((lane) => `${lane.platform} reported ${lane.outcome}`).join("; "),
    };
  }
  return {
    schema: EXPO_BUILD_RECEIPT_SCHEMA,
    lanes: [...lanes],
    combined: "COMPLETED",
    detail: "both platform lanes closed cleanly",
  };
}

// The evidence this adapter is allowed to claim. A deterministic run over a fake platform moves
// none of it, and the eval suite pins the type so widening a member to PASS fails to compile.
export const expoAdapterState = {
  iosBuildInstallLaunch: "NOT_EXERCISED",
  androidBuildInstallLaunch: "NOT_EXERCISED",
  deviceRun: "NOT_IMPLEMENTED",
  storeCompliance: "NOT_IMPLEMENTED",
  cloudDeviceProvider: "NOT_IMPLEMENTED",
} as const;
