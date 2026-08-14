import type { RuntimeOperationContext } from "../../spi/index.ts";
import type {
  OpenShellAuditPayload,
  OpenShellPolicyDecision,
  OpenShellProbeResult,
  OpenShellSessionCreateSpec,
  OpenShellSessionHandle,
  OpenShellTransport,
  OpenShellWorkflowExit,
  OpenShellWorkflowSpec,
} from "./types.ts";

export type FakeOpenShellCreateMode = "pass" | "throw-before-create" | "throw-after-create";
export type FakeOpenShellTerminateMode = "pass" | "throw" | "leave-session";

function assertActive(context: RuntimeOperationContext): void {
  if (context.signal.aborted) throw new Error(`fake OpenShell ${context.stage} operation was cancelled`);
  if (context.deadlineEpochMs <= 0 || context.cancellationGraceMs <= 0) {
    throw new Error("fake OpenShell operation context is incomplete");
  }
}

export class FakeOpenShellTransport implements OpenShellTransport {
  probeState: OpenShellProbeResult["state"] = "AVAILABLE";
  adapterVersion = "1.0.0";
  decisionState: OpenShellPolicyDecision["state"] = "ALLOW";
  decisionPolicyOverride: OpenShellPolicyDecision["policy"] | null = null;
  createMode: FakeOpenShellCreateMode = "pass";
  terminateMode: FakeOpenShellTerminateMode = "pass";
  exitCode = 0;
  exitSignal: string | null = null;
  auditBytes = new TextEncoder().encode('{"decision":"allow"}\n');
  auditPolicyOverride: OpenShellAuditPayload["policy"] | null = null;
  auditTouchedPaths = ["workspace/output/result.json"];

  readonly sessions = new Map<string, OpenShellSessionHandle>();
  readonly calls = {
    probe: 0,
    evaluatePolicy: 0,
    createSession: 0,
    runWorkflow: 0,
    collectAudit: 0,
    terminateSession: 0,
    sessionExists: 0,
    terminateByName: 0,
  };
  lastCreateSpec: OpenShellSessionCreateSpec | null = null;
  lastWorkflow: OpenShellWorkflowSpec | null = null;
  lastAuditLimit: number | null = null;

  async probe(context: RuntimeOperationContext): Promise<OpenShellProbeResult> {
    assertActive(context);
    this.calls.probe += 1;
    return {
      state: this.probeState,
      adapterVersion: this.probeState === "ABSENT" ? null : this.adapterVersion,
      detail: `fake OpenShell probe ${this.probeState}`,
    };
  }

  async evaluatePolicy(
    workflow: OpenShellWorkflowSpec,
    _source: Parameters<OpenShellTransport["evaluatePolicy"]>[1],
    context: RuntimeOperationContext,
  ): Promise<OpenShellPolicyDecision> {
    assertActive(context);
    this.calls.evaluatePolicy += 1;
    this.lastWorkflow = workflow;
    return {
      state: this.decisionState,
      policy: this.decisionPolicyOverride ?? { ...workflow.policy },
      reasonCodes: this.decisionState === "ALLOW" ? ["fixed-workflow"] : ["policy-deny"],
      detail: `fake OpenShell policy ${this.decisionState}`,
    };
  }

  async createSession(
    spec: OpenShellSessionCreateSpec,
    context: RuntimeOperationContext,
  ): Promise<OpenShellSessionHandle> {
    assertActive(context);
    this.calls.createSession += 1;
    this.lastCreateSpec = spec;
    if (this.createMode === "throw-before-create") throw new Error("fake OpenShell create failed before side effect");
    if (this.sessions.has(spec.name)) throw new Error("fake OpenShell session already exists");
    const handle = { name: spec.name, id: `fixture:${spec.name}` };
    this.sessions.set(spec.name, handle);
    if (this.createMode === "throw-after-create") throw new Error("fake OpenShell create failed after side effect");
    return handle;
  }

  async runWorkflow(
    handle: OpenShellSessionHandle,
    workflow: OpenShellWorkflowSpec,
    context: RuntimeOperationContext,
  ): Promise<OpenShellWorkflowExit> {
    assertActive(context);
    this.calls.runWorkflow += 1;
    this.lastWorkflow = workflow;
    if (!this.sessions.has(handle.name)) throw new Error("fake OpenShell session is absent");
    return { code: this.exitCode, signal: this.exitSignal };
  }

  async collectAudit(
    handle: OpenShellSessionHandle,
    workflow: OpenShellWorkflowSpec,
    maxBytes: number,
    context: RuntimeOperationContext,
  ): Promise<OpenShellAuditPayload> {
    assertActive(context);
    this.calls.collectAudit += 1;
    this.lastAuditLimit = maxBytes;
    if (!this.sessions.has(handle.name)) throw new Error("fake OpenShell session is absent");
    return {
      bytes: this.auditBytes,
      mediaType: "application/json",
      policy: this.auditPolicyOverride ?? { ...workflow.policy },
      touchedPaths: [...this.auditTouchedPaths],
    };
  }

  async terminateSession(handle: OpenShellSessionHandle, context: RuntimeOperationContext): Promise<void> {
    assertActive(context);
    this.calls.terminateSession += 1;
    if (this.terminateMode === "throw") throw new Error("fake OpenShell terminate failed");
    if (this.terminateMode === "leave-session") return;
    this.sessions.delete(handle.name);
  }

  async sessionExists(name: string, context: RuntimeOperationContext): Promise<boolean> {
    assertActive(context);
    this.calls.sessionExists += 1;
    return this.sessions.has(name);
  }

  async terminateByName(name: string, context: RuntimeOperationContext): Promise<void> {
    assertActive(context);
    this.calls.terminateByName += 1;
    if (this.terminateMode === "throw") throw new Error("fake OpenShell recovery terminate failed");
    if (this.terminateMode === "leave-session") return;
    this.sessions.delete(name);
  }
}
