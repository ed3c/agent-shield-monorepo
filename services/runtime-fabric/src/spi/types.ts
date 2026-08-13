import type {
  RuntimeArtifactRef,
  RuntimeCleanupReceipt,
  RuntimeExit,
  RuntimeProviderDescriptor,
  RuntimeRequest,
} from "../../../../packages/contracts/src/runtime/index.ts";

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
  admit(request: RuntimeRequest): Promise<RuntimeAdmissionResult>;
  materialize(request: RuntimeRequest): Promise<RuntimeMaterialization>;
  execute(materialization: RuntimeMaterialization, request: RuntimeRequest): Promise<RuntimeExecutionResult>;
  collect(
    materialization: RuntimeMaterialization,
    request: RuntimeRequest,
    execution: RuntimeExecutionResult,
  ): Promise<RuntimeCollectionResult>;
  cleanup(materialization: RuntimeMaterialization, request: RuntimeRequest): Promise<RuntimeCleanupReceipt>;
}
