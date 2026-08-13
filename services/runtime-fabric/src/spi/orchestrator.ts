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
  type RuntimeStage,
} from "../../../../packages/contracts/src/runtime/index.ts";
import {
  RuntimeLifecycle,
  validateRuntimeLifecycleTrace,
} from "../state-machine/index.ts";
import { RuntimeProviderRegistry } from "./registry.ts";
import type {
  RuntimeAdmissionResult,
  RuntimeCollectionResult,
  RuntimeExecutionResult,
  RuntimeMaterialization,
  RuntimeOperationContext,
  RuntimeProviderSpi,
  RuntimeRunOptions,
} from "./types.ts";
import {
  assertRuntimeReceiptMatchesRequest,
  cancelledExit,
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
  timeoutExit,
  unexercisedAdmission,
  unexercisedCleanup,
} from "./validation.ts";

type StageFailureKind = "ERROR" | "TIMED_OUT" | "CANCELLED";

class RuntimeStageFailure extends Error {
  constructor(
    readonly stage: RuntimeStage,
    readonly kind: StageFailureKind,
    readonly settledWithinGrace: boolean,
  ) {
    super(`runtime ${stage} ${kind.toLowerCase()}`);
  }
}

type Observed<T> =
  | { kind: "VALUE"; value: T }
  | { kind: "ERROR" };

type Trigger =
  | { kind: "TIMED_OUT" }
  | { kind: "CANCELLED" };

