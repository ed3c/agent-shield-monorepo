import { SealedSecret } from "./sealed.ts";
import type {
  BrokerAuditReceipt,
  BrokerLease,
  BrokerProbeState,
  BrokerRequest,
  BrokerTransport,
} from "./types.ts";

// Deterministic in-memory stand-in. It holds a planted canary value so the selftest can scan
// every surface for it; the value is only ever handed out inside a SealedSecret.
export class FakeBroker implements BrokerTransport {
  probeState: BrokerProbeState = "AVAILABLE";
  version: string | null = "2.2.0";
  authenticates = true;
  issues = true;
  executes = true;
  auditWrites = true;
  revokes = true;
  leaseMs = 60_000;
  leaseOverride: Partial<BrokerLease> | null = null;
  residual = 0;
  readonly audits: BrokerAuditReceipt[] = [];
  readonly canary: string;

  constructor(canary = "CANARY-b4d5ecre7-do-not-leak") {
    this.canary = canary;
  }

  probe(): { state: BrokerProbeState; version: string | null } {
    return { state: this.probeState, version: this.probeState === "ABSENT" ? null : this.version };
  }

  authenticate(actorId: string, workflowId: string): string | null {
    return this.authenticates ? `session:${actorId}:${workflowId}` : null;
  }

  issueLease(request: BrokerRequest, nowEpochMs: number): BrokerLease | null {
    if (!this.issues) return null;
    return {
      leaseId: `lease-${request.workflowId}`,
      path: request.path,
      workflowId: request.workflowId,
      actorId: request.actorId,
      policyEpoch: request.policyEpoch,
      issuedAtEpochMs: nowEpochMs,
      expiresAtEpochMs: nowEpochMs + this.leaseMs,
      revoked: false,
      ...this.leaseOverride,
    };
  }

  execute(_lease: BrokerLease, request: BrokerRequest): SealedSecret | null {
    return this.executes ? new SealedSecret(request.ref.id, this.canary) : null;
  }

  writeAudit(receipt: BrokerAuditReceipt): boolean {
    if (!this.auditWrites) return false;
    this.audits.push(receipt);
    return true;
  }

  revoke(_lease: BrokerLease): boolean {
    return this.revokes;
  }

  residualTokens(): number {
    return this.residual;
  }
}
