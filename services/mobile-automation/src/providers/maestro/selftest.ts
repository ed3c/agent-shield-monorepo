import {
  FakeMaestroPort,
  assertToolSubject,
  generateMaestroTools,
  maestroProviderState,
  runMaestroFlow,
  type AppArtifact,
  type FlowBundle,
  type MaestroPolicy,
  type MaestroRequest,
  type MaestroToolSubject,
  type RunOptions,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`QA-MAESTRO ${message}`);
}

function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid maestro contract: "), `${message} threw "${text}" rather than a maestro contract error`);
}

const TOOL: MaestroToolSubject = {
  id: "maestro",
  version: "1.39.0",
  artifactSha256: "a".repeat(64),
  sourceCommit: "1".repeat(40),
  license: "Apache-2.0",
  licenseSha256: "b".repeat(64),
  sbomSha256: "c".repeat(64),
  noticesSha256: "f".repeat(64),
};

function bundle(overrides: Partial<FlowBundle> = {}): FlowBundle {
  return {
    bundleId: "settlement-flows",
    bundleSha256: "9".repeat(64),
    flowIds: ["approve-run", "reject-run", "hollow-flow"],
    assertedTargetIds: {
      "approve-run": ["dashboard.approve-run"],
      "reject-run": ["dashboard.reject-run"],
      "hollow-flow": [],
    },
    ...overrides,
  };
}

function policy(overrides: Partial<MaestroPolicy> = {}): MaestroPolicy {
  return {
    exposedFlowIds: ["approve-run", "hollow-flow"],
    maxDurationMs: 60_000,
    maxArtifactBytes: 1_048_576,
    maxArtifacts: 8,
    requireAssertions: true,
    ...overrides,
  };
}

const APP: AppArtifact = { appId: "bettor-arena", buildSha256: "7".repeat(64), platform: "ios-simulator" };

function request(overrides: Partial<MaestroRequest> = {}): MaestroRequest {
  return {
    flowId: "approve-run",
    bundleId: "settlement-flows",
    bundleSha256: "9".repeat(64),
    appId: "bettor-arena",
    leaseId: "lease-sim-1",
    ...overrides,
  };
}

function run(overrides: Partial<MaestroRequest> = {}, tune: Partial<RunOptions> = {}) {
  const port = (tune.port as FakeMaestroPort) ?? new FakeMaestroPort();
  return {
    port,
    receipt: runMaestroFlow(request(overrides), {
      tool: tune.tool ?? TOOL,
      bundle: tune.bundle ?? bundle(),
      policy: tune.policy ?? policy(),
      app: tune.app ?? APP,
      targetId: tune.targetId ?? "sim-1",
      workerId: tune.workerId ?? "worker-1",
      port,
    }),
  };
}

// QA-MAESTRO-001 default deny
function defaultDeny(): void {
  const tools = generateMaestroTools(bundle(), policy());
  ok(tools.join(",") === "maestro_run_approve_run,maestro_run_hollow_flow", `the surface is ${tools.join(",")}`);
  ok(!tools.some((tool) => tool.includes("reject")), "an unexposed flow was projected");
  ok(generateMaestroTools(bundle(), policy({ exposedFlowIds: [] })).length === 0, "an empty policy produced tools");

  red(() => generateMaestroTools(bundle(), policy({ exposedFlowIds: ["ghost"] })), "a policy exposing a flow the bundle lacks");
  red(() => generateMaestroTools(bundle({ flowIds: ["Approve Run"] }), policy({ exposedFlowIds: ["Approve Run"] })), "a non-portable flow identifier");

  // A flow present in the bundle but absent from policy is not runnable.
  ok(run({ flowId: "reject-run" }).receipt.outcome === "INVALID_FLOW", "an unexposed flow was runnable");
}

// QA-MAESTRO-002 exact admission
function exactAdmission(): void {
  ok(run().receipt.outcome === "COMPLETED", `the happy path reported ${run().receipt.outcome}`);
  for (const [label, patch] of [
    ["a moving channel", { version: "latest" }],
    ["a mutable source ref", { sourceCommit: "main" }],
    ["a wrong artifact digest", { artifactSha256: "nope" }],
    ["an unknown licence", { license: "Proprietary" as never }],
    ["an absent SBOM", { sbomSha256: "" }],
    ["absent notices", { noticesSha256: "nope" }],
  ] as const) {
    red(() => assertToolSubject({ ...TOOL, ...patch }), `${label} in the tool subject`);
  }

  const absent = new FakeMaestroPort();
  absent.available = false;
  ok(run({}, { port: absent }).receipt.outcome === "ABSENT_TOOL", "an absent CLI reported success");

  const drifted = new FakeMaestroPort();
  drifted.version = "1.0.0";
  ok(run({}, { port: drifted }).receipt.outcome === "ABSENT_TOOL", "a version-drifted CLI was admitted");
}

