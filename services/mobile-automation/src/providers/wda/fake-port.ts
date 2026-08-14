import type {
  WdaAction,
  WdaActionResult,
  WdaHostProbe,
  WdaPort,
  WdaStreamResult,
  WdaTargetLease,
} from "./types.ts";

// Deterministic in-memory stand-in for the host-owned iOS surface. No macOS host, Xcode,
// simulator, device, signing identity or WebDriverAgent process is contacted, and the lease
// it hands back is always a simulator -- so nothing reachable from here can be mistaken for
// physical-device evidence.
export class FakeWdaPort implements WdaPort {
  host: WdaHostProbe = { platform: "darwin", osVersion: "15.3.1", xcodeVersion: "16.2", xcodeBuild: "16C5032a" };
  toolchainInstalled = true;
  toolchainVersion: string | null = "8.12.1";
  targetAvailable = true;
  signs = true;
  builds = true;
  installs = true;
  starts = true;
  streams = true;
  acts = true;
  releases = true;
  retained = 0;
  ports = 0;
  derivedDataMb = 0;
  leaseOverride: Partial<WdaTargetLease> | null = null;
  stream_: WdaStreamResult = {
    frames: [
      { sequence: 1, bytes: 131_072, sha256: "a".repeat(64), secureFieldsPresent: false, redacted: false },
      { sequence: 2, bytes: 118_400, sha256: "b".repeat(64), secureFieldsPresent: true, redacted: true },
    ],
    durationMs: 4_000,
    framesPerSecond: 10,
  };
  actionResult: WdaActionResult = { accepted: 3, rejected: 0, durationMs: 900, detail: "fixture actions accepted" };
  readonly acquired: string[] = [];
  readonly released: string[] = [];
  readonly built: string[] = [];
  readonly acted: WdaAction[] = [];

  probeHost(): WdaHostProbe {
    return { ...this.host };
  }

  probeToolchain(): { installed: boolean; version: string | null } {
    return { installed: this.toolchainInstalled, version: this.toolchainInstalled ? this.toolchainVersion : null };
  }

  acquire(udid: string, workerId: string): WdaTargetLease | null {
    if (!this.targetAvailable) return null;
    this.acquired.push(udid);
    return {
      udid,
      targetClass: "ios-simulator",
      leaseId: `lease-${udid}`,
      ownerWorkerId: workerId,
      expiresAtEpochMs: 1_700_000_600_000,
      ...this.leaseOverride,
    };
  }

  signingApproved(_lease: WdaTargetLease): boolean {
    return this.signs;
  }

  build(lease: WdaTargetLease): boolean {
    if (!this.builds) return false;
    this.built.push(lease.udid);
    return true;
  }

  install(_lease: WdaTargetLease): boolean {
    return this.installs;
  }

  start(_lease: WdaTargetLease): boolean {
    return this.starts;
  }

  stream(_lease: WdaTargetLease, _seconds: number): WdaStreamResult | null {
    if (!this.streams) return null;
    return { ...this.stream_, frames: this.stream_.frames.map((frame) => ({ ...frame })) };
  }

  act(_lease: WdaTargetLease, actions: WdaAction[]): WdaActionResult | null {
    if (!this.acts) return null;
    this.acted.push(...actions);
    return { ...this.actionResult };
  }

  release(lease: WdaTargetLease): boolean {
    if (!this.releases) return false;
    this.released.push(lease.leaseId);
    return true;
  }

  retainedProcesses(): number {
    return this.retained;
  }

  retainedPorts(): number {
    return this.ports;
  }

  retainedDerivedDataMb(): number {
    return this.derivedDataMb;
  }
}
