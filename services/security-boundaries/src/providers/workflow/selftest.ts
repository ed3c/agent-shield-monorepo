import {
  DurableWorkflowRuntime,
  FakeActivityPort,
  decide,
  project,
  replay,
  workflowProviderState,
  type EvidenceEpochs,
  type WorkflowEvent,
  type WorkflowSdkSubject,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SEC-WF ${message}`);
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
  ok(text.startsWith("invalid workflow contract: "), `${message} threw "${text}" rather than a workflow contract error`);
}

const START = 1_700_000_000_000;
const EPOCHS: EvidenceEpochs = { policyEpoch: 4, challengeEpoch: 2, deviceEpoch: 7 };

const SDK: WorkflowSdkSubject = {
  id: "temporal-sdk-typescript",
  version: "1.11.0",
  artifactSha256: "a".repeat(64),
  sourceCommit: "1".repeat(40),
  license: "MIT",
  licenseSha256: "b".repeat(64),
  sbomSha256: "c".repeat(64),
  namespace: "agent-shield/settlement",
};

function started(overrides: Partial<Extract<WorkflowEvent, { kind: "started" }>> = {}): WorkflowEvent {
  return {
    kind: "started",
    atEpochMs: START,
    workflowId: "wf-1",
    intentId: "intent-1",
    deadlineEpochMs: START + 600_000,
    epochs: { ...EPOCHS },
    ...overrides,
  };
}

function runtime(port: FakeActivityPort, sdk: WorkflowSdkSubject = SDK): DurableWorkflowRuntime {
  return new DurableWorkflowRuntime(sdk, port);
}

// SEC-WF-001 determinism and replay
function determinism(): void {
  const port = new FakeActivityPort();
  const driven = runtime(port).drive([started()]);
  ok(driven.receipt.outcome === "COMPLETED", `the low-risk route did not complete: ${driven.receipt.state}`);

  // The same history replayed twice yields the same commands, and a second replay after a
  // simulated restart -- a fresh runtime over the stored history -- yields them too.
  const first = JSON.stringify(replay(driven.history));
  const second = JSON.stringify(replay(driven.history));
  const afterRestart = JSON.stringify(replay([...driven.history]));
  ok(first === second, "two replays of one history diverged");
  ok(first === afterRestart, "a replay after restart diverged from the original");

  // The decision function's only input is the history: there is no clock, random source or
  // network handle in scope, so time can only come from a recorded field.
  ok(decide.length === 1, "the decision function grew an input beyond the history");
  const shifted = driven.history.map((event) => ({ ...event, atEpochMs: event.atEpochMs + 1_000 }));
  ok(
    JSON.stringify(replay(shifted as WorkflowEvent[])) === first,
    "shifting every recorded timestamp changed the decisions, so something reads absolute time",
  );

  red(() => project([]), "an empty history");
  red(() => project([{ kind: "timer-fired", atEpochMs: START }] as WorkflowEvent[]), "a history that does not begin with a start");
  red(
    () => project([started(), { kind: "timer-fired", atEpochMs: START - 1 }] as WorkflowEvent[]),
    "a history that moves backwards in time",
  );
}

// SEC-WF-002 idempotency
function idempotency(): void {
  const port = new FakeActivityPort();
  const driven = runtime(port).drive([started()]);
  ok(new Set(driven.dispatched).size === driven.dispatched.length, "an activity was dispatched twice in one run");

  // A repeated completion event for an activity already recorded changes nothing.
  const doubled: WorkflowEvent[] = [
    ...driven.history,
    { kind: "activity-completed", atEpochMs: START + 100, activity: "append-ledger", sequence: 99 },
  ];
  const before = project(driven.history);
  const after = project(doubled);
  ok(
    before.completed.join(",") === after.completed.join(","),
    "a repeated activity completion changed the projection",
  );
  ok(
    JSON.stringify(decide(driven.history)) === JSON.stringify(decide(doubled)),
    "a repeated delivery changed the next decision",
  );

  for (const activity of ["issue-challenge", "sign", "append-ledger", "submit"] as const) {
    const repeated: WorkflowEvent[] = [
      ...driven.history,
      { kind: "activity-completed", atEpochMs: START + 200, activity, sequence: 99 },
    ];
    ok(
      project(repeated).completed.filter((entry) => entry === activity).length <= 1,
      `a retried ${activity} was recorded twice`,
    );
  }
}

// SEC-WF-003 waiting states
function waitingStates(): void {
  const port = new FakeActivityPort();
  port.tier = "high";
  const driven = runtime(port).drive([started()]);
  ok(driven.receipt.state === "WAITING_FOR_HARDWARE", `a high-risk workflow did not wait: ${driven.receipt.state}`);
  ok(driven.receipt.outcome === null, "a waiting workflow reported an outcome");

  // Restart: a fresh runtime over the stored history resumes the wait rather than completing.
  const resumed = runtime(new FakeActivityPort()).drive(driven.history);
  ok(resumed.receipt.state === "WAITING_FOR_HARDWARE", "a restart during a wait produced a different state");
  ok(resumed.dispatched.length === 0, "a restart during a wait dispatched an activity");

  // The two waits are independent and released by two different recorded events. Neither can
  // stand in for the other, so each is controlled on its own.
  const attestedPort = new FakeActivityPort();
  attestedPort.tier = "high";
  const attested = runtime(attestedPort).drive([
    ...driven.history,
    { kind: "hardware-attested", atEpochMs: START + 1_000, deviceEpoch: 7 },
  ]);
  ok(attested.receipt.state === "WAITING_FOR_HUMAN", `an attested workflow with no approval reported ${attested.receipt.state}`);
  ok(attested.receipt.completedActivities.includes("await-hardware"), "an attested workflow skipped the hardware activity");
  ok(!attested.receipt.completedActivities.includes("sign"), "an unapproved workflow signed");

  const approvedOnlyPort = new FakeActivityPort();
  approvedOnlyPort.tier = "high";
  const approvedOnly = runtime(approvedOnlyPort).drive([
    ...driven.history,
    { kind: "human-approved", atEpochMs: START + 1_000, approverId: "owner" },
  ]);
  ok(approvedOnly.receipt.state === "WAITING_FOR_HARDWARE", `an approved workflow with no attestation reported ${approvedOnly.receipt.state}`);

  const bothPort = new FakeActivityPort();
  bothPort.tier = "high";
  const both = runtime(bothPort).drive([
    ...driven.history,
    { kind: "hardware-attested", atEpochMs: START + 1_000, deviceEpoch: 7 },
    { kind: "human-approved", atEpochMs: START + 2_000, approverId: "owner" },
  ]);
  ok(both.receipt.outcome === "COMPLETED", `an attested and approved workflow did not complete: ${both.receipt.state}`);
  ok(both.receipt.completedActivities.includes("await-hardware"), "a high-risk workflow signed without hardware evidence");
}

// SEC-WF-004 timeout and cancellation
function timeoutAndCancel(): void {
  const port = new FakeActivityPort();
  port.tier = "high";
  const waiting = runtime(port).drive([started()]);

  const cancelled = runtime(new FakeActivityPort()).drive([
    ...waiting.history,
    { kind: "cancellation-requested", atEpochMs: START + 5_000, requestedBy: "owner" },
  ]);
  ok(cancelled.receipt.outcome === "CANCELLED", `a cancelled workflow reported ${cancelled.receipt.state}`);
  ok(cancelled.receipt.compensated, "a cancelled workflow settled without compensating");
  ok(
    cancelled.dispatched.every((key) => key.endsWith(":compensate")),
    "a cancelled workflow dispatched an activity other than compensation",
  );

  const timedOut = runtime(new FakeActivityPort()).drive([
    ...waiting.history,
    { kind: "timer-fired", atEpochMs: START + 600_001 },
  ]);
  ok(timedOut.receipt.outcome === "TIMED_OUT", `an expired workflow reported ${timedOut.receipt.state}`);
  ok(timedOut.receipt.compensated, "an expired workflow settled without compensating");

  // A timer before the deadline is not a timeout.
  const early = runtime(new FakeActivityPort()).drive([
    ...waiting.history,
    { kind: "timer-fired", atEpochMs: START + 1_000 },
  ]);
  ok(early.receipt.state === "WAITING_FOR_HARDWARE", "a timer before the deadline ended the workflow");
}

// SEC-WF-005 provider isolation
function providerIsolation(): void {
  const port = new FakeActivityPort();
  // The port's whole surface: an activity kind, an idempotency key, epochs and worker
  // lifecycle. There is no member that could carry a secret or name a provider path.
  const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(port)).filter((name) => name !== "constructor").sort();
  ok(surface.join(",") === "activeWorkers,currentEpochs,run,shutdown", `the activity port grew a member: ${surface.join(",")}`);

  const driven = runtime(port).drive([started()]);
  const serialized = JSON.stringify(driven.history);
  for (const forbidden of ["secret", "token", "privateKey", "password", "credential"]) {
    ok(!serialized.includes(forbidden), `the workflow history carried a ${forbidden} field`);
  }
  ok(
    driven.dispatched.every((key) => /^wf-1:[a-z-]+$/.test(key)),
    "an idempotency key carried something other than the workflow and activity",
  );
}

// SEC-WF-006 stale evidence
function staleEvidence(): void {
  // A revocation lands while the workflow is waiting, so the epochs it meets at signing time
  // differ from the ones it started with.
  const port = new FakeActivityPort();
  port.tier = "high";
  port.revokeBefore = "await-hardware";
  const driven = runtime(port).drive([
    started(),
    { kind: "hardware-attested", atEpochMs: START + 1, deviceEpoch: 7 },
    { kind: "human-approved", atEpochMs: START + 2, approverId: "owner" },
  ]);
  ok(driven.receipt.outcome === "FAILED", `a drifted epoch reported ${driven.receipt.state}`);
  ok(driven.receipt.detail.includes("epoch drifted"), "the drift was not named in the receipt");
  ok(!driven.receipt.completedActivities.includes("sign"), "the workflow signed against a drifted epoch");

  // The same route without a revocation reaches signing.
  const stable = new FakeActivityPort();
  stable.tier = "high";
  const good = runtime(stable).drive([
    started(),
    { kind: "hardware-attested", atEpochMs: START + 1, deviceEpoch: 7 },
    { kind: "human-approved", atEpochMs: START + 2, approverId: "owner" },
  ]);
  ok(good.receipt.completedActivities.includes("sign"), "a stable epoch route did not reach signing");
}

// SEC-WF-007 failure separation
function failureSeparation(): void {
  const cases = [
    {
      label: "policy denial",
      history: [started(), { kind: "policy-denied", atEpochMs: START + 1, reason: "target-denied" }] as WorkflowEvent[],
      port: () => new FakeActivityPort(),
      expected: "DENIED",
    },
    {
      label: "cancellation",
      history: [started(), { kind: "cancellation-requested", atEpochMs: START + 1, requestedBy: "owner" }] as WorkflowEvent[],
      port: () => new FakeActivityPort(),
      expected: "CANCELLED",
    },
    {
      label: "deadline",
      history: [started(), { kind: "timer-fired", atEpochMs: START + 600_001 }] as WorkflowEvent[],
      port: () => new FakeActivityPort(),
      expected: "TIMED_OUT",
    },
    {
      label: "activity failure",
      history: [started()] as WorkflowEvent[],
      port: () => { const p = new FakeActivityPort(); p.failOn = "append-ledger"; return p; },
      expected: "ACTIVITY_FAILED",
    },
  ] as const;

  for (const item of cases) {
    const result = runtime(item.port()).drive(item.history);
    ok(result.receipt.outcome === item.expected, `${item.label} produced ${result.receipt.state}, expected ${item.expected}`);
  }
  ok(new Set(cases.map((item) => item.expected)).size === 4, "the failure fixtures stopped covering four distinct outcomes");

  // There is no catch-all completed state: a failure never reports COMPLETED.
  for (const item of cases) {
    ok(runtime(item.port()).drive(item.history).receipt.outcome !== "COMPLETED", `${item.label} reported COMPLETED`);
  }

  // A compensation that itself fails is its own outcome. The exact outcome is pinned, not just
  // "not cancelled": a loose assertion here would stay green even if the runtime spun until it
  // ran out of steps, which is a different defect with a different fix.
  const compensationFails = new FakeActivityPort();
  compensationFails.failOn = "compensate";
  const result = runtime(compensationFails).drive([
    started(),
    { kind: "cancellation-requested", atEpochMs: START + 1, requestedBy: "owner" },
  ]);
  ok(result.receipt.outcome === "FAILED", `a failed compensation reported ${result.receipt.outcome}`);
  ok(
    result.receipt.detail.includes("duplicate activity dispatch"),
    `a failed compensation settled as "${result.receipt.detail}" rather than a refused re-dispatch`,
  );
  ok(!result.receipt.compensated, "a failed compensation was recorded as compensated");
}

// SEC-WF-008 exact admission and cleanup
function admissionAndCleanup(): void {
  const port = new FakeActivityPort();
  ok(runtime(port).sdkSubject.version === "1.11.0", "an admitted SDK was refused");
  for (const [label, patch] of [
    ["mutable source ref", { sourceCommit: "main" }],
    ["short source ref", { sourceCommit: "1".repeat(7) }],
    ["unknown licence", { license: "Proprietary" as never }],
    ["wrong artifact digest", { artifactSha256: "nope" }],
    ["absent SBOM", { sbomSha256: "" }],
    ["invalid namespace", { namespace: "Production Namespace" }],
  ] as const) {
    red(() => runtime(port, { ...SDK, ...patch }), `an SDK with a ${label}`);
  }

  const clean = new FakeActivityPort();
  runtime(clean).drive([started()]);
  ok(runtime(clean).cleanup() === "COMPLETED", "a clean namespace reported orphan workers");

  const orphan = new FakeActivityPort();
  orphan.shutsDown = false;
  ok(runtime(orphan).cleanup() === "COMPENSATION_FAILED", "a Worker that would not shut down reported clean");

  const stubborn = new FakeActivityPort();
  stubborn.shutdown = () => true;
  stubborn.workers = 2;
  ok(runtime(stubborn).cleanup() === "COMPENSATION_FAILED", "a namespace with live Workers reported clean");

  ok(workflowProviderState.liveWorker === "NOT_EXERCISED", "a fixture Worker was promoted to live evidence");
  ok(workflowProviderState.productionNamespace === "NOT_IMPLEMENTED", "a production namespace was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const workflowNeverPasses: NeverPass<typeof workflowProviderState> = true;
void workflowNeverPasses;

determinism();
idempotency();
waitingStates();
timeoutAndCancel();
providerIsolation();
staleEvidence();
failureSeparation();
admissionAndCleanup();

console.log("SELFTEST GREEN: SEC-WF determinism, idempotency, waiting states, timeout and cancel, provider isolation, stale evidence, failure separation, admission and cleanup");
