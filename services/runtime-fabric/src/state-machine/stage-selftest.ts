import { validateRuntimeRequest, type RuntimeRequest } from "../../../../packages/contracts/src/runtime/index.ts";
import { assertRuntimeReceiptMatchesRequest, runRuntimeProvider } from "../spi/index.ts";
import { FixtureProvider } from "./provider-fixture.ts";
import { requestValue } from "./request-fixture.ts";
import { ok, waitForAbort } from "./test-support.ts";

function boundedRequest(timeoutMs = 30, cancellationGraceMs = 10): RuntimeRequest {
  const value = requestValue();
  value.limits = { ...(value.limits as Record<string, unknown>), timeoutMs, cancellationGraceMs };
  value.cleanup = { ...(value.cleanup as Record<string, unknown>), maxDurationMs: 30 };
  return validateRuntimeRequest(value);
}

export async function runtimeStageSelftest(): Promise<void> {
  const preCancelledProvider = new FixtureProvider();
  const preCancelled = new AbortController();
  preCancelled.abort();
  const preCancelledRequest = boundedRequest();
  const preCancelledReceipt = await runRuntimeProvider(preCancelledProvider, preCancelledRequest, { signal: preCancelled.signal });
  ok(
    preCancelledReceipt.taskStage === "admission" && preCancelledReceipt.taskOutcome === "CANCELLED" &&
    preCancelledProvider.admitCalled === 0 && preCancelledReceipt.cleanup.state === "NOT_EXERCISED",
    "pre-cancelled task invoked provider or cleanup",
  );
  assertRuntimeReceiptMatchesRequest(preCancelledReceipt, preCancelledRequest);

  const admissionTimeoutProvider = new FixtureProvider();
  admissionTimeoutProvider.admit = async (_request, context) => {
    admissionTimeoutProvider.admitCalled += 1;
    await waitForAbort(context.signal);
    return { state: "FAIL", detail: "cooperative admission abort" };
  };
  const admissionRequest = boundedRequest();
  const admissionTimeout = await runRuntimeProvider(admissionTimeoutProvider, admissionRequest);
  ok(
    admissionTimeout.taskStage === "admission" && admissionTimeout.taskOutcome === "TIMED_OUT" &&
    admissionTimeout.exit.timedOut === false && admissionTimeout.cleanup.state === "NOT_EXERCISED",
    "admission timeout semantics drifted",
  );
  assertRuntimeReceiptMatchesRequest(admissionTimeout, admissionRequest);

  const materializationTimeoutProvider = new FixtureProvider();
  materializationTimeoutProvider.materialize = async (_request, context) => {
    materializationTimeoutProvider.materializeCalled += 1;
    await waitForAbort(context.signal);
    return { workspaceIdentity: `late-workspace:sha256:${"3".repeat(64)}`, handle: {} };
  };
  const materializationRequest = boundedRequest();
  const materializationTimeout = await runRuntimeProvider(materializationTimeoutProvider, materializationRequest);
  ok(
    materializationTimeout.taskStage === "materialization" && materializationTimeout.taskOutcome === "TIMED_OUT" &&
    materializationTimeout.outcome === "TIMED_OUT" && materializationTimeout.workspaceIdentity === null &&
    materializationTimeoutProvider.recoveryCleanupCalled === 1 && materializationTimeout.cleanup.state === "PASS",
    "materialization timeout or recovery cleanup semantics drifted",
  );
  assertRuntimeReceiptMatchesRequest(materializationTimeout, materializationRequest);

  const uncooperativeMaterializationProvider = new FixtureProvider();
  uncooperativeMaterializationProvider.materialize = async () => new Promise(() => {});
  const uncooperativeMaterialization = await runRuntimeProvider(uncooperativeMaterializationProvider, boundedRequest());
  ok(
    uncooperativeMaterialization.taskOutcome === "TIMED_OUT" && uncooperativeMaterialization.outcome === "FAILED_CLEANUP" &&
    uncooperativeMaterialization.cleanup.residue.includes("materialization-operation-unsettled"),
    "uncooperative materialization stayed green",
  );

  const executionTimeoutProvider = new FixtureProvider();
  executionTimeoutProvider.execute = async (_materialization, _request, context) => {
    executionTimeoutProvider.executeCalled += 1;
    await waitForAbort(context.signal);
    return { state: "TIMED_OUT", exit: { code: null, signal: null, timedOut: true, cancelled: false }, stdoutBytes: 0, stderrBytes: 0, detail: "cooperative execution timeout" };
  };
  const executionRequest = boundedRequest();
  const executionTimeout = await runRuntimeProvider(executionTimeoutProvider, executionRequest);
  ok(
    executionTimeout.taskStage === "execution" && executionTimeout.taskOutcome === "TIMED_OUT" &&
    executionTimeout.exit.timedOut && executionTimeoutProvider.cleanupCalled === 1 && executionTimeout.cleanup.state === "PASS",
    "execution timeout semantics drifted",
  );
  assertRuntimeReceiptMatchesRequest(executionTimeout, executionRequest);

  const collectionTimeoutProvider = new FixtureProvider();
  collectionTimeoutProvider.collect = async (_m, _r, _e, context) => {
    collectionTimeoutProvider.collectCalled += 1;
    await waitForAbort(context.signal);
    return { state: "FAIL", artifacts: [], touchedPaths: [], detail: "cooperative collection timeout" };
  };
  const collectionRequest = boundedRequest();
  const collectionTimeout = await runRuntimeProvider(collectionTimeoutProvider, collectionRequest);
  ok(
    collectionTimeout.taskStage === "collection" && collectionTimeout.taskOutcome === "TIMED_OUT" &&
    collectionTimeout.exit.code === 0 && !collectionTimeout.exit.timedOut && collectionTimeout.cleanup.state === "PASS",
    "collection timeout falsified execution evidence",
  );
  assertRuntimeReceiptMatchesRequest(collectionTimeout, collectionRequest);

  const cleanupTimeoutProvider = new FixtureProvider();
  cleanupTimeoutProvider.cleanup = async (_m, _r, _o, context) => {
    cleanupTimeoutProvider.cleanupCalled += 1;
    await waitForAbort(context.signal);
    return { state: "FAIL", durationMs: 1, processesChecked: false, workspaceChecked: false, sessionsChecked: false, workspaceDisposition: "UNKNOWN", preservationRef: null, residue: ["cleanup-timeout"], detail: "cooperative cleanup timeout" };
  };
  const cleanupRequest = boundedRequest(200);
  const cleanupTimeout = await runRuntimeProvider(cleanupTimeoutProvider, cleanupRequest);
  ok(
    cleanupTimeout.taskOutcome === "COMPLETED" && cleanupTimeout.outcome === "FAILED_CLEANUP" &&
    cleanupTimeout.terminalStage === "cleanup" && cleanupTimeout.cleanup.state === "FAIL",
    "cleanup timeout erased task outcome",
  );
  assertRuntimeReceiptMatchesRequest(cleanupTimeout, cleanupRequest);

  const uncooperativeProvider = new FixtureProvider();
  uncooperativeProvider.execute = async () => new Promise(() => {});
  const uncooperative = await runRuntimeProvider(uncooperativeProvider, boundedRequest());
  ok(
    uncooperative.taskStage === "execution" && uncooperative.taskOutcome === "TIMED_OUT" &&
    uncooperative.outcome === "FAILED_CLEANUP" && uncooperative.cleanup.residue.includes("execution-operation-unsettled") &&
    uncooperative.cleanup.workspaceDisposition === "UNKNOWN",
    "uncooperative execution stayed green",
  );

  const cancellationProvider = new FixtureProvider();
  cancellationProvider.execute = async (_m, _r, context) => {
    cancellationProvider.executeCalled += 1;
    await waitForAbort(context.signal);
    return { state: "CANCELLED", exit: { code: null, signal: null, timedOut: false, cancelled: true }, stdoutBytes: 0, stderrBytes: 0, detail: "cooperative execution cancellation" };
  };
  const cancellation = new AbortController();
  setTimeout(() => cancellation.abort(), 5);
  const cancellationRequest = boundedRequest(200);
  const cancelled = await runRuntimeProvider(cancellationProvider, cancellationRequest, { signal: cancellation.signal });
  ok(
    cancelled.taskStage === "execution" && cancelled.taskOutcome === "CANCELLED" && cancelled.exit.cancelled && cancelled.cleanup.state === "PASS",
    "external cancellation semantics drifted",
  );
  assertRuntimeReceiptMatchesRequest(cancelled, cancellationRequest);
}
