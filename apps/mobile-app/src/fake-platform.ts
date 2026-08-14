import { expectedArtifactDigest } from "./build.ts";
import { SealedBuildLog } from "./sealed-build-log.ts";
import type {
  BuildArtifact,
  BuildSubject,
  CleanupAccount,
  ExpoPlatformAdapter,
  MobilePlatform,
  ToolchainSubject,
} from "./types.ts";

// UX-EXPO-007. The build log the fake toolchain emits carries a value that must never appear in
// a receipt, a log line or an error message. The secrets control searches serialized output for
// it, so a redaction that stops working turns the eval red instead of turning it quiet.
export const PLANTED_SECRET = "planted-signing-identity-AB12CD34EF" as const;

export const ADMITTED_TOOLCHAIN: ToolchainSubject = {
  bunVersion: "1.3.14",
  typescriptVersion: "5.7.2",
  expoSdkVersion: "52.0.0",
  reactNativeVersion: "0.76.5",
  appRuntime: "hermes",
};

// A deterministic stand-in for the host-owned Expo toolchain and simulators. Every field is a
// knob a negative control turns, and nothing here builds anything: the digests are computed
// from the subject so that the honest path agrees and every tampered path does not.
export class FakeExpoPlatform implements ExpoPlatformAdapter {
  toolchain: ToolchainSubject | null = { ...ADMITTED_TOOLCHAIN };

  simulators: MobilePlatform[] = ["ios", "android"];

  builds = true;
  // Set by the "stale generated config" control: the build used a configuration the pinned
  // subject does not name.
  builtFromConfigOverride: string | null = null;
  artifactDigestOverride: string | null = null;
  artifactPlatformOverride: MobilePlatform | null = null;

  installs = true;
  launches = true;

  retainedProcesses = 0;
  retainedPorts = 0;
  retainedCaches = 0;
  undeclaredArtifacts = 0;

  probeToolchain(): ToolchainSubject | null {
    return this.toolchain;
  }

  probeSimulator(platform: MobilePlatform): boolean {
    return this.simulators.includes(platform);
  }

  build(subject: BuildSubject): BuildArtifact | null {
    if (!this.builds) return null;
    return {
      platform: this.artifactPlatformOverride ?? subject.platform,
      artifactSha256: this.artifactDigestOverride ?? expectedArtifactDigest(subject),
      builtFromConfigSha256: this.builtFromConfigOverride ?? subject.appConfigSha256,
      bytes: 42_000_000,
      log: new SealedBuildLog(`xcodebuild -exportArchive signing identity: ${PLANTED_SECRET}`),
    };
  }

  install(artifact: BuildArtifact): boolean {
    void artifact;
    return this.installs;
  }

  launch(platform: MobilePlatform): boolean {
    void platform;
    return this.launches;
  }

  cleanupAccount(): CleanupAccount {
    return {
      processes: this.retainedProcesses,
      ports: this.retainedPorts,
      caches: this.retainedCaches,
      undeclaredArtifacts: this.undeclaredArtifacts,
    };
  }
}
