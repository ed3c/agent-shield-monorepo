import {
  MAESTRO_RECEIPT_SCHEMA,
  type AppArtifact,
  type FlowBundle,
  type MaestroPolicy,
  type MaestroPort,
  type MaestroReceipt,
  type MaestroRequest,
  type MaestroState,
  type MaestroToolSubject,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

export function fail(message: string): never {
  throw new Error(`invalid maestro contract: ${message}`);
}

// QA-MAESTRO-002.
export function assertToolSubject(tool: MaestroToolSubject): MaestroToolSubject {
  if (!SAFE_ID.test(tool.id)) fail("tool.id is invalid");
  if (!SAFE_VERSION.test(tool.version)) fail("tool.version is invalid");
  if (tool.version.toLowerCase() === "latest") fail("tool.version must be exact, not a moving channel");
  if (!GIT_OID.test(tool.sourceCommit)) fail("tool.sourceCommit must be a full 40-hex object ID");
  if (tool.license !== "Apache-2.0") fail("tool.license is not the admitted licence");
  for (const [name, value] of [
    ["artifactSha256", tool.artifactSha256],
    ["licenseSha256", tool.licenseSha256],
    ["sbomSha256", tool.sbomSha256],
    ["noticesSha256", tool.noticesSha256],
  ] as const) {
    if (!SHA_256.test(value)) fail(`tool.${name} is invalid`);
  }
  return tool;
}

// QA-MAESTRO-001. The exposed surface is a set of flow IDs from the admitted bundle. There is
// no generic `run_flow(path)` to generate, because a path is not a thing this contract has.
export function generateMaestroTools(bundle: FlowBundle, policy: MaestroPolicy): string[] {
  const tools: string[] = [];
  for (const flowId of [...policy.exposedFlowIds].sort()) {
    if (!bundle.flowIds.includes(flowId)) fail(`policy exposes ${flowId}, which the bundle does not contain`);
    if (!SAFE_ID.test(flowId)) fail(`flow ${flowId} is not a portable identifier`);
    tools.push(`maestro_run_${flowId.replace(/-/g, "_")}`);
  }
  return tools;
}

export interface RunOptions {
  tool: MaestroToolSubject;
  bundle: FlowBundle;
  policy: MaestroPolicy;
  app: AppArtifact;
  targetId: string;
  workerId: string;
  port: MaestroPort;
}

export function runMaestroFlow(request: MaestroRequest, options: RunOptions): MaestroReceipt {
  const lifecycle: MaestroState[] = ["UNRESOLVED"];
  const settle = (outcome: MaestroState, detail: string, extra: Partial<MaestroReceipt> = {}): MaestroReceipt => ({
    schema: MAESTRO_RECEIPT_SCHEMA,
    flowId: request.flowId,
    bundleSha256: request.bundleSha256,
    targetId: options.targetId,
    appBuildSha256: options.app.buildSha256,
    lifecycle: [...lifecycle, outcome],
    outcome: outcome as MaestroReceipt["outcome"],
    passedAssertions: 0,
    failedAssertions: 0,
    artifacts: [],
    leaseReleased: false,
    detail,
    ...extra,
  });

  const probe = options.port.probe();
  if (!probe.available || probe.version !== options.tool.version) {
    return settle("ABSENT_TOOL", "the Maestro CLI is absent or not the admitted version");
  }
  lifecycle.push("TOOL_ADMITTED");

  // QA-MAESTRO-004. One Worker owns one target. A lease for another worker or another target
  // cannot be spent here even when the port hands one back.
  const lease = options.port.acquire(options.targetId, options.workerId);
  if (lease === null) return settle("ABSENT_TARGET", "no target was available to lease");
  if (lease.ownerWorkerId !== options.workerId || lease.targetId !== options.targetId) {
    return settle("LEASE_REFUSED", "the lease belongs to another worker or target");
  }
  if (lease.leaseId !== request.leaseId) return settle("LEASE_REFUSED", "the request names a different lease");
  if (lease.platform !== options.app.platform) return settle("LEASE_REFUSED", "the target platform does not match the app");
  lifecycle.push("TARGET_LEASED");

  const finish = (outcome: MaestroState, detail: string, extra: Partial<MaestroReceipt> = {}): MaestroReceipt => {
    // QA-MAESTRO-008. Release runs on every path after the lease exists, and a retained
    // process or an unreleased lease overrides the outcome.
    lifecycle.push("RELEASING");
    const released = options.port.release(lease) && options.port.retainedProcesses() === 0;
    return settle(released ? outcome : "FAILED_CLEANUP", released ? detail : "a process or lease was retained after the run", {
      ...extra,
      leaseReleased: released,
    });
  };

  // QA-MAESTRO-003. The flow is identified inside an admitted bundle, and the bundle digest
  // must be the one the request names.
  if (!SHA_256.test(request.bundleSha256) || request.bundleSha256 !== options.bundle.bundleSha256) {
    return finish("INVALID_FLOW", "the request bundle digest does not match the admitted bundle");
  }
  if (request.bundleId !== options.bundle.bundleId) return finish("INVALID_FLOW", "the request names a different bundle");
  if (!options.bundle.flowIds.includes(request.flowId)) return finish("INVALID_FLOW", "the flow is not in the admitted bundle");
  if (!options.policy.exposedFlowIds.includes(request.flowId)) return finish("INVALID_FLOW", "the flow is not externally exposed");
  if (request.appId !== options.app.appId) return finish("INVALID_FLOW", "the request names a different app");

  // QA-MAESTRO-005. A flow that asserts nothing cannot pass. A hollow flow is the control this
  // exists for: it would otherwise be indistinguishable from a working one.
  const asserted = options.bundle.assertedTargetIds[request.flowId] ?? [];
  if (options.policy.requireAssertions && asserted.length === 0) {
    return finish("INVALID_FLOW", "the flow declares no accessibility assertions");
  }
  lifecycle.push("FLOW_VERIFIED", "INSTALLING");

  if (!SHA_256.test(options.app.buildSha256)) return finish("INSTALL_FAILED", "the app build is not content-addressed");
  if (!options.port.install(lease, options.app)) return finish("INSTALL_FAILED", "the app could not be installed on the target");
  lifecycle.push("RUNNING");

  const result = options.port.run(lease, options.bundle, request.flowId);
  if (result === null) return finish("TEST_FAILED", "the flow did not produce a result");
  if (result.durationMs > options.policy.maxDurationMs) {
    return finish("TIMED_OUT", "the flow exceeded its admitted duration", { passedAssertions: result.passedAssertions, failedAssertions: result.failedAssertions });
  }
  lifecycle.push("COLLECTING");

  // QA-MAESTRO-007. Artifacts are content-addressed and bounded. A host temp path has no field
  // to arrive in, so the only failure available here is a missing digest or an oversized one.
  if (result.artifacts.length > options.policy.maxArtifacts) {
    return finish("ARTIFACT_FAILED", "the run produced more artifacts than admitted");
  }
  for (const artifact of result.artifacts) {
    if (!SHA_256.test(artifact.sha256)) return finish("ARTIFACT_FAILED", `a ${artifact.kind} artifact is not content-addressed`);
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0 || artifact.bytes > options.policy.maxArtifactBytes) {
      return finish("ARTIFACT_FAILED", `a ${artifact.kind} artifact exceeds its admitted size`);
    }
  }

  // QA-MAESTRO-005 and QA-MAESTRO-006. A failed assertion is a test failure, and a run with no
  // assertions at all is not a pass either -- an unavailable target is already a distinct
  // state above, so nothing here can be reported as a skip.
  if (result.failedAssertions > 0) {
    return finish("TEST_FAILED", "the flow failed an accessibility assertion", {
      passedAssertions: result.passedAssertions,
      failedAssertions: result.failedAssertions,
      artifacts: result.artifacts,
    });
  }
  if (result.passedAssertions === 0) {
    return finish("TEST_FAILED", "the flow completed without asserting anything", { artifacts: result.artifacts });
  }

  return finish("COMPLETED", result.detail, {
    passedAssertions: result.passedAssertions,
    failedAssertions: result.failedAssertions,
    artifacts: result.artifacts,
  });
}
