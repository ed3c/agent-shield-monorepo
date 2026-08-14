import {
  RUNTIME_RECEIPT_SCHEMA,
  runtimeEvidenceForOutcome,
  validateRuntimeRequestV2,
  type RuntimeAdmissionReceipt,
  type RuntimeOutcomeState,
  type RuntimeReceipt,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import { RuntimeLifecycle, validateRuntimeLifecycleTrace } from "../../state-machine/index.ts";
import type { RuntimeAdmissionResult, RuntimeMaterialization, RuntimeProviderSpi, RuntimeRunOptions } from "../types.ts";
import {
  deepFreeze, descriptorForRequest, emptyExit, normalizeAdmission, normalizeMaterialization,
  runtimeRequestDigest, unexercisedAdmission,
} from "../validation.ts";
import { materializedCleanup, recoveryCleanup } from "./cleanup.ts";
import { earlyReceipt, finalizeReceipt, observedProvider, safeCombinedDetail } from "./receipt.ts";
import { runBoundedStage, taskBudget } from "./stage.ts";
import { executeAndCollect } from "./task.ts";

export async function runRuntimeProvider(
  provider: RuntimeProviderSpi,
  value: unknown,
  options: RuntimeRunOptions = {},
): Promise<RuntimeReceipt> {
  const request = deepFreeze(validateRuntimeRequestV2(value));
  const descriptor = descriptorForRequest(provider, request);
  const providerIdentity = observedProvider(descriptor);
  const lifecycle = new RuntimeLifecycle();
  const now = options.now ?? Date.now;
  const taskDeadlineEpochMs = now() + request.limits.timeoutMs;
  lifecycle.transition("RESOLVED");

  if (descriptor.implementation === "NOT_IMPLEMENTED") {
    return earlyReceipt(request, providerIdentity, lifecycle, "NOT_IMPLEMENTED", unexercisedAdmission("provider adapter is not implemented"), null, "provider adapter is not implemented");
  }
  if (descriptor.availability === "ABSENT") {
    return earlyReceipt(request, providerIdentity, lifecycle, "ABSENT", unexercisedAdmission("required provider is absent"), null, "required provider is absent");
  }
  if (descriptor.availability === "REFUSED_POLICY") {
    return earlyReceipt(request, providerIdentity, lifecycle, "REFUSED_POLICY", { state: "FAIL", detail: "provider is refused by policy" }, null, "provider is refused by policy");
  }

  const admissionRun = await runBoundedStage(
    "admission", taskBudget(taskDeadlineEpochMs, now), request.limits.cancellationGraceMs, options.signal,
    (context) => provider.admit(request, context), now,
  );
  lifecycle.transition("ADMISSION_CHECKED");
  if (admissionRun.kind !== "RESOLVED") {
    const outcome: RuntimeOutcomeState = admissionRun.kind === "TIMED_OUT" ? "TIMED_OUT" : admissionRun.kind === "CANCELLED" ? "CANCELLED" : "FAILED_ADMISSION";
    return earlyReceipt(
      request, providerIdentity, lifecycle, outcome,
      { state: "FAIL", detail: admissionRun.kind === "REJECTED" ? "provider admission threw" : `provider admission ${admissionRun.kind.toLowerCase()}` },
      "admission",
      admissionRun.unsettled ? "provider admission did not settle after cancellation grace" : `provider admission ${admissionRun.kind.toLowerCase()}`,
    );
  }
  let admission: RuntimeAdmissionResult;
  try { admission = normalizeAdmission(admissionRun.value); }
  catch { admission = { state: "FAIL", detail: "provider admission returned an invalid result" }; }
  if (admission.state !== "PASS") {
    const outcome = admission.state === "REFUSED_POLICY" ? "REFUSED_POLICY" : "FAILED_ADMISSION";
    return earlyReceipt(request, providerIdentity, lifecycle, outcome, { state: "FAIL", detail: admission.detail }, "admission", admission.detail);
  }
  const admissionReceipt: RuntimeAdmissionReceipt = { state: "PASS", detail: admission.detail };

  lifecycle.transition("MATERIALIZING");
  const materializationRun = await runBoundedStage(
    "materialization", taskBudget(taskDeadlineEpochMs, now), request.limits.cancellationGraceMs, options.signal,
    (context) => provider.materialize(request, context), now,
  );
  let materialization: RuntimeMaterialization | null = null;
  let materializationTaskOutcome: Extract<RuntimeOutcomeState, "FAILED_MATERIALIZATION" | "CANCELLED" | "TIMED_OUT"> = "FAILED_MATERIALIZATION";
  if (materializationRun.kind === "RESOLVED") {
    try { materialization = normalizeMaterialization(materializationRun.value); }
    catch { materializationTaskOutcome = "FAILED_MATERIALIZATION"; }
  } else if (materializationRun.kind === "TIMED_OUT") materializationTaskOutcome = "TIMED_OUT";
  else if (materializationRun.kind === "CANCELLED") materializationTaskOutcome = "CANCELLED";

  if (materialization === null) {
    lifecycle.transition("CLEANING");
    const cleanup = await recoveryCleanup(provider, request, materializationTaskOutcome, materializationRun.unsettled, now);
    const outcome: RuntimeOutcomeState = cleanup.state === "PASS" ? materializationTaskOutcome : "FAILED_CLEANUP";
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
      taskStage: "materialization",
      terminalStage: outcome === "FAILED_CLEANUP" ? "cleanup" : "materialization",
      admission: admissionReceipt,
      taskOutcome: materializationTaskOutcome,
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
  const task = await executeAndCollect(provider, materialization, request, lifecycle, taskDeadlineEpochMs, options.signal, now);
  lifecycle.transition("CLEANING");
  const cleanup = await materializedCleanup(provider, materialization, request, task.taskOutcome, task.unsettledTaskOperation, now);
  const outcome: RuntimeOutcomeState = cleanup.state === "PASS" ? task.taskOutcome : "FAILED_CLEANUP";
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
    taskStage: task.taskStage,
    terminalStage: outcome === "FAILED_CLEANUP" ? "cleanup" : task.taskStage,
    admission: admissionReceipt,
    taskOutcome: task.taskOutcome,
    outcome,
    state: runtimeEvidenceForOutcome(outcome),
    exit: task.execution.exit,
    output: { stdoutBytes: task.execution.stdoutBytes, stderrBytes: task.execution.stderrBytes },
    artifacts: task.collection.artifacts,
    touchedPaths: task.collection.touchedPaths,
    cleanup,
    exclusions: [...request.exclusions],
    detail: safeCombinedDetail([task.execution.detail, task.collection.detail, cleanup.detail]),
  });
}
