import { createHash } from "node:crypto";
import type { LiveNetworkPreflightInput, LiveNetworkPreflightResult } from "./types.ts";
import { activeProxyVariables, canonicalHost, destinationKey, isSha256, isValidHostname } from "./policy.ts";

function stableDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function preflightLiveNetwork(input: LiveNetworkPreflightInput): LiveNetworkPreflightResult {
  const reasons: string[] = [];
  const subject = input.subject;
  const digests = [
    subject.providerDigest,
    subject.environmentDigest,
    subject.policyDigest,
    subject.workloadDigest,
    subject.taskPacketDigest,
  ];

  if (!subject.providerId.trim()) reasons.push("provider-id-absent");
  if (!subject.providerVersion.trim()) reasons.push("provider-version-absent");
  if (digests.some((digest) => !isSha256(digest))) reasons.push("subject-digest-invalid");
  if (!input.policy.epoch.trim()) reasons.push("policy-epoch-absent");
  if (!isValidHostname(input.requested.host)) reasons.push("requested-host-invalid-or-direct-ip");
  if (!Number.isInteger(input.requested.port) || input.requested.port < 1 || input.requested.port > 65535) {
    reasons.push("requested-port-invalid");
  }

  const requestedKey = destinationKey(input.requested.host, input.requested.port);
  const admittedKeys = new Set(
    input.policy.destinations
      .filter((entry) => isValidHostname(entry.host) && Number.isInteger(entry.port) && entry.port >= 1 && entry.port <= 65535)
      .map((entry) => destinationKey(entry.host, entry.port)),
  );
  if (!admittedKeys.has(requestedKey)) reasons.push("destination-not-admitted");

  const proxies = activeProxyVariables(input.environment);
  if (proxies.length > 0) reasons.push(`proxy-environment-active:${proxies.join(",")}`);

  const normalizedSubject = {
    providerId: subject.providerId.trim(),
    providerVersion: subject.providerVersion.trim(),
    providerDigest: subject.providerDigest,
    environmentDigest: subject.environmentDigest,
    policyDigest: subject.policyDigest,
    workloadDigest: subject.workloadDigest,
    taskPacketDigest: subject.taskPacketDigest,
    policyEpoch: input.policy.epoch,
    destination: {
      host: canonicalHost(input.requested.host),
      port: input.requested.port,
    },
  };

  return {
    state: reasons.length === 0 ? "READY_FOR_LIVE_EXECUTION" : "REFUSED_PRECONDITION",
    reasons,
    destinationKey: requestedKey,
    subjectDigest: stableDigest(normalizedSubject),
  };
}
