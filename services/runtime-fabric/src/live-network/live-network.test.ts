import { preflightLiveNetwork } from "./preflight.ts";
import { validateLiveNetworkObservation } from "./evidence.ts";
import { isForbiddenResolvedAddress } from "./policy.ts";
import type { LiveNetworkObservation, LiveNetworkPolicy, LiveNetworkPreflightInput } from "./types.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const D = "a".repeat(64);
const policy: LiveNetworkPolicy = {
  epoch: "policy-7",
  destinations: [{ host: "example.com", port: 443 }],
};

function input(): LiveNetworkPreflightInput {
  return {
    subject: {
      providerId: "openshell-tmux-local",
      providerVersion: "1.0.0",
      providerDigest: D,
      environmentDigest: D,
      policyDigest: D,
      workloadDigest: D,
      taskPacketDigest: D,
    },
    policy,
    requested: { host: "example.com", port: 443 },
    environment: {},
  };
}

function observation(): LiveNetworkObservation {
  return {
    subject: input().subject,
    dns: {
      requestedHost: "example.com",
      requestedPort: 443,
      cnameChain: ["edge.example.com"],
      resolvedAddresses: ["93.184.216.34"],
      policyEpoch: "policy-7",
    },
    cleanup: {
      processResidue: false,
      workspaceResidue: false,
      sessionResidue: false,
      networkResidue: false,
      completedWithinGrace: true,
    },
    outcome: "SUCCESS",
    stdoutDigest: D,
    stderrDigest: D,
    artifactDigest: D,
    observedAt: "2026-08-17T00:00:00.000Z",
  };
}

const ready = preflightLiveNetwork(input());
ok(ready.state === "READY_FOR_LIVE_EXECUTION", "valid exact subject should be ready for live execution");
ok(!("LIVE_PASS" in ready), "preflight must never manufacture LIVE_PASS");

const direct = input();
direct.requested.host = "93.184.216.34";
ok(preflightLiveNetwork(direct).state === "REFUSED_PRECONDITION", "direct IP must be refused");

const alternatePort = input();
alternatePort.requested.port = 80;
ok(preflightLiveNetwork(alternatePort).reasons.includes("destination-not-admitted"), "alternate port must be denied");

const proxy = input();
proxy.environment.HTTPS_PROXY = "http://127.0.0.1:8080";
ok(
  preflightLiveNetwork(proxy).reasons.some((value) => value.startsWith("proxy-environment-active:")),
  "proxy environment widening must be refused",
);

const malformed = input();
malformed.subject.providerVersion = "";
malformed.subject.policyDigest = "not-a-digest";
const malformedResult = preflightLiveNetwork(malformed);
ok(malformedResult.reasons.includes("provider-version-absent"), "provider version must be bound");
ok(malformedResult.reasons.includes("subject-digest-invalid"), "all immutable subjects must use sha256 digests");

for (const address of [
  "127.0.0.1",
  "10.0.0.1",
  "169.254.169.254",
  "172.16.0.1",
  "192.168.1.1",
  "192.0.2.1",
  "198.51.100.1",
  "203.0.113.1",
  "224.0.0.1",
  "::1",
  "fc00::1",
  "fe80::1",
  "ff02::1",
  "2001:db8::1",
]) {
  ok(isForbiddenResolvedAddress(address), `forbidden address escaped: ${address}`);
}
ok(!isForbiddenResolvedAddress("93.184.216.34"), "public IPv4 should not be classified as forbidden");
ok(!isForbiddenResolvedAddress("2606:4700:4700::1111"), "public IPv6 should not be classified as forbidden");

const rebound = observation();
rebound.dns.resolvedAddresses = ["93.184.216.34", "169.254.169.254"];
rebound.dns.policyEpoch = "policy-6";
const reboundResult = validateLiveNetworkObservation(rebound, policy);
ok(!reboundResult.valid, "forbidden answer or stale epoch must invalidate evidence");
ok(reboundResult.reasons.includes("forbidden-resolved-address:169.254.169.254"), "metadata address must be named");
ok(reboundResult.reasons.includes("policy-epoch-mismatch"), "stale policy must be named");

const residue = observation();
residue.cleanup.networkResidue = true;
const residueResult = validateLiveNetworkObservation(residue, policy);
ok(residueResult.cleanupState === "FAILED_CLEANUP", "network residue must fail cleanup");
ok(!residueResult.valid, "failed cleanup cannot validate evidence");

const valid = validateLiveNetworkObservation(observation(), policy);
ok(valid.valid, "structurally complete provider observation should validate");
ok(valid.cleanupState === "PASS", "clean observation should retain PASS cleanup state");
ok(valid.resolvedAddressDigest.length === 64, "resolved address digest must be sha256-shaped");
ok(valid.evidenceDigest.length === 64, "evidence digest must be sha256-shaped");

console.log("LIVE-NET GREEN: exact subject/destination preflight, proxy refusal, DNS/IP controls, cleanup and evidence honesty");
