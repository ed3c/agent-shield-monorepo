import type { ActivityKind, ActivityPort, EvidenceEpochs, RiskTier } from "./types.ts";

// Deterministic activity port. Every knob a control needs is exposed, including the ability to
// revoke an epoch part-way through so the workflow meets a drifted subject at signing time.
export class FakeActivityPort implements ActivityPort {
  tier: RiskTier = "low";
  failOn: ActivityKind | null = null;
  epochs: EvidenceEpochs = { policyEpoch: 4, challengeEpoch: 2, deviceEpoch: 7 };
  // Applied the first time the named activity runs, so a revocation lands during a wait.
  revokeBefore: ActivityKind | null = null;
  revokedEpochs: EvidenceEpochs = { policyEpoch: 5, challengeEpoch: 2, deviceEpoch: 7 };
  workers = 1;
  shutsDown = true;
  readonly calls: string[] = [];

  run(activity: ActivityKind, idempotencyKey: string): ReturnType<ActivityPort["run"]> {
    this.calls.push(idempotencyKey);
    if (this.revokeBefore === activity) {
      this.epochs = { ...this.revokedEpochs };
      this.revokeBefore = null;
    }
    if (this.failOn === activity) return { ok: false, detail: `fake ${activity} failed` };
    if (activity === "evaluate-policy") return { ok: true, tier: this.tier, epochs: { ...this.epochs }, detail: "policy evaluated" };
    if (activity === "await-hardware") return { ok: true, epochs: { ...this.epochs }, detail: "hardware evidence verified" };
    return { ok: true, detail: `${activity} completed` };
  }

  currentEpochs(): EvidenceEpochs {
    return { ...this.epochs };
  }

  activeWorkers(): number {
    return this.workers;
  }

  shutdown(): boolean {
    if (!this.shutsDown) return false;
    this.workers = 0;
    return true;
  }
}