// QA-MAESTRO-003 closed carrier
function closedCarrier(): void {
  // There is no path field to attack, so the reachable failures are digest and identity drift.
  for (const [label, overrides] of [
    ["a drifted bundle digest", { bundleSha256: "8".repeat(64) }],
    ["a malformed bundle digest", { bundleSha256: "not-a-digest" }],
    ["another bundle id", { bundleId: "other-flows" }],
    ["a flow outside the bundle", { flowId: "absent-flow" }],
    ["another app", { appId: "other-app" }],
  ] as const) {
    ok(run(overrides).receipt.outcome === "INVALID_FLOW", `${label} was accepted`);
  }

  // "Not in the bundle" and "not exposed by policy" are two rules. A flow missing from both is
  // caught by whichever runs first, so the in-bundle rule needs a flow policy *does* expose.
  ok(
    run({ flowId: "ghost" }, { policy: policy({ exposedFlowIds: ["ghost"] }) }).receipt.detail.includes("not in the admitted bundle"),
    "a policy-exposed flow missing from the bundle was not caught by the bundle rule",
  );

  // The request type has no field a traversal, host path or remote URL could occupy.
  const fields = Object.keys(request()).sort().join(",");
  ok(fields === "appId,bundleId,bundleSha256,flowId,leaseId", `the request grew a field: ${fields}`);
}

// QA-MAESTRO-004 target lease
function targetLease(): void {
  const foreign = new FakeMaestroPort();
  foreign.leaseOverride = { ownerWorkerId: "worker-2" };
  ok(run({}, { port: foreign }).receipt.outcome === "LEASE_REFUSED", "a lease owned by another worker was spent");

  const otherTarget = new FakeMaestroPort();
  otherTarget.leaseOverride = { targetId: "sim-2" };
  ok(run({}, { port: otherTarget }).receipt.outcome === "LEASE_REFUSED", "a lease for another target was spent");

  const otherLease = new FakeMaestroPort();
  otherLease.leaseOverride = { leaseId: "lease-other" };
  ok(run({}, { port: otherLease }).receipt.outcome === "LEASE_REFUSED", "a lease the request did not name was spent");

  const wrongPlatform = new FakeMaestroPort();
  wrongPlatform.leaseOverride = { platform: "android-emulator" };
  ok(run({}, { port: wrongPlatform }).receipt.outcome === "LEASE_REFUSED", "an iOS build ran on an Android target");

  const noTarget = new FakeMaestroPort();
  noTarget.available = false;
  ok(run({}, { port: noTarget }).receipt.outcome === "ABSENT_TOOL", "an unavailable port was not reported");
}

// QA-MAESTRO-005 accessibility defect
function accessibilityDefect(): void {
  // A hollow flow -- one that asserts nothing -- must not pass.
  ok(run({ flowId: "hollow-flow" }).receipt.outcome === "INVALID_FLOW", "a hollow flow was admitted");

  // Nor may a run that produced no assertions at all, even for a flow that declares some.
  const silent = new FakeMaestroPort();
  silent.result = { ...silent.result, passedAssertions: 0, failedAssertions: 0 };
  ok(run({}, { port: silent }).receipt.outcome === "TEST_FAILED", "a run asserting nothing was reported as a pass");

  // A planted accessibility defect fails the flow rather than being folded away.
  const failing = new FakeMaestroPort();
  failing.result = { ...failing.result, passedAssertions: 2, failedAssertions: 1 };
  const receipt = run({}, { port: failing }).receipt;
  ok(receipt.outcome === "TEST_FAILED", `a failed assertion reported ${receipt.outcome}`);
  ok(receipt.failedAssertions === 1, "the failed assertion count was lost");
  ok(receipt.artifacts.length === 2, "a failing run dropped its artifacts");
}

