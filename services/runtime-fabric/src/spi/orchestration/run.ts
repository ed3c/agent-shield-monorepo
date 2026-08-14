import {
  RUNTIME_RECEIPT_SCHEMA,
  runtimeEvidenceForOutcome,
  validateRuntimeRequest,
  type RuntimeAdmissionReceipt,
  type RuntimeOutcomeState,
  type RuntimeReceipt,
  type RuntimeStage,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import { RuntimeLifecycle, validateRuntimeLifecycleTrace } from "../../state-machine/index.ts";
import type {
  RuntimeAdmissionResult,
  RuntimeCollectionResult,
  RuntimeExecutionResult,
  RuntimeMaterialization,
  RuntimeProviderSpi,
  RuntimeRunOptions,
} from "../types.ts";
import {
  deepFreeze,
  descriptorForRequest,
  emptyExit,
  normalizeAdmission,
  normalizeCollection,
  normalizeExecution,
  normalizeMaterialization,
  runtimeRequestDigest,
  unexercisedAdmission,
} from "../validation.ts";
import { materializedCleanup, recoveryCleanup } from "./cleanup.ts";
import { earlyReceipt, finalizeReceipt, observedProvider, safeCombinedDetail } from "./receipt.ts";
import { runBoundedStage, taskBudget } from "./stage.ts";

export async function runRuntimeProvider(
  provider: RuntimeProviderSpi,
  value: unknown,
  options: RuntimeRunOptions = {},
): Promise<RuntimeReceipt> {
  const request = deepFreeze(validateRuntimeRequest(value));
  const descriptor = descriptorForRequest(provider, request);
  const providerIdentity = observedProvider(descriptor);
  const lifecycle = new RuntimeLifecycle();
  const now = options.now ?? Date.now;
  const taskDeadlineEpochMs = now() + request.limits.timeoutMs;
  lifecycle.transition("RESOLVED");

  if (descriptor.implementation === "NOT_IMPLEMENTED") {
    return earlyReceipt(request, providerIdentity, lifecycle, "NOT_IMPLEMENTED", unexercisedAdmission("provider adapter is not implemented"), "RESOLUTION", "provider adapter is not implemented");
  }
  if (descriptor.availability === "ABSENT") {
    return earlyReceipt(request, providerIdentity, lifecycle, "ABSENT", unexercisedAdmission("required provider is absent"), "RESOLUTION", "required provider is absent");
  }
  if (descriptor.availability === "REFUSED_POLICY") {
    return earlyReceipt(request, providerIdentity, lifecycle, "REFUSED_POLICY", { state: "FAIL", detail: "provider is refused by policy" }, "RESOLUTION", "provider is refused by policy");
  }

  const admissionRun = await runBoundedStage(
    "ADMISSION",
    taskBudget(taskDeadlineEpochMs, now),
    request.limits.cancellationGraceMs,
    options.signal,
    (context) => provider.admit(request, context),
    now,
  );
  lifecycle.transition("ADMISSION_CHECKED");
  if (admissionRun.kind !== "RESOLVED") {
    const outcome: RuntimeOutcomeState = admissionRun.kind === "TIMED_OUT" ? "TIMED_OUT" : admissionRun.kind === "CANCELLED" ? "CANCELLED" : "FAILED_ADMISSION";
    return earlyReceipt(
      request,
      providerIdentity,
      lifecycle,
      outcome,
      { state: "FAIL", detail: admissionRun.kind === "REJECTED" ? "provider admission threw" : `provider admission ${admissionRun.kind.toLowerCase()}` },
      "ADMISSION",
      admissionRun.unsettled ? "provider admission did not settle after cancellation grace" : `provider admission ${admissionRun.kind.toLowerCase()}`,
    );
  }

  let admission: RuntimeAdmissionResult;
  try {
    admission = normalizeAdmission(admissionRun.value);
  } catch {
    admission = { state: "FAIL", detail: "provider admission returned an invalid result" };
  }
  if (admission.state !== "PASS") {
    const outcome = admission.state === "REFUSED_POLICY" ? "REFUSED_POLICY" : "FAILED_ADMISSION";
    return earlyReceipt(request, providerIdentity, lifecycle, outcome, { state: "FAIL", detail: admission.detail }, "ADMISSION", admission.detail);
  }
  const admissionReceipt: RuntimeAdmissionReceipt = { state: "PASS", detail: admission.detail };

  lifecycle.transition("MATERIALIZING");
  const materializationRun = await runBoundedStage(
    "MATERIALIZATION",
    taskBudget(taskDeadlineEpochMs, now),
    request.limits.cancellationGraceMs,
    options.signal,
    (context) => provider.materialize(request, context),
    now,
  );

  let materialization: RuntimeMaterialization | null = null;
  let materializationTaskOutcome: Extract<RuntimeOutcomeState, "FAILED_MATERIALIZATION" | "CANCELLED" | "TIMED_OUT"> | null = null;
  if (materializationRun.kind === "RESOLVED") {
    try {
      materialization = normalizeMaterialization(materializationRun.value);
    } catch {
      materializationTaskOutcome = "FAILED_MATERIALIZATION";
    }
  } else if (materializationRun.kind === "TIMED_OUT") {
    materializationTaskOutcome = "TIMED_OUT";
  } else if (materializationRun.kind === "CANCELLED") {
    materializationTaskOutcome = "CANCELLED";
  } else {
    materializationTaskOutcome = "FAILED_MATERIALIZATION";
  }

  if (materialization === null) {
    const taskOutcome = materializationTaskOutcome ?? "FAILED_MATERIALIZATION";
    lifecycle.transition("CLEANING");
    const cleanup = await recoveryCleanup(provider, request, taskOutcome, materializationRun.unsettled, now);
    const outcome: RuntimeOutcomeState = cleanup.state === "PASS" ? taskOutcome : "FAILED_CLEANUP";
    lifecycle.transition(outcome);
    validateRuntimeLifecycleTrace(lifecycle.trace);
    return finalizeReceipt(request, {
      schema: RUNTIME_RECEIPT_SCHEMA,
      requestId: request.requestId,
      requestDigest: runtimeRequestDigest(request),
      provider: providerIdentity,
      source: request.source,
      workspaceIdentity: null,
      lifecycle: [...lifecycle.trace],
      taskStage: "MATERIALIZATION",
      terminalStage: outcome === "FAILED_CLEANUP" ? "CLEANUP" : "MATERIALIZATION",
      admission: admissionReceipt,
      taskOutcome,
      outcome,
      state: runtimeEvidenceForOutcome(outcome),
      exit: emptyExit(),
      output: { stdoutBytes: 0, stderrBytes: 0 },
      artifacts: [],
      touchedPaths: [],
      cleanup,
      exclusions: [...request.exclusions],
      detail: safeCombinedDetail([
        materializationRun.kind === "RESOLVED" ? "provider returned an invalid materialization" : `provider materialization ${materializationRun.kind.toLowerCase()}`,
        cleanup.detail,
      ]),
    });
  }

  lifecycle.transition("READY");
  lifecycle.transition("RUNNING");
  const executionRun = await runBoundedStage(
    "EXECUTION",
    taskBudget(taskDeadlineEpochMs, now),
    request.limits.cancellationGraceMs,
    options.signal,
    (context) => provider.execute(materialization as RuntimeMaterialization, request, context),
    now,
  );

  let execution: RuntimeExecutionResult;
  let taskOutcome: RuntimeOutcomeState;
  let taskStage: Extract<RuntimeStage, "EXECUTION" | "COLLECTION"> = "EXECUTION";
  let unsettledTaskOperation: string | null = null;
  if (executionRun.kind === "RESOLVED") {
    try {
      execution = normalizeExecution(executionRun.value, request);
      taskOutcome = execution.state === "PASS"
        ? "COMPLETED"
        : execution.state === "CANCELLED"
          ? "CANCELLED"
          : execution.state === "TIMED_OUT"
            ? "TIMED_OUT"
            : "FAILED_EXECUTION";
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

  let collection: RuntimeCollectionResult = {
    state: "FAIL",
    artifacts: [],
    touchedPaths: [],
    detail: "artifact collection was not exercised",
  };
  if (execution.state === "PASS") {
    lifecycle.transition("COLLECTING");
    taskStage = "COLLECTION";
    const collectionRun = await runBoundedStage(
      "COLLECTION",
      taskBudget(taskDeadlineEpochMs, now),
      request.limits.cancellationGraceMs,
      options.signal,
      (context) => provider.collect(materialization as RuntimeMaterialization, request, execution, context),
      now,
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

  lifecycle.transition("CLEANING");
  const cleanup = await materializedCleanup(provider, materialization, request, taskOutcome, unsettledTaskOperation, now);
  const outcome: RuntimeOutcomeState = cleanup.state === "PASS" ? taskOutcome : "FAILED_CLEANUP";
  lifecycle.transition(outcome);
  validateRuntimeLifecycleTrace(lifecycle.trace);

  return finalizeReceipt(request, {
    schema: RUNTIME_RECEIPT_SCHEMA,
    requestId: request.requestId,
    requestDigest: runtimeRequestDigest(request),
    provider: providerIdentity,
    source: request.source,
    workspaceIdentity: materialization.workspaceIdentity,
    lifecycle: [...lifecycle.trace],
    taskStage,
    terminalStage: outcome === "FAILED_CLEANUP" ? "CLEANUP" : taskStage,
    admission: admissionReceipt,
    taskOutcome,
    outcome,
    state: runtimeEvidenceForOutcome(outcome),
    exit: execution.exit,
    output: { stdoutBytes: execution.stdoutBytes, stderrBytes: execution.stderrBytes },
    artifacts: collection.artifacts,
    touchedPaths: collection.touchedPaths,
    cleanup,
    exclusions: [...request.exclusions],
    detail: safeCombinedDetail([execution.detail, collection.detail, cleanup.detail]),
  });
}
