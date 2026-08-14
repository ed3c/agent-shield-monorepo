import type {
  RuntimeArtifactRef,
  RuntimeCleanupReceipt,
  RuntimeOutcomeState,
  RuntimeProviderDescriptor,
  RuntimeRequest,
} from "../../../../packages/contracts/src/runtime/index.ts";
import type {
  RuntimeAdmissionResult,
  RuntimeCollectionResult,
  RuntimeExecutionResult,
  RuntimeMaterialization,
  RuntimeOperationContext,
  RuntimeProviderSpi,
} from "../spi/index.ts";

export class FixtureProvider implements RuntimeProviderSpi {
  readonly descriptor: RuntimeProviderDescriptor;
  admitCalled = 0;
  materializeCalled = 0;
  recoveryCleanupCalled = 0;
  executeCalled = 0;
  collectCalled = 0;
  cleanupCalled = 0;
  materializationMode: "PASS" | "THROW" = "PASS";
  executionState: RuntimeExecutionResult["state"] = "PASS";
  cleanupState: RuntimeCleanupReceipt["state"] = "PASS";
  recoveryCleanupState: RuntimeCleanupReceipt["state"] = "PASS";

  constructor(overrides: Partial<RuntimeProviderDescriptor> = {}) {
    this.descriptor = {
      id: "fixture-provider",
      version: "1.0.0",
      subject: { kind: "source", id: "fixture-provider", version: "1.0.0", sha256: "1".repeat(64) },
      environment: { kind: "profile", id: "fixture-runtime-profile", version: "1.0.0", sha256: "2".repeat(64) },
      scope: "local",
      capabilities: ["fixture.echo"],
      credentialBoundary: "none",
      implementation: "IMPLEMENTED",
      availability: "AVAILABLE",
      liveEvidence: "NOT_EXERCISED",
      ...overrides,
    };
  }

  async admit(_request: RuntimeRequest, _context: RuntimeOperationContext): Promise<RuntimeAdmissionResult> {
    this.admitCalled += 1;
    return { state: "PASS", detail: "fixture admitted" };
  }
  async materialize(_request: RuntimeRequest, _context: RuntimeOperationContext): Promise<RuntimeMaterialization> {
    this.materializeCalled += 1;
    if (this.materializationMode === "THROW") throw new Error("fixture materialization failed");
    return { workspaceIdentity: `fixture-workspace:sha256:${"c".repeat(64)}`, handle: {} };
  }
  async cleanupFailedMaterialization(
    _request: RuntimeRequest,
    _taskOutcome: "FAILED_MATERIALIZATION" | "CANCELLED" | "TIMED_OUT",
    _context: RuntimeOperationContext,
  ): Promise<RuntimeCleanupReceipt> {
    this.recoveryCleanupCalled += 1;
    return this.cleanupReceipt(this.recoveryCleanupState, "ABSENT", null, "fixture recovery cleanup");
  }
  async execute(_materialization: RuntimeMaterialization, _request: RuntimeRequest, _context: RuntimeOperationContext): Promise<RuntimeExecutionResult> {
    this.executeCalled += 1;
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
  async collect(_m: RuntimeMaterialization, _r: RuntimeRequest, _e: RuntimeExecutionResult, _c: RuntimeOperationContext): Promise<RuntimeCollectionResult> {
    this.collectCalled += 1;
    return {
      state: "PASS",
      artifacts: [{ kind: "log", sha256: "d".repeat(64), bytes: 5, mediaType: "text/plain" }],
      touchedPaths: ["workspace/output/result.txt"],
      detail: "fixture artifacts collected",
    };
  }
  async cleanup(_m: RuntimeMaterialization, request: RuntimeRequest, taskOutcome: RuntimeOutcomeState, _c: RuntimeOperationContext): Promise<RuntimeCleanupReceipt> {
    this.cleanupCalled += 1;
    if (request.cleanup.workspaceCleanup === "preserve-on-failure" && taskOutcome !== "COMPLETED" && this.cleanupState === "PASS") {
      const preservationRef: RuntimeArtifactRef = { kind: "workspace-snapshot", sha256: "e".repeat(64), bytes: 64, mediaType: "application/octet-stream" };
      return this.cleanupReceipt("PASS", "PRESERVED_BY_POLICY", preservationRef, "fixture workspace preserved");
    }
    return this.cleanupReceipt(this.cleanupState, this.cleanupState === "PASS" ? "DELETED" : "UNKNOWN", null, `fixture cleanup ${this.cleanupState}`);
  }
  private cleanupReceipt(
    state: RuntimeCleanupReceipt["state"],
    workspaceDisposition: RuntimeCleanupReceipt["workspaceDisposition"],
    preservationRef: RuntimeArtifactRef | null,
    detail: string,
  ): RuntimeCleanupReceipt {
    const exercised = state !== "NOT_EXERCISED";
    return {
      state,
      durationMs: exercised ? 1 : 0,
      processesChecked: exercised,
      workspaceChecked: exercised,
      sessionsChecked: exercised,
      workspaceDisposition: exercised ? workspaceDisposition : "ABSENT",
      preservationRef: exercised ? preservationRef : null,
      residue: state === "FAIL" ? ["fixture-residue"] : [],
      detail,
    };
  }
}