// QA-MAESTRO-006 state separation
function stateSeparation(): void {
  const cases = [
    { label: "absent tool", tune: (port: FakeMaestroPort) => { port.available = false; }, expected: "ABSENT_TOOL" },
    { label: "install failure", tune: (port: FakeMaestroPort) => { port.installs = false; }, expected: "INSTALL_FAILED" },
    { label: "assertion failure", tune: (port: FakeMaestroPort) => { port.result = { ...port.result, failedAssertions: 1 }; }, expected: "TEST_FAILED" },
    { label: "timeout", tune: (port: FakeMaestroPort) => { port.result = { ...port.result, durationMs: 60_001 }; }, expected: "TIMED_OUT" },
    { label: "artifact failure", tune: (port: FakeMaestroPort) => { port.result = { ...port.result, artifacts: [{ kind: "video", sha256: "short", bytes: 10 }] }; }, expected: "ARTIFACT_FAILED" },
    { label: "cleanup failure", tune: (port: FakeMaestroPort) => { port.releases = false; }, expected: "FAILED_CLEANUP" },
    { label: "no result", tune: (port: FakeMaestroPort) => { port.runs = false; }, expected: "TEST_FAILED" },
  ] as const;

  for (const item of cases) {
    const port = new FakeMaestroPort();
    item.tune(port);
    const receipt = run({}, { port }).receipt;
    // Pinning each fixture to its own outcome also settles "never a skip or a pass": none of
    // the six expected values is COMPLETED, and after this assertion the compiler knows it.
    // A separate `!== "COMPLETED"` check would be a comparison tsc proves can never fail.
    ok(receipt.outcome === item.expected, `${item.label} reported ${receipt.outcome}, expected ${item.expected}`);
  }
  ok(new Set(cases.map((item) => item.expected)).size === 6, "the failure fixtures stopped covering six distinct outcomes");
}

// QA-MAESTRO-007 artifacts
function artifacts(): void {
  const receipt = run().receipt;
  ok(receipt.artifacts.length === 2, "the receipt lost its artifacts");
  for (const artifact of receipt.artifacts) {
    ok(/^[a-f0-9]{64}$/.test(artifact.sha256), `a ${artifact.kind} artifact is not content-addressed`);
    ok(Object.keys(artifact).sort().join(",") === "bytes,kind,sha256", "an artifact grew a field that could hold a host path");
  }

  const oversized = new FakeMaestroPort();
  oversized.result = { ...oversized.result, artifacts: [{ kind: "video", sha256: "d".repeat(64), bytes: 1_048_577 }] };
  ok(run({}, { port: oversized }).receipt.outcome === "ARTIFACT_FAILED", "an oversized artifact was accepted");

  const tooMany = new FakeMaestroPort();
  tooMany.result = {
    ...tooMany.result,
    artifacts: Array.from({ length: 9 }, () => ({ kind: "screenshot" as const, sha256: "d".repeat(64), bytes: 1_024 })),
  };
  ok(run({}, { port: tooMany }).receipt.outcome === "ARTIFACT_FAILED", "too many artifacts were accepted");
}

// QA-MAESTRO-008 cleanup
function cleanup(): void {
  const { port, receipt } = run();
  ok(receipt.leaseReleased && port.released.length === 1, "a successful run did not release its lease");

  for (const [label, tune] of [
    ["a failed assertion", (p: FakeMaestroPort) => { p.result = { ...p.result, failedAssertions: 1 }; }],
    ["a timeout", (p: FakeMaestroPort) => { p.result = { ...p.result, durationMs: 60_001 }; }],
    ["an install failure", (p: FakeMaestroPort) => { p.installs = false; }],
    ["an invalid flow", (p: FakeMaestroPort) => { void p; }],
  ] as const) {
    const port = new FakeMaestroPort();
    tune(port);
    if (label === "an invalid flow") run({ flowId: "absent-flow" }, { port });
    else run({}, { port });
    ok(port.released.length === 1, `${label} skipped the lease release`);
  }

  const retaining = new FakeMaestroPort();
  retaining.retained = 1;
  const retained = run({}, { port: retaining }).receipt;
  ok(retained.outcome === "FAILED_CLEANUP" && !retained.leaseReleased, "a retained process reported a clean run");
}

function evidenceBoundary(): void {
  ok(maestroProviderState.simulatorRun === "NOT_EXERCISED", "a simulator run was claimed");
  ok(maestroProviderState.deviceRun === "NOT_IMPLEMENTED", "a device run was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const maestroNeverPasses: NeverPass<typeof maestroProviderState> = true;
void maestroNeverPasses;

defaultDeny();
exactAdmission();
closedCarrier();
targetLease();
accessibilityDefect();
stateSeparation();
artifacts();
cleanup();
evidenceBoundary();

console.log("SELFTEST GREEN: QA-MAESTRO default deny, exact admission, closed carrier, target lease, accessibility defect, state separation, artifacts, cleanup");
