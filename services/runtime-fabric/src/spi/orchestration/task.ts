import type { RuntimeOutcomeState, RuntimeRequest } from "../../../../../packages/contracts/src/runtime/index.ts";
import { RuntimeLifecycle } from "../../state-machine/index.ts";
import type {
  RuntimeCollectionResult,
  RuntimeExecutionResult,
  RuntimeMaterialization,
  RuntimeProviderSpi,
} from "../types.ts";
import { emptyExit, normalizeCollection, normalizeExecution } from "../validation.ts";
import { runBoundedStage, taskBudget } from "./stage.ts";

export interface TaskRunResult {
  execution: RuntimeExecutionResult;
  collection: RuntimeCollectionResult;
  taskOutcome: RuntimeOutcomeState;
  taskStage: "execution" | "collection";
  unsettledTaskOperation: string | null;
}

export async function executeAndCollect(
  provider: RuntimeProviderSpi,
  materialization: RuntimeMaterialization,
  request: RuntimeRequest,
  lifecycle: RuntimeLifecycle,
  taskDeadlineMonotonicMs: number,
  signal: AbortSignal | undefined,
): Promise<TaskRunResult> {
  lifecycle.transition("RUNNING");
  const executionRun = await runBoundedStage(
    "execution",
    taskBudget(taskDeadlineMonotonicMs),
    request.limits.cancellationGraceMs,
    signal,
    (context) => provider.execute(materialization, request, context),
  );
  let execution: RuntimeExecutionResult;
  let taskOutcome: RuntimeOutcomeState;
  let taskStage: "execution" | "collection" = "execution";
  let unsettledTaskOperation: string | null = null;
  if (executionRun.kind === "RESOLVED") {
    try {
      execution = normalizeExecution(executionRun.value, request);
      taskOutcome = execution.state === "PASS" ? "COMPLETED" : execution.state === "CANCELLED" ? "CANCELLED" : execution.state === "TIMED_OUT" ? "TIMED_OUT" : "FAILED_EXECUTION";
    } catch {
      execution = { state: "FAIL", exit: emptyExit(), stdoutBytes: 0, stderrBytes: 0, detail: "provider execution returned an invalid result" };
      taskOutcome = "FAILED_EXECUTION";
    }
  } else if (executionRun.kind === "TIMED_OUT") {
    execution = { state: "TIMED_OUT", exit: { code: null, signal: null, timedOut: true, cancelled: false }, stdoutBytes: 0, stderrBytes: 0, detail: "provider execution timed out" };
    taskOutcome = "TIMED_OUT";
    if (executionRun.unsettled) unsettledTaskOperation = "execution-operation-unsettled";
  } else if (executionRun.kind === "CANCELLED") {
    execution = { state: "CANCELLED", exit: { code: null, signal: null, timedOut: false, cancelled: true }, stdoutBytes: 0, stderrBytes: 0, detail: "provider execution was cancelled" };
    taskOutcome = "CANCELLED";
    if (executionRun.unsettled) unsettledTaskOperation = "execution-operation-unsettled";
  } else {
    execution = { state: "FAIL", exit: emptyExit(), stdoutBytes: 0, stderrBytes: 0, detail: "provider execution threw" };
    taskOutcome = "FAILED_EXECUTION";
  }

  let collection: RuntimeCollectionResult = { state: "FAIL", artifacts: [], touchedPaths: [], detail: "artifact collection was not exercised" };
  if (execution.state === "PASS") {
    lifecycle.transition("COLLECTING");
    taskStage = "collection";
    const collectionRun = await runBoundedStage(
      "collection",
      taskBudget(taskDeadlineMonotonicMs),
      request.limits.cancellationGraceMs,
      signal,
      (context) => provider.collect(materialization, request, execution, context),
    );
    if (collectionRun.kind === "RESOLVED") {
      try {
        collection = normalizeCollection(collectionRun.value, request);
        taskOutcome = collection.state === "PASS" ? "COMPLETED" : "FAILED_ARTIFACT";
      } catch {
        collection = { state: "FAIL", artifacts: [], touchedPaths: [], detail: "provider artifact collection returned an invalid result" };
        taskOutcome = "FAILED_ARTIFACT";
      }
    } else if (collectionRun.kind === "TIMED_OUT") {
      collection = { state: "FAIL", artifacts: [], touchedPaths: [], detail: "provider artifact collection timed out" };
      taskOutcome = "TIMED_OUT";
      if (collectionRun.unsettled) unsettledTaskOperation = "collection-operation-unsettled";
    } else if (collectionRun.kind === "CANCELLED") {
      collection = { state: "FAIL", artifacts: [], touchedPaths: [], detail: "provider artifact collection was cancelled" };
      taskOutcome = "CANCELLED";
      if (collectionRun.unsettled) unsettledTaskOperation = "collection-operation-unsettled";
    } else {
      collection = { state: "FAIL", artifacts: [], touchedPaths: [], detail: "provider artifact collection threw" };
      taskOutcome = "FAILED_ARTIFACT";
    }
  }
  return { execution, collection, taskOutcome, taskStage, unsettledTaskOperation };
}
