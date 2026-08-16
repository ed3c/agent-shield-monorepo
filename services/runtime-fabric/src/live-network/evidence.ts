import { createHash } from "node:crypto";
import type { LiveNetworkEvidenceValidation, LiveNetworkObservation, LiveNetworkPolicy } from "./types.ts";
import { canonicalHost, destinationKey, isForbiddenResolvedAddress, isSha256, isValidHostname } from "./policy.ts";

function digestLines(values: string[]): string {
  return createHash("sha256").update(values.join("\n")).digest("hex");
}

function stableDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function validateLiveNetworkObservation(
  observation: LiveNetworkObservation,
  policy: LiveNetworkPolicy,
): LiveNetworkEvidenceValidation {
  const reasons: string[] = [];
  const dns = observation.dns;

  if (!isValidHostname(dns.requestedHost)) reasons.push("dns-requested-host-invalid-or-direct-ip");
  if (!Number.isInteger(dns.requestedPort) || dns.requestedPort < 1 || dns.requestedPort > 65535) {
    reasons.push("dns-requested-port-invalid");
  }
  if (dns.policyEpoch !== policy.epoch) reasons.push("policy-epoch-mismatch");

  const admitted = new Set(policy.destinations.map((entry) => destinationKey(entry.host, entry.port)));
  if (!admitted.has(destinationKey(dns.requestedHost, dns.requestedPort))) reasons.push("dns-destination-not-admitted");

  if (dns.resolvedAddresses.length === 0) reasons.push("resolved-addresses-absent");
  for (const address of dns.resolvedAddresses) {
    if (isForbiddenResolvedAddress(address)) reasons.push(`forbidden-resolved-address:${address}`);
  }
  for (const cname of dns.cnameChain) {
    if (!isValidHostname(cname)) reasons.push(`cname-invalid:${cname}`);
  }

  const receiptDigests = [observation.stdoutDigest, observation.stderrDigest, observation.artifactDigest];
  if (receiptDigests.some((digest) => !isSha256(digest))) reasons.push("observation-digest-invalid");
  if (Number.isNaN(Date.parse(observation.observedAt))) reasons.push("observed-at-invalid");

  const cleanup = observation.cleanup;
  const cleanupState =
    cleanup.processResidue ||
    cleanup.workspaceResidue ||
    cleanup.sessionResidue ||
    cleanup.networkResidue ||
    !cleanup.completedWithinGrace
      ? "FAILED_CLEANUP"
      : "PASS";
  if (cleanupState === "FAILED_CLEANUP") reasons.push("cleanup-residue-or-grace-failure");

  const resolved = [...new Set(dns.resolvedAddresses.map((value) => value.toLowerCase()))].sort();
  const resolvedAddressDigest = digestLines(resolved);
  const evidenceDigest = stableDigest({
    providerId: observation.subject.providerId,
    providerVersion: observation.subject.providerVersion,
    providerDigest: observation.subject.providerDigest,
    environmentDigest: observation.subject.environmentDigest,
    policyDigest: observation.subject.policyDigest,
    workloadDigest: observation.subject.workloadDigest,
    taskPacketDigest: observation.subject.taskPacketDigest,
    host: canonicalHost(dns.requestedHost),
    port: dns.requestedPort,
    cnameChain: dns.cnameChain.map(canonicalHost),
    resolvedAddressDigest,
    policyEpoch: dns.policyEpoch,
    outcome: observation.outcome,
    stdoutDigest: observation.stdoutDigest,
    stderrDigest: observation.stderrDigest,
    artifactDigest: observation.artifactDigest,
    cleanupState,
    observedAt: observation.observedAt,
  });

  return {
    valid: reasons.length === 0,
    reasons,
    resolvedAddressDigest,
    cleanupState,
    evidenceDigest,
  };
}
