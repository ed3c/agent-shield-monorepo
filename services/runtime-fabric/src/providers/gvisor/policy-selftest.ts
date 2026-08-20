import {
  GVisorPolicyError,
  evaluateIsolationPolicy,
  fixedBaseline,
  fixedPolicyRequest,
} from "./policy.ts";
import { deterministicFixture } from "./contract.ts";

function expect(code: string, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof GVisorPolicyError && error.code === code) {
      console.log(`${code}: RED/${code}`);
      return;
    }
    throw error;
  }
  throw new Error(`${code}: planted control survived`);
}

const packet = deterministicFixture();
const baseline = fixedBaseline();
const request = fixedPolicyRequest(packet);
const decision = evaluateIsolationPolicy(request, baseline);
if (decision.decision !== "ADMITTED" || decision.liveEnforcementState !== "NOT_EXERCISED") throw new Error("policy promoted live");
console.log("P1: PASS deny-all deterministic isolation policy admission");

const allowPacket = structuredClone(packet);
allowPacket.isolationPolicy.network = { mode: "allowlist", allowlist: ["api.example.invalid:443"] };
const allowDecision = evaluateIsolationPolicy(fixedPolicyRequest(allowPacket), baseline);
if (allowDecision.networkMode !== "allowlist") throw new Error("allowlist lost");
console.log("P2: PASS exact bounded network allowlist policy");

const health = structuredClone(request) as any; health.selectionAuthority = "PROVIDER_HEALTH"; health.providerHealthObservation = "AVAILABLE";
expect("NON_POLICY_ADMISSION_AUTHORITY", () => evaluateIsolationPolicy(health, baseline));

const capability = structuredClone(request); capability.requestedCapabilities.push("host.docker.socket");
expect("CAPABILITY_POLICY_WIDENING", () => evaluateIsolationPolicy(capability, baseline));

const mountPacket = structuredClone(packet); mountPacket.isolationPolicy.mounts.push({ sourceClass: "WORKSPACE", target: "/opt/extra", mode: "rw" });
expect("FILESYSTEM_POLICY_WIDENING", () => evaluateIsolationPolicy(fixedPolicyRequest(mountPacket), baseline));

const networkPacket = structuredClone(packet); networkPacket.isolationPolicy.network = { mode: "allowlist", allowlist: ["other.example.invalid:443"] };
expect("NETWORK_POLICY_WIDENING", () => evaluateIsolationPolicy(fixedPolicyRequest(networkPacket), baseline));

const resourcePacket = structuredClone(packet); resourcePacket.isolationPolicy.resources.memoryBytes = baseline.maxResources.memoryBytes + 1;
expect("RESOURCE_POLICY_WIDENING", () => evaluateIsolationPolicy(fixedPolicyRequest(resourcePacket), baseline));

const cleanup = structuredClone(request) as any; cleanup.cleanupRequirement = "TASK_SUCCESS_IMPLIES_CLEAN";
expect("CLEANUP_INFERRED_FROM_TASK_SUCCESS", () => evaluateIsolationPolicy(cleanup, baseline));

const live = structuredClone(request) as any; live.livePolicyState = "PASS";
expect("DETERMINISTIC_POLICY_AS_LIVE_ISOLATION", () => evaluateIsolationPolicy(live, baseline));

const baselineWildcard = structuredClone(baseline); baselineWildcard.allowedNetworkEndpoints = ["*:443"];
expect("BASELINE_NETWORK_INVALID", () => evaluateIsolationPolicy(request, baselineWildcard));

const hostBaseline = structuredClone(baseline); hostBaseline.allowedMountTargets = ["/workspace", "/home/runner"];
expect("BASELINE_MOUNT_INVALID", () => evaluateIsolationPolicy(request, hostBaseline));

console.log("PASS: DA-GV-P isolation policy positive paths + planted controls");
