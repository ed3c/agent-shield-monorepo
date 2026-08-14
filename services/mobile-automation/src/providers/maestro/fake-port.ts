import type { AppArtifact, FlowBundle, MaestroPort, MaestroRunResult, TargetLease } from "./types.ts";

// Deterministic in-memory stand-in for the host-owned simulator port. No simulator, emulator,
// device or Maestro binary is contacted.
export class FakeMaestroPort implements MaestroPort {
  available = true;
  version: string | null = "1.39.0";
  installs = true;
  runs = true;
  releases = true;
  retained = 0;
  leaseOverride: Partial<TargetLease> | null = null;
  result: MaestroRunResult = {
    passedAssertions: 3,
    failedAssertions: 0,
    durationMs: 5_000,
    artifacts: [
      { kind: "junit-report", sha256: "d".repeat(64), bytes: 4_096 },
      { kind: "screenshot", sha256: "e".repeat(64), bytes: 65_536 },
    ],
    detail: "fixture flow completed",
  };
  readonly acquired: string[] = [];
  readonly released: string[] = [];
  readonly installed: AppArtifact[] = [];
  readonly ran: string[] = [];

  probe(): { available: boolean; version: string | null } {
    return { available: this.available, version: this.available ? this.version : null };
  }

  acquire(targetId: string, workerId: string): TargetLease | null {
    if (!this.available) return null;
    this.acquired.push(targetId);
    return {
      targetId,
      platform: "ios-simulator",
      leaseId: `lease-${targetId}`,
      ownerWorkerId: workerId,
      expiresAtEpochMs: 1_700_000_600_000,
      ...this.leaseOverride,
    };
  }

  install(_lease: TargetLease, app: AppArtifact): boolean {
    if (!this.installs) return false;
    this.installed.push(app);
    return true;
  }

  run(_lease: TargetLease, _bundle: FlowBundle, flowId: string): MaestroRunResult | null {
    if (!this.runs) return null;
    this.ran.push(flowId);
    return { ...this.result, artifacts: this.result.artifacts.map((artifact) => ({ ...artifact })) };
  }

  release(lease: TargetLease): boolean {
    if (!this.releases) return false;
    this.released.push(lease.leaseId);
    return true;
  }

  retainedProcesses(): number {
    return this.retained;
  }
}
