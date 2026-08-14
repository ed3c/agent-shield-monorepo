import type {
  RuntimeArtifactRef,
  RuntimeCleanupReceipt,
  RuntimeExit,
  RuntimeOutcomeState,
  RuntimeProviderDescriptor,
  RuntimeRequest,
  RuntimeStage,
} from "../../../../packages/contracts/src/runtime/index.ts";

export interface RuntimeOperationContext {
  stage: RuntimeStage;
  signal: AbortSignal;
  startedAtEpochMs: number;
  deadlineEpochMs: number;
  cancellationGraceMs: number;
}

export interface RuntimeAdmissionResult {
  state: "PASS" | "FAIL" | "REFUSED_POLICY";
  detail: string;
}

export interface RuntimeMaterialization {
  workspaceIdentity: string;
  handle: unknown;
}

export interface RuntimeExecutionResult {
  state: "PASS" | "FAIL" | "CANCELLED" | "TIMED_OUT";
  exit: RuntimeExit;
  stdoutBytes: number;
  stderrBytes: number;
  detail: string;
}

export interface RuntimeCollectionResult {
  state: "PASS" | "FAIL";
  artifacts: RuntimeArtifactRef[];
  touchedPaths: string[];
  detail: string;
}

export interface RuntimeProviderSpi {
  readonly descriptor: RuntimeProviderDescriptor;
  admit(request: RuntimeRequest, context: RuntimeOperationContext): Promise<RuntimeAdmissionResult>;
  materialize(request: RuntimeRequest, context: RuntimeOperationContext): Promise<RuntimeMaterialization>;
  cleanupFailedMaterialization(
    request: RuntimeRequest,
    taskOutcome: Extract<RuntimeOutcomeState, "FAILED_MATERIALIZATION" | "CANCELLED" | "TIMED_OUT">,
    context: RuntimeOperationContext,
  ): Promise<RuntimeCleanupReceipt>;
  execute(
    materialization: RuntimeMaterialization,
    request: RuntimeRequest,
    context: RuntimeOperationContext,
  ): Promise<RuntimeExecutionResult>;
  collect(
    materialization: RuntimeMaterialization,
    request: RuntimeRequest,
    execution: RuntimeExecutionResult,
    context: RuntimeOperationContext,
  ): Promise<RuntimeCollectionResult>;
  cleanup(
    materialization: RuntimeMaterialization,
    request: RuntimeRequest,
    taskOutcome: RuntimeOutcomeState,
    context: RuntimeOperationContext,
  ): Promise<RuntimeCleanupReceipt>;
}

export interface RuntimeRunOptions {
  signal?: AbortSignal;
  now?: () => number;
}
