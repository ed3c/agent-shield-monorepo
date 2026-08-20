import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  GVisorContractError,
  OFFICIAL_GVISOR_SOURCE,
  deterministicFixture,
  sourceOnlyCandidate,
  validateAdmissionPacket,
} from "./contract.ts";
import {
  GVisorAdapterError,
  buildLaunchPlan,
  deterministicObservation,
  validateObservation,
} from "./adapter.ts";
import {
  GVisorPolicyError,
  evaluateIsolationPolicy,
  fixedBaseline,
  fixedPolicyRequest,
} from "./policy.ts";

const ROOT = process.cwd();
const PREFLIGHT_PATH = join(ROOT, "services/runtime-fabric/src/providers/gvisor/matrix-preflight.json");
const REQUIRED = new Set([
  "source_candidate_unresolved",
  "deterministic_admission",
  "runsc_plan_only",
  "timeout_distinct",
  "connection_unknown",
  "policy_deny_all",
  "policy_allowlist",
  "filesystem_baseline",
  "network_baseline",
  "resource_baseline",
  "cleanup_independent",
  "live_states_not_exercised",
  "shared_owner_separation",
  "upstream_license_binding",
]);

class MatrixError extends Error {
  constructor(public readonly code: string, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

function refuse(code: string, detail = ""): never {
  throw new MatrixError(code, detail);
}

function gitBlob(path: string): string {
  const result = spawnSync("git", ["hash-object", path], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) refuse("SIBLING_BLOB_READ_FAILED", path);
  return String(result.stdout).trim();
}

function verifyPreflight(preflight: any): void {
  if (preflight?.schema !== "agent-shield/gvisor/convergence-preflight/v1") refuse("PREFLIGHT_SCHEMA_DRIFT");
  if (preflight.common_parent?.commit !== "8cc1bea3c307b3fd89de001173a90fea45e7d77a") refuse("COMMON_PARENT_DRIFT");
  for (const side of ["adapter", "policy"] as const) {
    const files = preflight?.[side]?.files;
    if (!files || typeof files !== "object") refuse("SIBLING_BLOB_DRIFT", side);
    for (const [path, expected] of Object.entries(files)) {
      if (gitBlob(path) !== expected) refuse("SIBLING_BLOB_DRIFT", path);
    }
  }
  const upstream = preflight.official_upstream;
  if (
    upstream?.repository !== OFFICIAL_GVISOR_SOURCE.repository ||
    upstream?.commit !== OFFICIAL_GVISOR_SOURCE.commit ||
    upstream?.tree !== OFFICIAL_GVISOR_SOURCE.tree ||
    upstream?.license_blob !== OFFICIAL_GVISOR_SOURCE.licenseBlob ||
    upstream?.license_id !== OFFICIAL_GVISOR_SOURCE.licenseId
  ) {
    refuse("UPSTREAM_SUBJECT_DRIFT");
  }
  const denominator = preflight.complete_denominator;
  if (!Array.isArray(denominator) || new Set(denominator).size !== REQUIRED.size || ![...REQUIRED].every((item) => denominator.includes(item))) {
    refuse("INCOMPLETE_GVISOR_DENOMINATOR");
  }
  if (preflight.evidence_ceiling !== "COMPLETE_DETERMINISTIC_GVISOR_MATRIX_ONLY") refuse("EVIDENCE_CEILING_DRIFT");
}

function expect(code: string, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    if (
      (error instanceof MatrixError || error instanceof GVisorContractError || error instanceof GVisorAdapterError || error instanceof GVisorPolicyError) &&
      error.code === code
    ) {
      console.log(`${code}: RED/${code}`);
      return;
    }
    throw error;
  }
  throw new Error(`${code}: planted control survived`);
}

const preflight = JSON.parse(String(readFileSync(PREFLIGHT_PATH, "utf8")));
verifyPreflight(preflight);
console.log("P1: PASS exact sibling Git-blob materialization + upstream source/license binding");

validateAdmissionPacket(sourceOnlyCandidate());
const packet = deterministicFixture();
validateAdmissionPacket(packet);
const plan = buildLaunchPlan(packet);
const success = validateObservation(plan, deterministicObservation(plan, "SUCCESS"));
const timeout = validateObservation(plan, deterministicObservation(plan, "TIMEOUT"));
const unknown = validateObservation(plan, deterministicObservation(plan, "CONNECTION_LOST"));
if (success.stateProposal !== "EXECUTION_OBSERVED_PENDING_LIVE_PROOF" || timeout.stateProposal !== "TIMED_OUT" || unknown.stateProposal !== "RESULT_UNKNOWN") {
  refuse("OUTCOME_STATE_COLLAPSE");
}

const baseline = fixedBaseline();
const denyDecision = evaluateIsolationPolicy(fixedPolicyRequest(packet), baseline);
const allowPacket = structuredClone(packet);
allowPacket.isolationPolicy.network = { mode: "allowlist", allowlist: ["api.example.invalid:443"] };
const allowDecision = evaluateIsolationPolicy(fixedPolicyRequest(allowPacket), baseline);
if (denyDecision.networkMode !== "deny-all" || allowDecision.networkMode !== "allowlist") refuse("NETWORK_MODE_COLLAPSE");
if (denyDecision.liveEnforcementState !== "NOT_EXERCISED" || plan.liveExecutionState !== "NOT_EXERCISED") refuse("LIVE_EVIDENCE_LAUNDERING");
if (packet.sharedRegistryWrite !== "FORBIDDEN" || packet.sharedStatusWrite !== "FORBIDDEN" || packet.releaseWrite !== "FORBIDDEN") refuse("SHARED_OWNER_DRIFT");
console.log("P2: PASS complete deterministic gVisor denominator 14/14");

const blobDrift = structuredClone(preflight); blobDrift.adapter.files["services/runtime-fabric/src/providers/gvisor/adapter.ts"] = "0".repeat(40);
expect("SIBLING_BLOB_DRIFT", () => verifyPreflight(blobDrift));

const denominator = structuredClone(preflight); denominator.complete_denominator.pop();
expect("INCOMPLETE_GVISOR_DENOMINATOR", () => verifyPreflight(denominator));

const upstream = structuredClone(preflight); upstream.official_upstream.commit = "0".repeat(40);
expect("UPSTREAM_SUBJECT_DRIFT", () => verifyPreflight(upstream));

const livePacket = structuredClone(packet) as any; livePacket.liveIsolationState = "PASS";
expect("SOURCE_OR_FIXTURE_AS_LIVE_ISOLATION", () => validateAdmissionPacket(livePacket));

const shared = structuredClone(packet) as any; shared.sharedRegistryWrite = "ALLOWED";
expect("SHARED_CONVERGENCE_OWNER_BYPASS", () => validateAdmissionPacket(shared));

const health = structuredClone(fixedPolicyRequest(packet)) as any; health.selectionAuthority = "PROVIDER_HEALTH"; health.providerHealthObservation = "AVAILABLE";
expect("NON_POLICY_ADMISSION_AUTHORITY", () => evaluateIsolationPolicy(health, baseline));

const dirty = deterministicObservation(plan); dirty.residue = ["container:fixture"];
expect("FIXTURE_CLEANUP_AS_LIVE", () => validateObservation(plan, dirty));

const promotedObservation = deterministicObservation(plan) as any; promotedObservation.isolationState = "PASS";
expect("PLAN_OR_FIXTURE_AS_LIVE_ISOLATION", () => validateObservation(plan, promotedObservation));

console.log("PASS: DA-GV-E complete deterministic gVisor provider/isolation matrix + convergence controls");
