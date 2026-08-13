import {
  assertRuntimeReceiptMatchesRequest,
  runRuntimeProvider,
} from "../spi/index.ts";
import {
  validateRuntimeRequest,
  type RuntimeRequest,
} from "../../../../packages/contracts/src/runtime/index.ts";
import { FixtureProvider } from "./provider-fixture.ts";
import { requestValue } from "./request-fixture.ts";
import { ok } from "./test-support.ts";

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function boundedRequest(timeoutMs = 30): RuntimeRequest {
  const value = requestValue();
  const limits = value.limits as Record<string, unknown>;
  limits.timeoutMs = timeoutMs;
  limits.cancellationGraceMs = 5;
  const cleanup = value.cleanup as Record<string, unknown>;
  cleanup.maxDurationMs = 30;
  return validateRuntimeRequest(value);
}

export async function runtimeTimeoutSelftest(): Promise<void> {
  const request = boundedRequest();

  const admissionProvider = new FixtureProvider();
  admissionProvider.admit = async () => never();
  const admission = await runRuntimeProvider(admissionProvider, request);
  ok(
    admission.taskOutcome === "TIMED_OUT" &&
      admission.outcome === "TIMED_OUT" &&
      admission.taskStage === "admission" &&
      admission.terminalStage === "admission" &&
      admission.workspaceIdentity === null &&
      admission.cleanup.state === "NOT_EXERCISED" &&
      !admission.exit.timedOut,
    "admission timeout lost its stage",
  );
  assertRuntimeReceiptMatchesRequest(admission, request);

  const materializationProvider = new FixtureProvider();
  materializationProvider.materialize = async (_request, context) =>
    new Promise<never>((_, reject) => {
      context.signal.addEventListener(
        "abort",
        () => reject(new Error("materialization aborted")),
        { once: true },
      );
    });
  const materialization = await runRuntimeProvider(
    materializationProvider,
    request,
  );
  ok(
    materializationProvider.recoveryCleanupCalled &&
      materialization.taskOutcome === "TIMED_OUT" &&
      materialization.outcome === "TIMED_OUT" &&
      materialization.taskStage === "materialization" &&
      materialization.terminalStage === "materialization" &&
      materialization.workspaceIdentity === null &&
      materialization.cleanup.state === "PASS" &&
      !materialization.exit.timedOut,
    "materialization timeout or recovery cleanup lost",
  );
  assertRuntimeReceiptMatchesRequest(materialization, request);

  const uncooperativeMaterializationProvider = new FixtureProvider();
  uncooperativeMaterializationProvider.materialize = async () => never();
  const uncooperativeMaterialization = await runRuntimeProvider(
    uncooperativeMaterializationProvider,
    request,
  );
  ok(
    uncooperativeMaterialization.taskOutcome === "TIMED_OUT" &&
      uncooperativeMaterialization.outcome === "FAILED_CLEANUP" &&
      uncooperativeMaterialization.taskStage === "materialization" &&
      uncooperativeMaterialization.terminalStage === "cleanup" &&
      uncooperativeMaterialization.cleanup.state === "FAIL" &&
      uncooperativeMaterialization.cleanup.residue.includes(
        "materialization-operation-unsettled",
      ),
    "unsettled materialization was reported clean",
  );
  assertRuntimeReceiptMatchesRequest(
    uncooperativeMaterialization,
    request,
  );

  const executionProvider = new FixtureProvider();
  executionProvider.execute = async () => never();
  const execution = await runRuntimeProvider(executionProvider, request);
  ok(
    executionProvider.cleanupCalled &&
      execution.taskOutcome === "TIMED_OUT" &&
      execution.outcome === "TIMED_OUT" &&
      execution.taskStage === "execution" &&
      execution.terminalStage === "execution" &&
      execution.workspaceIdentity !== null &&
      execution.exit.timedOut &&
      execution.cleanup.state === "PASS",
    "execution timeout lost execution or cleanup evidence",
  );
  assertRuntimeReceiptMatchesRequest(execution, request);

  const collectionProvider = new FixtureProvider();
  collectionProvider.collect = async () => never();
  const collection = await runRuntimeProvider(collectionProvider, request);
  ok(
    collectionProvider.cleanupCalled &&
      collection.taskOutcome === "TIMED_OUT" &&
      collection.outcome === "TIMED_OUT" &&
      collection.taskStage === "collection" &&
      collection.terminalStage === "collection" &&
      collection.exit.code === 0 &&
      !collection.exit.timedOut &&
      collection.cleanup.state === "PASS",
    "collection timeout corrupted successful execution evidence",
  );
  assertRuntimeReceiptMatchesRequest(collection, request);

  const cleanupProvider = new FixtureProvider();
  cleanupProvider.cleanup = async () => never();
  const cleanup = await runRuntimeProvider(cleanupProvider, request);
  ok(
    cleanup.taskOutcome === "COMPLETED" &&
      cleanup.taskStage === null &&
      cleanup.outcome === "FAILED_CLEANUP" &&
      cleanup.terminalStage === "cleanup" &&
      cleanup.cleanup.state === "FAIL" &&
      cleanup.cleanup.timedOut &&
      cleanup.exit.code === 0,
    "cleanup timeout erased the completed task outcome",
  );
  assertRuntimeReceiptMatchesRequest(cleanup, request);

  const cancellationRequest = boundedRequest(250);
  const cancellationProvider = new FixtureProvider();
  cancellationProvider.execute = async () => never();
  const controller = new AbortController();
  const cancellationPromise = runRuntimeProvider(
    cancellationProvider,
    cancellationRequest,
    { signal: controller.signal },
  );
  setTimeout(() => controller.abort(), 1);
  const cancellation = await cancellationPromise;
  ok(
    cancellationProvider.cleanupCalled &&
      cancellation.taskOutcome === "CANCELLED" &&
      cancellation.outcome === "CANCELLED" &&
      cancellation.taskStage === "execution" &&
      cancellation.terminalStage === "execution" &&
      cancellation.exit.cancelled &&
      cancellation.cleanup.state === "PASS",
    "external cancellation did not remain stage-aware",
  );
  assertRuntimeReceiptMatchesRequest(cancellation, cancellationRequest);
}
