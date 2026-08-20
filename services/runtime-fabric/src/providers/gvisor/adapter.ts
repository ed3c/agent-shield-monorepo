import {
  GVisorContractError,
  digest,
  validateAdmissionPacket,
  type GVisorAdmissionPacket,
} from "./contract.ts";

export const RUNSC_PLAN_SCHEMA = "agent-shield/gvisor-runsc/launch-plan/v1" as const;
export const RUNSC_OBSERVATION_SCHEMA = "agent-shield/gvisor-runsc/observation/v1" as const;

export type RunscOutcome = "SUCCESS" | "FAILURE" | "TIMEOUT" | "CANCELLED" | "CONNECTION_LOST";

export interface RunscLaunchPlan {
  schema: typeof RUNSC_PLAN_SCHEMA;
  providerId: "gvisor-runsc";
  executableVersion: string;
  executableSha256: string;
  sbomDigest: string;
  imageDigest: string;
  workloadDigest: string;
  policyDigest: string;
  containerId: string;
  bundlePath: "/workspace/oci-bundle";
  rootPath: "/workspace/runsc-root";
  argv: string[];
  timeoutMs: number;
  cancellationGraceMs: number;
  maxOutputBytes: number;
  maxArtifactBytes: number;
  executionMode: "PLAN_ONLY";
  canonicalWriteMode: "OBSERVATION_ONLY";
  liveExecutionState: "NOT_EXERCISED";
}

export interface RunscArtifactObservation {
  kind: string;
  sha256: string;
  bytes: number;
}

export interface RunscObservation {
  schema: typeof RUNSC_OBSERVATION_SCHEMA;
  planDigest: string;
  outcome: RunscOutcome;
  exitCode: number | null;
  stdoutBytes: number;
  stderrBytes: number;
  artifacts: RunscArtifactObservation[];
  touchedPaths: string[];
  cleanupIntent: "REQUIRED";
  cleanupState: "NOT_EXERCISED";
  residue: string[];
  providerExecutionState: "NOT_EXERCISED";
  isolationState: "NOT_EXERCISED";
  networkIsolationState: "NOT_EXERCISED";
  canonicalWriteMode: "OBSERVATION_ONLY";
}

