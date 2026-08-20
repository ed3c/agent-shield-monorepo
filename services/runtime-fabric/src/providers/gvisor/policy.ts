import {
  GVisorContractError,
  digest,
  validateAdmissionPacket,
  type GVisorAdmissionPacket,
  type ResourceLimits,
} from "./contract.ts";

export const GVISOR_POLICY_DECISION_SCHEMA = "agent-shield/gvisor-policy/decision/v1" as const;

export interface IsolationBaseline {
  allowedMountTargets: string[];
  allowedNetworkEndpoints: string[];
  allowedCapabilities: string[];
  maxResources: ResourceLimits;
}

export interface IsolationPolicyRequest {
  packet: GVisorAdmissionPacket;
  requestedCapabilities: string[];
  selectionAuthority: "POLICY_ONLY";
  providerHealthObservation: "UNKNOWN" | "AVAILABLE" | "UNAVAILABLE";
  packagePresenceObserved: boolean;
  cleanupRequirement: "INDEPENDENT_RECEIPT";
  livePolicyState: "NOT_EXERCISED";
}

export interface IsolationPolicyDecision {
  schema: typeof GVISOR_POLICY_DECISION_SCHEMA;
  decision: "ADMITTED";
  providerId: "gvisor-runsc";
  packetDigest: string;
  baselineDigest: string;
  capabilitiesDigest: string;
  networkMode: "deny-all" | "allowlist";
  canonicalWriteMode: "OBSERVATION_ONLY";
  liveEnforcementState: "NOT_EXERCISED";
  evidenceCeiling: "DETERMINISTIC_GVISOR_POLICY_ONLY";
}

export class GVisorPolicyError extends Error {
  constructor(public readonly code: string, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

function refuse(code: string, detail = ""): never {
  throw new GVisorPolicyError(code, detail);
}

function uniqueClosed(values: string[], code: string): void {
  if (!Array.isArray(values) || new Set(values).size !== values.length) refuse(code);
  for (const value of values) {
    if (!value || value.includes("*") || value.includes("..")) refuse(code, value);
  }
}

function leqResources(actual: ResourceLimits, max: ResourceLimits): void {
  for (const key of ["cpuMillis", "memoryBytes", "pids", "timeoutMs", "maxOutputBytes", "maxArtifactBytes"] as const) {
    if (actual[key] > max[key]) refuse("RESOURCE_POLICY_WIDENING", key);
  }
}

export function validateBaseline(baseline: IsolationBaseline): void {
  uniqueClosed(baseline.allowedMountTargets, "BASELINE_MOUNT_INVALID");
  uniqueClosed(baseline.allowedNetworkEndpoints, "BASELINE_NETWORK_INVALID");
  uniqueClosed(baseline.allowedCapabilities, "BASELINE_CAPABILITY_INVALID");
  for (const endpoint of baseline.allowedNetworkEndpoints) {
    if (!/^[A-Za-z0-9.-]+:[0-9]{1,5}$/.test(endpoint)) refuse("BASELINE_NETWORK_INVALID", endpoint);
  }
  for (const target of baseline.allowedMountTargets) {
    if (!target.startsWith("/") || /^\/(Users|home|root)(\/|$)/.test(target) || /docker\.sock$/.test(target)) refuse("BASELINE_MOUNT_INVALID", target);
  }
  for (const key of ["cpuMillis", "memoryBytes", "pids", "timeoutMs", "maxOutputBytes", "maxArtifactBytes"] as const) {
    if (!Number.isInteger(baseline.maxResources[key]) || baseline.maxResources[key] <= 0) refuse("BASELINE_RESOURCE_INVALID", key);
  }
}

export function evaluateIsolationPolicy(request: IsolationPolicyRequest, baseline: IsolationBaseline): IsolationPolicyDecision {
  try {
    validateAdmissionPacket(request.packet);
  } catch (error) {
    if (error instanceof GVisorContractError) throw new GVisorPolicyError(error.code, error.message);
    throw error;
  }
  validateBaseline(baseline);
  if (request.selectionAuthority !== "POLICY_ONLY") refuse("NON_POLICY_ADMISSION_AUTHORITY");
  if (request.cleanupRequirement !== "INDEPENDENT_RECEIPT") refuse("CLEANUP_INFERRED_FROM_TASK_SUCCESS");
  if (request.livePolicyState !== "NOT_EXERCISED") refuse("DETERMINISTIC_POLICY_AS_LIVE_ISOLATION");
  uniqueClosed(request.requestedCapabilities, "CAPABILITY_SURFACE_INVALID");

  for (const capability of request.requestedCapabilities) {
    if (!baseline.allowedCapabilities.includes(capability)) refuse("CAPABILITY_POLICY_WIDENING", capability);
  }

  for (const mount of request.packet.isolationPolicy.mounts) {
    if (!baseline.allowedMountTargets.includes(mount.target)) refuse("FILESYSTEM_POLICY_WIDENING", mount.target);
  }

  const network = request.packet.isolationPolicy.network;
  if (network.mode === "allowlist") {
    for (const endpoint of network.allowlist) {
      if (!baseline.allowedNetworkEndpoints.includes(endpoint)) refuse("NETWORK_POLICY_WIDENING", endpoint);
    }
  }
  leqResources(request.packet.isolationPolicy.resources, baseline.maxResources);

  return {
    schema: GVISOR_POLICY_DECISION_SCHEMA,
    decision: "ADMITTED",
    providerId: "gvisor-runsc",
    packetDigest: digest(request.packet),
    baselineDigest: digest(baseline),
    capabilitiesDigest: digest([...request.requestedCapabilities].sort()),
    networkMode: network.mode,
    canonicalWriteMode: "OBSERVATION_ONLY",
    liveEnforcementState: "NOT_EXERCISED",
    evidenceCeiling: "DETERMINISTIC_GVISOR_POLICY_ONLY",
  };
}

export function fixedBaseline(): IsolationBaseline {
  return {
    allowedMountTargets: ["/workspace", "/tmp"],
    allowedNetworkEndpoints: ["api.example.invalid:443"],
    allowedCapabilities: ["filesystem.workspace", "process.bounded", "artifact.content-addressed"],
    maxResources: {
      cpuMillis: 120_000,
      memoryBytes: 1_073_741_824,
      pids: 128,
      timeoutMs: 120_000,
      maxOutputBytes: 2_097_152,
      maxArtifactBytes: 8_388_608,
    },
  };
}

export function fixedPolicyRequest(packet: GVisorAdmissionPacket): IsolationPolicyRequest {
  return {
    packet,
    requestedCapabilities: ["filesystem.workspace", "process.bounded", "artifact.content-addressed"],
    selectionAuthority: "POLICY_ONLY",
    providerHealthObservation: "UNKNOWN",
    packagePresenceObserved: false,
    cleanupRequirement: "INDEPENDENT_RECEIPT",
    livePolicyState: "NOT_EXERCISED",
  };
}
