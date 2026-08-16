import { describe, expect, test } from "bun:test";
import { preflightLiveNetwork } from "./preflight.ts";
import { validateLiveNetworkObservation } from "./evidence.ts";
import { isForbiddenResolvedAddress } from "./policy.ts";
import type { LiveNetworkObservation, LiveNetworkPolicy, LiveNetworkPreflightInput } from "./types.ts";

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

describe("LIVE-NET preflight", () => {
  test("only reaches READY_FOR_LIVE_EXECUTION; it never emits a live PASS", () => {
    const result = preflightLiveNetwork(input());
    expect(result.state).toBe("READY_FOR_LIVE_EXECUTION");
    expect("LIVE_PASS" in result).toBe(false);
  });

  test("refuses direct IP, alternate port and hidden proxy widening", () => {
    const direct = input();
    direct.requested.host = "93.184.216.34";
    expect(preflightLiveNetwork(direct).state).toBe("REFUSED_PRECONDITION");

    const port = input();
    port.requested.port = 80;
    expect(preflightLiveNetwork(port).reasons).toContain("destination-not-admitted");

    const proxy = input();
    proxy.environment.HTTPS_PROXY = "http://127.0.0.1:8080";
    expect(preflightLiveNetwork(proxy).reasons.some((value) => value.startsWith("proxy-environment-active:"))).toBe(true);
  });

  test("refuses missing subject identity and malformed digests", () => {
    const value = input();
    value.subject.providerVersion = "";
    value.subject.policyDigest = "not-a-digest";
    const result = preflightLiveNetwork(value);
    expect(result.reasons).toContain("provider-version-absent");
    expect(result.reasons).toContain("subject-digest-invalid");
  });
});

describe("LIVE-NET DNS and cleanup evidence validator", () => {
  test("classifies private, metadata, documentation and multicast ranges as forbidden", () => {
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
      expect(isForbiddenResolvedAddress(address)).toBe(true);
    }
    expect(isForbiddenResolvedAddress("93.184.216.34")).toBe(false);
    expect(isForbiddenResolvedAddress("2606:4700:4700::1111")).toBe(false);
  });

  test("rejects a forbidden resolved answer and stale policy epoch", () => {
    const value = observation();
    value.dns.resolvedAddresses = ["93.184.216.34", "169.254.169.254"];
    value.dns.policyEpoch = "policy-6";
    const result = validateLiveNetworkObservation(value, policy);
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("forbidden-resolved-address:169.254.169.254");
    expect(result.reasons).toContain("policy-epoch-mismatch");
  });

  test("cleanup residue is independently fatal", () => {
    const value = observation();
    value.cleanup.networkResidue = true;
    const result = validateLiveNetworkObservation(value, policy);
    expect(result.cleanupState).toBe("FAILED_CLEANUP");
    expect(result.valid).toBe(false);
  });

  test("validates a structurally complete provider observation without claiming production availability", () => {
    const result = validateLiveNetworkObservation(observation(), policy);
    expect(result.valid).toBe(true);
    expect(result.cleanupState).toBe("PASS");
    expect(result.resolvedAddressDigest).toHaveLength(64);
    expect(result.evidenceDigest).toHaveLength(64);
  });
});
