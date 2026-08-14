import {
  RUNTIME_RECEIPT_SCHEMA,
  runtimeEvidenceForOutcome,
  validateRuntimeRequest,
  type RuntimeAdmissionReceipt,
  type RuntimeCleanupReceipt,
  type RuntimeOutcomeState,
  type RuntimeProviderDescriptor,
  type RuntimeReceipt,
  type RuntimeRequest,
} from "../../../../packages/contracts/src/runtime/index.ts";
import { RuntimeLifecycle, validateRuntimeLifecycleTrace } from "../state-machine/index.ts";
import { RuntimeProviderRegistry } from "./registry.ts";
import type { RuntimeAdmissionResult, RuntimeCollectionResult, RuntimeExecutionResult, RuntimeMaterialization, RuntimeProviderSpi } from "./types.ts";
import {
  deepFreeze,
  descriptorForRequest,
  emptyExit,
  failedCleanup,
  normalizeAdmission,
  normalizeCleanup,
  normalizeCollection,
  normalizeExecution,
  normalizeMaterialization,
  runtimeRequestDigest,
  unexercisedAdmission,
  unexercisedCleanup,
} from "./validation.ts";

function earlyReceipt(
  request: RuntimeRequest,
  descriptor: RuntimeProviderDescriptor,
  lifecycle: RuntimeLifecycle,
  outcome: RuntimeOutcomeState,
  admission: RuntimeAdmissionReceipt,
  detail: string,
): RuntimeReceipt {
  lifecycle.transition(outcome);
  validateRuntimeLifecycleTrace(lifecycle.trace);
  return {
    schema: RUNTIME_RECEIPT_SCHEMA,
    requestId: request.requestId,
    requestDigest: runtimeRequestDigest(request),
    provider: {
      id: descriptor.id,
      version: descriptor.version,
      scope: descriptor.scope,
      capabilities: [...descriptor.capabilities],
    },
    source: request.source,
    workspaceIdentity: null,
    lifecycle: [...lifecycle.trace],
    admission,
    taskOutcome: outcome,
    outcome,
    state: runtimeEvidenceForOutcome(outcome),
    exit: emptyExit(),
    output: { stdoutBytes: 0, stderrBytes: 0 },
    artifacts: [],
    touchedPaths: [],
    cleanup: unexercisedCleanup("no provider workspace was materialized"),
    exclusions: [...request.exclusions],
    detail,
  };
}

function safeCombinedDetail(parts: readonly string[]): string {
  const combined = parts.filter((entry) => entry.length > 0).join("; ");
  return combined.length <= 1024 ? combined : `${combined.slice(0, 1021)}...`;
}