export class GVisorAdapterError extends Error {
  constructor(public readonly code: string, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const H64 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9-]{3,63}$/;
const SAFE_PATH = /^\/workspace\/[A-Za-z0-9._/-]+$/;

function refuse(code: string, detail = ""): never {
  throw new GVisorAdapterError(code, detail);
}

function h64(value: string, code: string): void {
  if (!H64.test(value)) refuse(code);
}

export function buildLaunchPlan(packet: GVisorAdmissionPacket): RunscLaunchPlan {
  try {
    validateAdmissionPacket(packet);
  } catch (error) {
    if (error instanceof GVisorContractError) throw new GVisorAdapterError(error.code, error.message);
    throw error;
  }
  if (packet.executable.state !== "BOUND" || !packet.executable.version || !packet.executable.sha256 || !packet.executable.sbomDigest) {
    refuse("RUNSC_EXECUTABLE_NOT_ADMITTED");
  }
  if (packet.executable.evidenceClass !== "DETERMINISTIC_FIXTURE") refuse("RUNSC_EXECUTABLE_NOT_ADMITTED");

  const containerId = `gv-${packet.workloadDigest.slice(0, 24)}`;
  if (!SAFE_ID.test(containerId)) refuse("CONTAINER_ID_INVALID");
  const argv = [
    "runsc",
    "--root=/workspace/runsc-root",
    "run",
    "--bundle=/workspace/oci-bundle",
    containerId,
  ];
  const plan: RunscLaunchPlan = {
    schema: RUNSC_PLAN_SCHEMA,
    providerId: "gvisor-runsc",
    executableVersion: packet.executable.version,
    executableSha256: packet.executable.sha256,
    sbomDigest: packet.executable.sbomDigest,
    imageDigest: packet.image.digest,
    workloadDigest: packet.workloadDigest,
    policyDigest: packet.policyDigest,
    containerId,
    bundlePath: "/workspace/oci-bundle",
    rootPath: "/workspace/runsc-root",
    argv,
    timeoutMs: packet.isolationPolicy.resources.timeoutMs,
    cancellationGraceMs: Math.min(5_000, Math.max(100, Math.floor(packet.isolationPolicy.resources.timeoutMs / 10))),
    maxOutputBytes: packet.isolationPolicy.resources.maxOutputBytes,
    maxArtifactBytes: packet.isolationPolicy.resources.maxArtifactBytes,
    executionMode: "PLAN_ONLY",
    canonicalWriteMode: "OBSERVATION_ONLY",
    liveExecutionState: "NOT_EXERCISED",
  };
  validateLaunchPlan(packet, plan);
  return plan;
}

export function validateLaunchPlan(packet: GVisorAdmissionPacket, plan: RunscLaunchPlan): void {
  if (plan.schema !== RUNSC_PLAN_SCHEMA || plan.providerId !== "gvisor-runsc") refuse("RUNSC_PLAN_SCHEMA_MISMATCH");
  if (plan.executableVersion !== packet.executable.version || plan.executableSha256 !== packet.executable.sha256 || plan.sbomDigest !== packet.executable.sbomDigest) {
    refuse("RUNSC_BINARY_SUBJECT_DRIFT");
  }
  if (plan.imageDigest !== packet.image.digest || plan.workloadDigest !== packet.workloadDigest || plan.policyDigest !== packet.policyDigest) {
    refuse("RUNSC_PLAN_SUBJECT_DRIFT");
  }
  if (!SAFE_ID.test(plan.containerId) || plan.bundlePath !== "/workspace/oci-bundle" || plan.rootPath !== "/workspace/runsc-root") {
    refuse("HOST_PATH_OR_CONTAINER_WIDENING");
  }
  const expected = ["runsc", "--root=/workspace/runsc-root", "run", "--bundle=/workspace/oci-bundle", plan.containerId];
  if (plan.argv.length !== expected.length || plan.argv.some((value, index) => value !== expected[index])) refuse("ARBITRARY_RUNSC_ARGV");
  if (plan.executionMode !== "PLAN_ONLY" || plan.canonicalWriteMode !== "OBSERVATION_ONLY" || plan.liveExecutionState !== "NOT_EXERCISED") {
    refuse("PLAN_AS_LIVE_EXECUTION");
  }
  h64(plan.executableSha256, "RUNSC_BINARY_SUBJECT_DRIFT");
  h64(plan.sbomDigest, "RUNSC_BINARY_SUBJECT_DRIFT");
  if (!/^sha256:[0-9a-f]{64}$/.test(plan.imageDigest)) refuse("RUNSC_PLAN_SUBJECT_DRIFT");
}

export function validateObservation(plan: RunscLaunchPlan, observation: RunscObservation): { stateProposal: string; receiptDigest: string } {
  if (observation.schema !== RUNSC_OBSERVATION_SCHEMA || observation.planDigest !== digest(plan)) refuse("RUNSC_OBSERVATION_SUBJECT_DRIFT");
  if (!["SUCCESS", "FAILURE", "TIMEOUT", "CANCELLED", "CONNECTION_LOST"].includes(observation.outcome)) refuse("RUNSC_OUTCOME_INVALID");
  if (observation.stdoutBytes < 0 || observation.stderrBytes < 0 || observation.stdoutBytes + observation.stderrBytes > plan.maxOutputBytes) {
    refuse("RUNSC_OUTPUT_LIMIT_EXCEEDED");
  }
  let artifactBytes = 0;
  for (const artifact of observation.artifacts) {
    h64(artifact.sha256, "RUNSC_ARTIFACT_DIGEST_INVALID");
    if (!Number.isInteger(artifact.bytes) || artifact.bytes < 0) refuse("RUNSC_ARTIFACT_LIMIT_EXCEEDED");
    artifactBytes += artifact.bytes;
  }
  if (artifactBytes > plan.maxArtifactBytes) refuse("RUNSC_ARTIFACT_LIMIT_EXCEEDED");
  for (const path of observation.touchedPaths) {
    if (!SAFE_PATH.test(path) || path.includes("..")) refuse("RUNSC_TOUCHED_PATH_ESCAPE");
  }
  if (observation.cleanupIntent !== "REQUIRED") refuse("RUNSC_CLEANUP_REQUIRED");
  if (observation.cleanupState !== "NOT_EXERCISED" || observation.residue.length !== 0) refuse("FIXTURE_CLEANUP_AS_LIVE");
  if (observation.providerExecutionState !== "NOT_EXERCISED" || observation.isolationState !== "NOT_EXERCISED" || observation.networkIsolationState !== "NOT_EXERCISED") {
    refuse("PLAN_OR_FIXTURE_AS_LIVE_ISOLATION");
  }
  if (observation.canonicalWriteMode !== "OBSERVATION_ONLY") refuse("PROVIDER_SELF_PROMOTION");

  const stateProposal = observation.outcome === "SUCCESS" ? "EXECUTION_OBSERVED_PENDING_LIVE_PROOF"
    : observation.outcome === "TIMEOUT" ? "TIMED_OUT"
    : observation.outcome === "CANCELLED" ? "CANCELLED"
    : observation.outcome === "CONNECTION_LOST" ? "RESULT_UNKNOWN"
    : "FAILED_EXECUTION";
  return { stateProposal, receiptDigest: digest(observation) };
}

export function deterministicObservation(plan: RunscLaunchPlan, outcome: RunscOutcome = "SUCCESS"): RunscObservation {
  return {
    schema: RUNSC_OBSERVATION_SCHEMA,
    planDigest: digest(plan),
    outcome,
    exitCode: outcome === "SUCCESS" ? 0 : outcome === "FAILURE" ? 1 : null,
    stdoutBytes: 128,
    stderrBytes: outcome === "SUCCESS" ? 0 : 64,
    artifacts: [{ kind: "result", sha256: "7".repeat(64), bytes: 256 }],
    touchedPaths: ["/workspace/output/result.json"],
    cleanupIntent: "REQUIRED",
    cleanupState: "NOT_EXERCISED",
    residue: [],
    providerExecutionState: "NOT_EXERCISED",
    isolationState: "NOT_EXERCISED",
    networkIsolationState: "NOT_EXERCISED",
    canonicalWriteMode: "OBSERVATION_ONLY",
  };
}
