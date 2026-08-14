import { createHash } from "node:crypto";
import type { SecurityOpaqueRef } from "../../../../../packages/contracts/src/security/index.ts";
import {
  BROKER_AUDIT_SCHEMA,
  type BrokerAuditReceipt,
  type BrokerLease,
  type BrokerPolicy,
  type BrokerRequest,
  type BrokerResult,
  type BrokerState,
  type BrokerTransport,
  type OpenBaoProviderConfig,
  type OpenBaoServerSubject,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
// SEC-BAO-003. One rule, an allowlist: a path is a bounded sequence of lowercase segments and
// nothing else. Every wildcard, glob class and traversal fails it by construction, so there is
// no separate wildcard denylist -- a denylist here would be dominated by this regex and could
// never fire, which a plant check makes visible immediately.
const EXACT_PATH = /^[a-z0-9][a-z0-9-]{0,63}(?:\/[a-z0-9][a-z0-9-]{0,63}){1,6}$/;

export function fail(message: string): never {
  throw new Error(`invalid broker contract: ${message}`);
}

export function assertServerSubject(server: OpenBaoServerSubject): OpenBaoServerSubject {
  if (!SAFE_ID.test(server.id)) fail("server.id is invalid");
  if (!SAFE_VERSION.test(server.version)) fail("server.version is invalid");
  if (!GIT_OID.test(server.sourceCommit)) fail("server.sourceCommit must be a full 40-hex object ID");
  if (server.license !== "MPL-2.0") fail("server.license is not the admitted licence");
  for (const [name, digest] of [
    ["artifactSha256", server.artifactSha256],
    ["licenseSha256", server.licenseSha256],
    ["sbomSha256", server.sbomSha256],
    ["noticesSha256", server.noticesSha256],
  ] as const) {
    if (!SHA_256.test(digest)) fail(`server.${name} is invalid`);
  }
  return server;
}

export function assertPolicy(policy: BrokerPolicy): BrokerPolicy {
  if (!EXACT_PATH.test(policy.path)) fail(`policy path ${policy.path} is not an exact bounded path`);
  if (!SAFE_ID.test(policy.workflowId)) fail("policy workflowId is invalid");
  if (!Number.isSafeInteger(policy.policyEpoch) || policy.policyEpoch < 0) fail("policy epoch is invalid");
  return policy;
}

function auditDigest(receipt: Omit<BrokerAuditReceipt, "auditDigest">): string {
  return createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
}

export function verifyAudit(receipt: BrokerAuditReceipt): boolean {
  const { auditDigest: declared, ...rest } = receipt;
  return declared === auditDigest(rest);
}

export class OpenBaoBrokerProvider {
  readonly #server: OpenBaoServerSubject;
  readonly #transport: BrokerTransport;
  readonly #policies: BrokerPolicy[];
  readonly #maxLeaseMs: number;

  constructor(config: OpenBaoProviderConfig, transport: BrokerTransport) {
    this.#server = assertServerSubject(config.server);
    if (config.policies.length === 0) fail("a broker with no policy grants nothing and must not be constructed");
    this.#policies = config.policies.map((policy) => assertPolicy(policy));
    if (!Number.isSafeInteger(config.maxLeaseMs) || config.maxLeaseMs <= 0 || config.maxLeaseMs > 3_600_000) {
      fail("config.maxLeaseMs must be a bounded positive duration");
    }
    this.#maxLeaseMs = config.maxLeaseMs;
    this.#transport = transport;
  }

  get serverSubject(): OpenBaoServerSubject {
    return { ...this.#server };
  }

  // SEC-BAO-003 and SEC-BAO-005. The grant must match the exact path, operation, workflow and
  // epoch. A caller that swaps the ref, the audience or the operation matches no policy, so a
  // cross-workflow substitution is refused rather than served under someone else's grant.
  #grantFor(request: BrokerRequest): BrokerPolicy | null {
    return this.#policies.find((policy) =>
      policy.path === request.path
      && policy.operation === request.operation
      && policy.workflowId === request.workflowId
      && policy.policyEpoch === request.policyEpoch) ?? null;
  }

  #audit(request: BrokerRequest, lease: BrokerLease | null, result: BrokerAuditReceipt["result"], byteLength: number | null): BrokerAuditReceipt {
    const base: Omit<BrokerAuditReceipt, "auditDigest"> = {
      schema: BROKER_AUDIT_SCHEMA,
      serverVersion: this.#server.version,
      refKind: request.ref.kind,
      refId: request.ref.id,
      path: request.path,
      operation: request.operation,
      workflowId: request.workflowId,
      actorId: request.actorId,
      policyEpoch: request.policyEpoch,
      leaseId: lease?.leaseId ?? "none",
      result,
      valueByteLength: byteLength,
    };
    return { ...base, auditDigest: auditDigest(base) };
  }

  #refused(request: BrokerRequest, lifecycle: BrokerState[], outcome: BrokerResult["outcome"], result: BrokerAuditReceipt["result"]): BrokerResult {
    const audit = this.#audit(request, null, result, null);
    // Even a refusal is audited, and the audit is written before the result is returned: an
    // unwritten audit is itself a failure rather than a silent success.
    if (!this.#transport.writeAudit(audit)) {
      return { lifecycle: [...lifecycle, "AUDIT_FAILED"], outcome: "AUDIT_FAILED", audit: null, sealed: null };
    }
    return { lifecycle, outcome, audit, sealed: null };
  }

  request(request: BrokerRequest, nowEpochMs: number): BrokerResult {
    const lifecycle: BrokerState[] = ["UNRESOLVED"];
    if (!EXACT_PATH.test(request.path)) fail(`request path ${request.path} is not an exact bounded path`);

    const probe = this.#transport.probe();
    if (probe.state !== "AVAILABLE" || probe.version !== this.#server.version) {
      return this.#refused(request, [...lifecycle, "ABSENT_SERVER"], "ABSENT_SERVER", "FAILED");
    }
    lifecycle.push("SERVER_ADMITTED", "AUTHENTICATING");

    const authenticated = this.#transport.authenticate(request.actorId, request.workflowId);
    if (authenticated === null) {
      return this.#refused(request, [...lifecycle, "ABSENT_AUTH"], "ABSENT_AUTH", "REFUSED");
    }

    if (this.#grantFor(request) === null) {
      return this.#refused(request, [...lifecycle, "POLICY_REFUSED"], "POLICY_REFUSED", "REFUSED");
    }

    const lease = this.#transport.issueLease(request, nowEpochMs);
    if (lease === null) {
      return this.#refused(request, [...lifecycle, "AUTH_REFUSED"], "AUTH_REFUSED", "REFUSED");
    }
    if (lease.expiresAtEpochMs - lease.issuedAtEpochMs > this.#maxLeaseMs) {
      return this.#refused(request, [...lifecycle, "POLICY_REFUSED"], "POLICY_REFUSED", "REFUSED");
    }
    // SEC-BAO-005 again, at the lease: a lease issued for another workflow, actor or path
    // cannot be spent here even if the transport handed one back.
    if (lease.workflowId !== request.workflowId || lease.actorId !== request.actorId || lease.path !== request.path) {
      return this.#refused(request, [...lifecycle, "POLICY_REFUSED"], "POLICY_REFUSED", "REFUSED");
    }
    lifecycle.push("LEASE_ISSUED");

    // SEC-BAO-004. Expiry and revocation are checked at the moment of use, not at issue.
    if (lease.revoked || nowEpochMs >= lease.expiresAtEpochMs) {
      return this.#refused(request, [...lifecycle, "LEASE_EXPIRED"], "LEASE_EXPIRED", "REFUSED");
    }
    lifecycle.push("OPERATION_AUTHORIZED");

    const sealed = this.#transport.execute(lease, request);
    if (sealed === null) {
      const audit = this.#audit(request, lease, "FAILED", null);
      this.#transport.writeAudit(audit);
      return { lifecycle: [...lifecycle, "OPERATION_FAILED"], outcome: "OPERATION_FAILED", audit, sealed: null };
    }
    lifecycle.push("OPERATION_EXECUTED");

    // SEC-BAO-007. The receipt records how many bytes were handled, never which bytes.
    const audit = this.#audit(request, lease, "OK", sealed.byteLength);
    if (!this.#transport.writeAudit(audit)) {
      // SEC-BAO-006. An unwritten audit does not become a successful operation, and the lease
      // is still revoked so nothing is left usable.
      this.#transport.revoke(lease);
      return { lifecycle: [...lifecycle, "AUDIT_FAILED"], outcome: "AUDIT_FAILED", audit: null, sealed: null };
    }
    lifecycle.push("AUDITED");

    if (!this.#transport.revoke(lease)) {
      return { lifecycle: [...lifecycle, "REVOCATION_FAILED"], outcome: "REVOCATION_FAILED", audit, sealed: null };
    }
    lifecycle.push("LEASE_REVOKED");
    return { lifecycle, outcome: "LEASE_REVOKED", audit, sealed };
  }

  // SEC-BAO-008. Residue is counted, not assumed absent.
  cleanup(): BrokerState {
    return this.#transport.residualTokens() === 0 ? "LEASE_REVOKED" : "FAILED_CLEANUP";
  }
}

export function brokerRef(kind: SecurityOpaqueRef["kind"], id: string, sha256: string): SecurityOpaqueRef {
  if (!SAFE_ID.test(id)) fail("broker ref id is invalid");
  if (!SHA_256.test(sha256)) fail("broker ref sha256 is invalid");
  return { kind, id, sha256 };
}
