import type {
  AdbHostProbe,
  ScrcpyAction,
  ScrcpyActionResult,
  ScrcpyPort,
  ScrcpyStreamStats,
  ScrcpyTargetLease,
} from "./types.ts";

// Deterministic in-memory stand-in for the host-owned ADB surface. No ADB server, emulator,
// handset, USB transport or scrcpy process is contacted, and the lease it returns is always an
// emulator -- so nothing reachable from here can stand in for physical-device evidence.
export class FakeScrcpyPort implements ScrcpyPort {
  adb: AdbHostProbe = { present: true, platformToolsVersion: "35.0.2", adbProtocolVersion: "1.0.41" };
  toolInstalled = true;
  toolVersion: string | null = "2.7";
  toolBinarySha256: string | null = "a".repeat(64);
  targetAvailable = true;
  starts = true;
  streams = true;
  acts = true;
  releases = true;
  retained = 0;
  forwards = 0;
  sockets = 0;
  tempBytes = 0;
  leaseOverride: Partial<ScrcpyTargetLease> | null = null;
  stats: ScrcpyStreamStats = {
    width: 1_080,
    height: 2_400,
    bitrateKbps: 4_000,
    framesPerSecond: 30,
    durationMs: 5_000,
    frameCount: 150,
    retainedBytes: 0,
  };
  actionResult: ScrcpyActionResult = { accepted: 3, rejected: 0, durationMs: 700, detail: "fixture input accepted" };
  readonly acquired: string[] = [];
  readonly released: string[] = [];
  readonly acted: ScrcpyAction[] = [];

  probeAdb(): AdbHostProbe {
    return { ...this.adb };
  }

  probeTool(): { installed: boolean; version: string | null; binarySha256: string | null } {
    if (!this.toolInstalled) return { installed: false, version: null, binarySha256: null };
    return { installed: true, version: this.toolVersion, binarySha256: this.toolBinarySha256 };
  }

  acquire(serial: string, workerId: string): ScrcpyTargetLease | null {
    if (!this.targetAvailable) return null;
    this.acquired.push(serial);
    return {
      serial,
      targetClass: "android-emulator",
      leaseId: `lease-${serial}`,
      ownerWorkerId: workerId,
      expiresAtEpochMs: 1_700_000_600_000,
      ...this.leaseOverride,
    };
  }

  start(_lease: ScrcpyTargetLease): boolean {
    return this.starts;
  }

  stream(_lease: ScrcpyTargetLease, _seconds: number): ScrcpyStreamStats | null {
    if (!this.streams) return null;
    return { ...this.stats };
  }

  act(_lease: ScrcpyTargetLease, actions: ScrcpyAction[]): ScrcpyActionResult | null {
    if (!this.acts) return null;
    this.acted.push(...actions);
    return { ...this.actionResult };
  }

  release(lease: ScrcpyTargetLease): boolean {
    if (!this.releases) return false;
    this.released.push(lease.leaseId);
    return true;
  }

  retainedProcesses(): number {
    return this.retained;
  }

  retainedForwards(): number {
    return this.forwards;
  }

  retainedSockets(): number {
    return this.sockets;
  }

  retainedTempBytes(): number {
    return this.tempBytes;
  }
}