export async function runRuntimeProvider(provider: RuntimeProviderSpi, value: unknown): Promise<RuntimeReceipt> {
  const request = deepFreeze(validateRuntimeRequest(value));
  const descriptor = descriptorForRequest(provider, request);
  const lifecycle = new RuntimeLifecycle();
  lifecycle.transition("RESOLVED");

  if (descriptor.implementation === "NOT_IMPLEMENTED") {
    return earlyReceipt(
      request,
      descriptor,
      lifecycle,
      "NOT_IMPLEMENTED",
      unexercisedAdmission("provider adapter is not implemented"),
      "provider adapter is not implemented",
    );
  }
  if (descriptor.availability === "ABSENT") {
    return earlyReceipt(
      request,
      descriptor,
      lifecycle,
      "ABSENT",
      unexercisedAdmission("required provider is absent"),
      "required provider is absent",
    );
  }
  if (descriptor.availability === "REFUSED_POLICY") {
    return earlyReceipt(
      request,
      descriptor,
      lifecycle,
      "REFUSED_POLICY",
      { state: "FAIL", detail: "provider is refused by policy" },
      "provider is refused by policy",
    );
  }

  let admission: RuntimeAdmissionResult;
  try {
    admission = normalizeAdmission(await provider.admit(request));
  } catch {
    admission = { state: "FAIL", detail: "provider admission threw" };
  }
  lifecycle.transition("ADMISSION_CHECKED");
  if (admission.state !== "PASS") {
    const outcome = admission.state === "REFUSED_POLICY" ? "REFUSED_POLICY" : "FAILED_ADMISSION";
    return earlyReceipt(request, descriptor, lifecycle, outcome, { state: "FAIL", detail: admission.detail }, admission.detail);
  }
  const admissionReceipt: RuntimeAdmissionReceipt = { state: "PASS", detail: admission.detail };

  lifecycle.transition("MATERIALIZING");
  let materialization: RuntimeMaterialization;
  try {
    materialization = normalizeMaterialization(await provider.materialize(request));
  } catch {
    lifecycle.transition("FAILED_MATERIALIZATION");
    validateRuntimeLifecycleTrace(lifecycle.trace);
    return {
      schema: RUNTIME_RECEIPT_SCHEMA,
      requestId: request.requestId,
      requestDigest: runtimeRequestDigest(request),
      provider: {
        id: descriptor.id,
        version: descriptor.version,
        scope: descriptor.scope,
        capabilities: [...descriptor.capabilities],
      },
      source: request.source,
      workspaceIdentity: null,
      lifecycle: [...lifecycle.trace],
      admission: admissionReceipt,
      taskOutcome: "FAILED_MATERIALIZATION",
      outcome: "FAILED_MATERIALIZATION",
      state: "FAIL",
      exit: emptyExit(),
      output: { stdoutBytes: 0, stderrBytes: 0 },
      artifacts: [],
      touchedPaths: [],
      cleanup: unexercisedCleanup("materialization did not transfer an owned workspace"),
      exclusions: [...request.exclusions],
      detail: "provider materialization failed before ownership transfer",
    };
  }

  lifecycle.transition("READY");
  lifecycle.transition("RUNNING");

  let execution: RuntimeExecutionResult;
  let collection: RuntimeCollectionResult = {
    state: "FAIL",
    artifacts: [],
    touchedPaths: [],
    detail: "artifact collection was not exercised",
  };
  let taskOutcome: RuntimeOutcomeState = "FAILED_EXECUTION";

  try {
    execution = normalizeExecution(await provider.execute(materialization, request), request);
    if (execution.state === "PASS") {
      lifecycle.transition("COLLECTING");
      try {
        collection = normalizeCollection(await provider.collect(materialization, request, execution), request);
        taskOutcome = collection.state === "PASS" ? "COMPLETED" : "FAILED_ARTIFACT";
      } catch {
        collection = {
          state: "FAIL",
          artifacts: [],
          touchedPaths: [],
          detail: "provider artifact collection was invalid",
        };
        taskOutcome = "FAILED_ARTIFACT";
      }
    } else if (execution.state === "CANCELLED") {
      taskOutcome = "CANCELLED";
    } else if (execution.state === "TIMED_OUT") {
      taskOutcome = "TIMED_OUT";
    } else {
      taskOutcome = "FAILED_EXECUTION";
    }
  } catch {
    execution = {
      state: "FAIL",
      exit: emptyExit(),
      stdoutBytes: 0,
      stderrBytes: 0,
      detail: "provider execution threw or returned an invalid result",
    };
    taskOutcome = "FAILED_EXECUTION";
  }

  lifecycle.transition("CLEANING");
  let cleanup: RuntimeCleanupReceipt;
  try {
    cleanup = normalizeCleanup(await provider.cleanup(materialization, request), request);
  } catch {
    cleanup = failedCleanup("provider cleanup threw or returned an invalid receipt");
  }

  const outcome: RuntimeOutcomeState = cleanup.state === "PASS" ? taskOutcome : "FAILED_CLEANUP";
  lifecycle.transition(outcome);
  validateRuntimeLifecycleTrace(lifecycle.trace);

  return {
    schema: RUNTIME_RECEIPT_SCHEMA,
    requestId: request.requestId,
    requestDigest: runtimeRequestDigest(request),
    provider: {
      id: descriptor.id,
      version: descriptor.version,
      scope: descriptor.scope,
      capabilities: [...descriptor.capabilities],
    },
    source: request.source,
    workspaceIdentity: materialization.workspaceIdentity,
    lifecycle: [...lifecycle.trace],
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
  };
}

export async function dispatchRuntimeRequest(registry: RuntimeProviderRegistry, value: unknown): Promise<RuntimeReceipt> {
  const request = deepFreeze(validateRuntimeRequest(value));
  const provider = registry.resolve(request.providerId, request.scope);
  if (provider) return runRuntimeProvider(provider, request);

  const lifecycle = new RuntimeLifecycle();
  lifecycle.transition("RESOLVED");
  lifecycle.transition("ABSENT");
  return {
    schema: RUNTIME_RECEIPT_SCHEMA,
    requestId: request.requestId,
    requestDigest: runtimeRequestDigest(request),
    provider: { id: request.providerId, version: "unresolved", scope: request.scope, capabilities: [] },
    source: request.source,
    workspaceIdentity: null,
    lifecycle: [...lifecycle.trace],
    admission: unexercisedAdmission("provider is not registered"),
    taskOutcome: "ABSENT",
    outcome: "ABSENT",
    state: "ABSENT",
    exit: emptyExit(),
    output: { stdoutBytes: 0, stderrBytes: 0 },
    artifacts: [],
    touchedPaths: [],
    cleanup: unexercisedCleanup("no provider workspace was materialized"),
    exclusions: [...request.exclusions],
    detail: "provider is not registered",
  };
}
