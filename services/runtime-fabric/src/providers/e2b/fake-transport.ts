import type { RuntimeOperationContext } from "../../spi/index.ts";
import type {
  E2bArtifactPayload,
  E2bProbeResult,
  E2bSandboxCreateSpec,
  E2bSandboxHandle,
  E2bTransport,
  E2bWorkflowExit,
  E2bWorkflowSpec,
} from "./types.ts";

export type FakeE2bCreateMode = "pass" | "throw-before-create" | "throw-after-create";
export type FakeE2bKillMode = "pass" | "throw" | "leave-sandbox";

function assertActive(context: RuntimeOperationContext): void {
  if (context.signal.aborted) throw new Error(`fake E2B ${context.stage} operation was cancelled`);
  if (context.deadlineEpochMs <= 0 || context.cancellationGraceMs <= 0) {
    throw new Error("fake E2B operation context is incomplete");
  }
}

export class FakeE2bTransport implements E2bTransport {
  probeState: E2bProbeResult["state"] = "AVAILABLE";
  adapterVersion = "1.0.0";
  createMode: FakeE2bCreateMode = "pass";
  killMode: FakeE2bKillMode = "pass";
  exitCode = 0;
  exitSignal: string | null = null;
  artifactBytes = new TextEncoder().encode("fixture E2B artifact\n");
  artifactMediaType = "application/octet-stream";
  artifactTouchedPaths = ["workspace/output/result.bin"];

  readonly sandboxes = new Map<string, E2bSandboxHandle>();
  readonly calls = {
    probe: 0,
    createSandbox: 0,
    runWorkflow: 0,
    collectArtifact: 0,
    killSandbox: 0,
    sandboxExists: 0,
    killByName: 0,
  };
  lastCreateSpec: E2bSandboxCreateSpec | null = null;
  lastWorkflow: E2bWorkflowSpec | null = null;
  lastArtifactLimit: number | null = null;

  async probe(context: RuntimeOperationContext): Promise<E2bProbeResult> {
    assertActive(context);
    this.calls.probe += 1;
    return {
      state: this.probeState,
      adapterVersion: this.probeState === "ABSENT" ? null : this.adapterVersion,
      detail: `fake E2B probe ${this.probeState}`,
    };
  }

  async createSandbox(spec: E2bSandboxCreateSpec, context: RuntimeOperationContext): Promise<E2bSandboxHandle> {
    assertActive(context);
    this.calls.createSandbox += 1;
    this.lastCreateSpec = spec;
    if (this.createMode === "throw-before-create") throw new Error("fake E2B create failed before side effect");
    if (this.sandboxes.has(spec.name)) throw new Error("fake E2B sandbox already exists");
    const handle = { name: spec.name, id: `fixture:${spec.name}` };
    this.sandboxes.set(spec.name, handle);
    if (this.createMode === "throw-after-create") throw new Error("fake E2B create failed after side effect");
    return handle;
  }

  async runWorkflow(
    handle: E2bSandboxHandle,
    workflow: E2bWorkflowSpec,
    context: RuntimeOperationContext,
  ): Promise<E2bWorkflowExit> {
    assertActive(context);
    this.calls.runWorkflow += 1;
    this.lastWorkflow = workflow;
    if (!this.sandboxes.has(handle.name)) throw new Error("fake E2B sandbox is absent");
    return { code: this.exitCode, signal: this.exitSignal };
  }

  async collectArtifact(
    handle: E2bSandboxHandle,
    _workflow: E2bWorkflowSpec,
    maxBytes: number,
    context: RuntimeOperationContext,
  ): Promise<E2bArtifactPayload> {
    assertActive(context);
    this.calls.collectArtifact += 1;
    this.lastArtifactLimit = maxBytes;
    if (!this.sandboxes.has(handle.name)) throw new Error("fake E2B sandbox is absent");
    return {
      bytes: this.artifactBytes,
      mediaType: this.artifactMediaType,
      touchedPaths: [...this.artifactTouchedPaths],
    };
  }

  async killSandbox(handle: E2bSandboxHandle, context: RuntimeOperationContext): Promise<void> {
    assertActive(context);
    this.calls.killSandbox += 1;
    if (this.killMode === "throw") throw new Error("fake E2B kill failed");
    if (this.killMode === "leave-sandbox") return;
    this.sandboxes.delete(handle.name);
  }

  async sandboxExists(name: string, context: RuntimeOperationContext): Promise<boolean> {
    assertActive(context);
    this.calls.sandboxExists += 1;
    return this.sandboxes.has(name);
  }

  async killByName(name: string, context: RuntimeOperationContext): Promise<void> {
    assertActive(context);
    this.calls.killByName += 1;
    if (this.killMode === "throw") throw new Error("fake E2B recovery kill failed");
    if (this.killMode === "leave-sandbox") return;
    this.sandboxes.delete(name);
  }
}