function stageDetail(failure: RuntimeStageFailure): string {
  const suffix = failure.settledWithinGrace
    ? "provider operation settled within cancellation grace"
    : "provider operation did not settle within cancellation grace";
  return `${failure.stage} ${failure.kind.toLowerCase()}; ${suffix}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBoundedStage<T>(
  stage: RuntimeStage,
  deadlineEpochMs: number,
  cancellationGraceMs: number,
  externalSignal: AbortSignal | undefined,
  operation: (context: RuntimeOperationContext) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let externalAbort: (() => void) | null = null;
  let triggerResolve: ((trigger: Trigger) => void) | null = null;

  const trigger = new Promise<Trigger>((resolve) => {
    triggerResolve = resolve;
  });

  const cancel = (): void => {
    triggerResolve?.({ kind: "CANCELLED" });
  };

  if (externalSignal?.aborted) {
    cancel();
  } else if (externalSignal) {
    externalAbort = cancel;
    externalSignal.addEventListener("abort", externalAbort, { once: true });
  }

  const remainingMs = Math.max(0, deadlineEpochMs - Date.now());
  timer = setTimeout(() => {
    triggerResolve?.({ kind: "TIMED_OUT" });
  }, remainingMs);

  const context: RuntimeOperationContext = Object.freeze({
    stage,
    signal: controller.signal,
    deadlineEpochMs,
    cancellationGraceMs,
  });

  const observed: Promise<Observed<T>> = Promise.resolve()
    .then(() => operation(context))
    .then(
      (value) => ({ kind: "VALUE", value }) as const,
      () => ({ kind: "ERROR" }) as const,
    );

  const first = await Promise.race([observed, trigger]);

  if (timer) clearTimeout(timer);
  if (externalSignal && externalAbort) {
    externalSignal.removeEventListener("abort", externalAbort);
  }
  triggerResolve = null;

  if (first.kind === "VALUE") return first.value;
  if (first.kind === "ERROR") {
    throw new RuntimeStageFailure(stage, "ERROR", true);
  }

  controller.abort(first.kind);
  const settledWithinGrace = await Promise.race([
    observed.then(() => true),
    delay(cancellationGraceMs).then(() => false),
  ]);
  throw new RuntimeStageFailure(stage, first.kind, settledWithinGrace);
}

function providerReceiptIdentity(descriptor: RuntimeProviderDescriptor): RuntimeReceipt["provider"] {
  return {
    id: descriptor.id,
    version: descriptor.version,
    subject: descriptor.subject,
    environmentSubject: descriptor.environmentSubject,
    scope: descriptor.scope,
    capabilities: [...descriptor.capabilities],
  };
}

function requestProviderIdentity(request: RuntimeRequest): RuntimeReceipt["provider"] {
  return {
    id: request.providerId,
    version: request.providerVersion,
    subject: request.providerSubject,
    environmentSubject: request.environmentSubject,
    scope: request.scope,
    capabilities: [],
  };
}

function safeCombinedDetail(parts: readonly string[]): string {
  const combined = parts.filter((entry) => entry.length > 0).join("; ");
  return combined.length <= 1024 ? combined : `${combined.slice(0, 1021)}...`;
}

function sealReceipt(receipt: RuntimeReceipt, request: RuntimeRequest): RuntimeReceipt {
  assertRuntimeReceiptMatchesRequest(receipt, request);
  return deepFreeze(receipt);
}

function earlyReceipt(
  request: RuntimeRequest,
  provider: RuntimeReceipt["provider"],
  lifecycle: RuntimeLifecycle,
  outcome: RuntimeOutcomeState,
  admission: RuntimeAdmissionReceipt,
  detail: string,
  taskStage: RuntimeStage | null = null,
): RuntimeReceipt {
  lifecycle.transition(outcome);
  validateRuntimeLifecycleTrace(lifecycle.trace);
  return sealReceipt(
    {
      schema: RUNTIME_RECEIPT_SCHEMA,
      requestId: request.requestId,
      requestDigest: runtimeRequestDigest(request),
      provider,
      source: request.source,
      workspaceIdentity: null,
      lifecycle: [...lifecycle.trace],
      admission,
      taskStage,
      terminalStage: taskStage,
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
    },
    request,
  );
}

function taskDeadline(request: RuntimeRequest): number {
  return Date.now() + request.limits.timeoutMs;
}

function cleanupDeadline(request: RuntimeRequest): number {
  return Date.now() + request.cleanup.maxDurationMs;
}

function stageTaskOutcome(failure: RuntimeStageFailure): Extract<
  RuntimeOutcomeState,
  "FAILED_ADMISSION" | "FAILED_MATERIALIZATION" | "FAILED_EXECUTION" | "FAILED_ARTIFACT" | "CANCELLED" | "TIMED_OUT"
> {
  if (failure.kind === "TIMED_OUT") return "TIMED_OUT";
  if (failure.kind === "CANCELLED") return "CANCELLED";
  switch (failure.stage) {
    case "admission":
      return "FAILED_ADMISSION";
    case "materialization":
      return "FAILED_MATERIALIZATION";
    case "execution":
      return "FAILED_EXECUTION";
    case "collection":
      return "FAILED_ARTIFACT";
    case "cleanup":
      throw new Error("cleanup failure is not a task outcome");
  }
}

async function runRecoveryCleanup(
  provider: RuntimeProviderSpi,
  request: RuntimeRequest,
  taskOutcome: Extract<
    RuntimeOutcomeState,
    "FAILED_MATERIALIZATION" | "CANCELLED" | "TIMED_OUT"
  >,
): Promise<RuntimeCleanupReceipt> {
  try {
    return await runBoundedStage(
      "cleanup",
      cleanupDeadline(request),
      request.limits.cancellationGraceMs,
      undefined,
      async (context) =>
        normalizeCleanup(
          await provider.cleanupFailedMaterialization(
            request,
            taskOutcome,
            context,
          ),
          request,
          taskOutcome,
          false,
        ),
    );
  } catch (error) {
    if (error instanceof RuntimeStageFailure) {
      return failedCleanup(stageDetail(error), {
        timedOut: error.kind === "TIMED_OUT",
        cancelled: error.kind === "CANCELLED",
        residue: ["materialization-recovery-uncertain"],
      });
    }
    return failedCleanup("materialization recovery cleanup failed", {
      residue: ["materialization-recovery-uncertain"],
    });
  }
}

async function materializationFailureReceipt(
  provider: RuntimeProviderSpi,
  request: RuntimeRequest,
  descriptor: RuntimeProviderDescriptor,
  lifecycle: RuntimeLifecycle,
  admission: RuntimeAdmissionReceipt,
  failure: RuntimeStageFailure,
): Promise<RuntimeReceipt> {
  const rawTaskOutcome = stageTaskOutcome(failure);
  const taskOutcome =
    rawTaskOutcome === "FAILED_ADMISSION" ||
    rawTaskOutcome === "FAILED_EXECUTION" ||
    rawTaskOutcome === "FAILED_ARTIFACT"
      ? "FAILED_MATERIALIZATION"
      : rawTaskOutcome;

  lifecycle.transition("CLEANING");
  let cleanup = await runRecoveryCleanup(provider, request, taskOutcome);
  if (!failure.settledWithinGrace && cleanup.state === "PASS") {
    cleanup = failedCleanup(
      "materialization operation remained unsettled after cancellation grace",
      { residue: ["materialization-operation-unsettled"] },
    );
  }
  const outcome: RuntimeOutcomeState =
    cleanup.state === "PASS" ? taskOutcome : "FAILED_CLEANUP";
  const terminalStage: RuntimeStage =
    outcome === "FAILED_CLEANUP" ? "cleanup" : "materialization";
  lifecycle.transition(outcome);
  validateRuntimeLifecycleTrace(lifecycle.trace);

  return sealReceipt(
    {
      schema: RUNTIME_RECEIPT_SCHEMA,
      requestId: request.requestId,
      requestDigest: runtimeRequestDigest(request),
      provider: providerReceiptIdentity(descriptor),
      source: request.source,
      workspaceIdentity: null,
      lifecycle: [...lifecycle.trace],
      admission,
      taskStage: "materialization",
      terminalStage,
      taskOutcome,
      outcome,
      state: runtimeEvidenceForOutcome(outcome),
      exit: emptyExit(),
      output: { stdoutBytes: 0, stderrBytes: 0 },
      artifacts: [],
      touchedPaths: [],
      cleanup,
      exclusions: [...request.exclusions],
      detail: safeCombinedDetail([stageDetail(failure), cleanup.detail]),
    },
    request,
  );
}

export async function runRuntimeProvider(
  provider: RuntimeProviderSpi,
  value: unknown,
  options: RuntimeRunOptions = {},
): Promise<RuntimeReceipt> {
  const request = deepFreeze(validateRuntimeRequest(value));
  const descriptor = descriptorForRequest(provider, request);
  const providerIdentity = providerReceiptIdentity(descriptor);
  const lifecycle = new RuntimeLifecycle();
  lifecycle.transition("RESOLVED");

  if (descriptor.implementation === "NOT_IMPLEMENTED") {
    return earlyReceipt(
      request,
      providerIdentity,
      lifecycle,
      "NOT_IMPLEMENTED",
      unexercisedAdmission("provider adapter is not implemented"),
      "provider adapter is not implemented",
    );
  }
  if (descriptor.availability === "ABSENT") {
    return earlyReceipt(
      request,
      providerIdentity,
      lifecycle,
      "ABSENT",
      unexercisedAdmission("required provider is absent"),
      "required provider is absent",
    );
  }
  if (descriptor.availability === "REFUSED_POLICY") {
    return earlyReceipt(
      request,
      providerIdentity,
      lifecycle,
      "REFUSED_POLICY",
      { state: "FAIL", detail: "provider is refused by policy" },
      "provider is refused by policy",
    );
  }

  const deadline = taskDeadline(request);

  let admission: RuntimeAdmissionResult;
  let admissionFailure: RuntimeStageFailure | null = null;
  try {
    admission = await runBoundedStage(
      "admission",
      deadline,
      request.limits.cancellationGraceMs,
      options.signal,
      async (context) => normalizeAdmission(await provider.admit(request, context)),
    );
  } catch (error) {
    admissionFailure =
      error instanceof RuntimeStageFailure
        ? error
        : new RuntimeStageFailure("admission", "ERROR", true);
    admission = { state: "FAIL", detail: stageDetail(admissionFailure) };
  }

  lifecycle.transition("ADMISSION_CHECKED");

  if (admissionFailure) {
    const outcome = stageTaskOutcome(admissionFailure);
    return earlyReceipt(
      request,
      providerIdentity,
      lifecycle,
      outcome,
      { state: "FAIL", detail: admission.detail },
      admission.detail,
      "admission",
    );
  }

  if (admission.state !== "PASS") {
    const outcome =
      admission.state === "REFUSED_POLICY"
        ? "REFUSED_POLICY"
        : "FAILED_ADMISSION";
    return earlyReceipt(
      request,
      providerIdentity,
      lifecycle,
      outcome,
      { state: "FAIL", detail: admission.detail },
      admission.detail,
      "admission",
    );
  }
  const admissionReceipt: RuntimeAdmissionReceipt = {
    state: "PASS",
    detail: admission.detail,
  };

  lifecycle.transition("MATERIALIZING");
  let materialization: RuntimeMaterialization;
  try {
    materialization = await runBoundedStage(
      "materialization",
      deadline,
      request.limits.cancellationGraceMs,
      options.signal,
      async (context) =>
        normalizeMaterialization(await provider.materialize(request, context)),
    );
  } catch (error) {
    const failure =
      error instanceof RuntimeStageFailure
        ? error
        : new RuntimeStageFailure("materialization", "ERROR", true);
    return materializationFailureReceipt(
      provider,
      request,
      descriptor,
      lifecycle,
      admissionReceipt,
      failure,
    );
  }

  lifecycle.transition("READY");
  lifecycle.transition("RUNNING");

  let execution: RuntimeExecutionResult = {
    state: "FAIL",
    exit: emptyExit(),
    stdoutBytes: 0,
    stderrBytes: 0,
    detail: "execution was not exercised",
  };
  let collection: RuntimeCollectionResult = {
    state: "FAIL",
    artifacts: [],
    touchedPaths: [],
    detail: "artifact collection was not exercised",
  };
  let taskOutcome: RuntimeOutcomeState = "FAILED_EXECUTION";
  let taskStage: RuntimeStage | null = "execution";

  try {
    execution = await runBoundedStage(
      "execution",
      deadline,
      request.limits.cancellationGraceMs,
      options.signal,
      async (context) =>
        normalizeExecution(
          await provider.execute(materialization, request, context),
          request,
        ),
    );
  } catch (error) {
    const failure =
      error instanceof RuntimeStageFailure
        ? error
        : new RuntimeStageFailure("execution", "ERROR", true);
    execution = {
      state:
        failure.kind === "TIMED_OUT"
          ? "TIMED_OUT"
          : failure.kind === "CANCELLED"
            ? "CANCELLED"
            : "FAIL",
      exit:
        failure.kind === "TIMED_OUT"
          ? timeoutExit()
          : failure.kind === "CANCELLED"
            ? cancelledExit()
            : emptyExit(),
      stdoutBytes: 0,
      stderrBytes: 0,
      detail: stageDetail(failure),
    };
  }

  if (execution.state === "PASS") {
    lifecycle.transition("COLLECTING");
    try {
      collection = await runBoundedStage(
        "collection",
        deadline,
        request.limits.cancellationGraceMs,
        options.signal,
        async (context) =>
          normalizeCollection(
            await provider.collect(
              materialization,
              request,
              execution,
              context,
            ),
            request,
          ),
      );
      taskOutcome =
        collection.state === "PASS" ? "COMPLETED" : "FAILED_ARTIFACT";
      taskStage = collection.state === "PASS" ? null : "collection";
    } catch (error) {
      const failure =
        error instanceof RuntimeStageFailure
          ? error
          : new RuntimeStageFailure("collection", "ERROR", true);
      collection = {
        state: "FAIL",
        artifacts: [],
        touchedPaths: [],
        detail: stageDetail(failure),
      };
      taskOutcome = stageTaskOutcome(failure);
      taskStage = "collection";
    }
  } else if (execution.state === "CANCELLED") {
    taskOutcome = "CANCELLED";
    taskStage = "execution";
  } else if (execution.state === "TIMED_OUT") {
    taskOutcome = "TIMED_OUT";
    taskStage = "execution";
  } else {
    taskOutcome = "FAILED_EXECUTION";
    taskStage = "execution";
  }

  lifecycle.transition("CLEANING");
  let cleanup: RuntimeCleanupReceipt;
  try {
    cleanup = await runBoundedStage(
      "cleanup",
      cleanupDeadline(request),
      request.limits.cancellationGraceMs,
      undefined,
      async (context) =>
        normalizeCleanup(
          await provider.cleanup(
            materialization,
            request,
            taskOutcome,
            context,
          ),
          request,
          taskOutcome,
          true,
        ),
    );
  } catch (error) {
    const failure =
      error instanceof RuntimeStageFailure
        ? error
        : new RuntimeStageFailure("cleanup", "ERROR", true);
    cleanup = failedCleanup(stageDetail(failure), {
      timedOut: failure.kind === "TIMED_OUT",
      cancelled: failure.kind === "CANCELLED",
      residue: ["cleanup-state-uncertain"],
    });
  }

  const outcome: RuntimeOutcomeState =
    cleanup.state === "PASS" ? taskOutcome : "FAILED_CLEANUP";
  const terminalStage: RuntimeStage | null =
    outcome === "FAILED_CLEANUP" ? "cleanup" : taskStage;
  lifecycle.transition(outcome);
  validateRuntimeLifecycleTrace(lifecycle.trace);

  return sealReceipt(
    {
      schema: RUNTIME_RECEIPT_SCHEMA,
      requestId: request.requestId,
      requestDigest: runtimeRequestDigest(request),
      provider: providerIdentity,
      source: request.source,
      workspaceIdentity: materialization.workspaceIdentity,
      lifecycle: [...lifecycle.trace],
      admission: admissionReceipt,
      taskStage,
      terminalStage,
      taskOutcome,
      outcome,
      state: runtimeEvidenceForOutcome(outcome),
      exit: execution.exit,
      output: {
        stdoutBytes: execution.stdoutBytes,
        stderrBytes: execution.stderrBytes,
      },
      artifacts: collection.artifacts,
      touchedPaths: collection.touchedPaths,
      cleanup,
      exclusions: [...request.exclusions],
      detail: safeCombinedDetail([
        execution.detail,
        collection.detail,
        cleanup.detail,
      ]),
    },
    request,
  );
}

export async function dispatchRuntimeRequest(
  registry: RuntimeProviderRegistry,
  value: unknown,
  options: RuntimeRunOptions = {},
): Promise<RuntimeReceipt> {
  const request = deepFreeze(validateRuntimeRequest(value));
  const provider = registry.resolve(request.providerId, request.scope);
  if (provider) return runRuntimeProvider(provider, request, options);

  const lifecycle = new RuntimeLifecycle();
  lifecycle.transition("RESOLVED");
  return earlyReceipt(
    request,
    requestProviderIdentity(request),
    lifecycle,
    "ABSENT",
    unexercisedAdmission("provider is not registered"),
    "provider is not registered",
  );
}
