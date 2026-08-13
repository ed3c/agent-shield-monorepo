import type {
  RuntimeCleanupReceipt,
  RuntimeProviderDescriptor,
  RuntimeRequest,
} from "../../../../packages/contracts/src/runtime/index.ts";
import type {
  RuntimeAdmissionResult,
  RuntimeCollectionResult,
  RuntimeExecutionResult,
  RuntimeMaterialization,
  RuntimeProviderSpi,
} from "../spi/index.ts";

export class FixtureProvider implements RuntimeProviderSpi {
  readonly descriptor: RuntimeProviderDescriptor;
  cleanupCalled = false;
  executionState: RuntimeExecutionResult["state"] = "PASS";
  cleanupState: RuntimeCleanupReceipt["state"] = "PASS";

  constructor(overrides: Partial<RuntimeProviderDescriptor> = {}) {
    this.descriptor = {
      id: "fixture-provider",
      version: "1.0.0",
      scope: "local",
      capabilities: ["fixture.echo"],
      credentialBoundary: "none",
      implementation: "IMPLEMENTED",
      availability: "AVAILABLE",
      liveEvidence: "NOT_EXERCISED",
      ...overrides,
    };
  }

  async admit(_request: RuntimeRequest): Promise<RuntimeAdmissionResult> {
    return { state: "PASS", detail: "fixture admitted" };
  }

  async materialize(_request: RuntimeRequest): Promise<RuntimeMaterialization> {
    return { workspaceIdentity: `fixture-workspace:sha256:${"c".repeat(64)}`, handle: {} };
  }

  async execute(_materialization: RuntimeMaterialization, _request: RuntimeRequest): Promise<RuntimeExecutionResult> {
    return {
      state: this.executionState,
      exit: {
        code: this.executionState === "PASS" ? 0 : this.executionState === "FAIL" ? 1 : null,
        signal: null,
        timedOut: this.executionState === "TIMED_OUT",
        cancelled: this.executionState === "CANCELLED",
      },
      stdoutBytes: 5,
      stderrBytes: 0,
      detail: `fixture execution ${this.executionState}`,
    };
  }

  async collect(
    _materialization: RuntimeMaterialization,
    _request: RuntimeRequest,
    _execution: RuntimeExecutionResult,
  ): Promise<RuntimeCollectionResult> {
    return {
      state: "PASS",
      artifacts: [{ kind: "log", sha256: "d".repeat(64), bytes: 5, mediaType: "text/plain" }],
      touchedPaths: ["workspace/output/result.txt"],
      detail: "fixture artifacts collected",
    };
  }

  async cleanup(_materialization: RuntimeMaterialization, _request: RuntimeRequest): Promise<RuntimeCleanupReceipt> {
    this.cleanupCalled = true;
    const exercised = this.cleanupState !== "NOT_EXERCISED";
    return {
      state: this.cleanupState,
      durationMs: exercised ? 1 : 0,
      processesChecked: exercised,
      workspaceChecked: exercised,
      sessionsChecked: exercised,
      residue: this.cleanupState === "FAIL" ? ["fixture-residue"] : [],
      detail: `fixture cleanup ${this.cleanupState}`,
    };
  }
}
