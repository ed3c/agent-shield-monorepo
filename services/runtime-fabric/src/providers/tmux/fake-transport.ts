import type { RuntimeOperationContext } from "../../spi/index.ts";
import type {
  TmuxExitResult,
  TmuxProbeResult,
  TmuxTransport,
  TmuxWorkflowSpec,
} from "./types.ts";

export type FakeTmuxCreateMode = "pass" | "throw-before-create" | "throw-after-create";
export type FakeTmuxKillMode = "pass" | "throw" | "leave-session";

function assertActive(context: RuntimeOperationContext): void {
  if (context.signal.aborted) throw new Error(`fake tmux ${context.stage} operation was cancelled`);
  if (context.deadlineEpochMs <= 0 || context.cancellationGraceMs <= 0) {
    throw new Error("fake tmux operation context is incomplete");
  }
}

export class FakeTmuxTransport implements TmuxTransport {
  probeState: TmuxProbeResult["state"] = "AVAILABLE";
  version = "3.5a";
  exitCode = 0;
  exitSignal: string | null = null;
  transcript = "fixture tmux transcript\n";
  createMode: FakeTmuxCreateMode = "pass";
  killMode: FakeTmuxKillMode = "pass";

  readonly sessions = new Set<string>();
  readonly calls = {
    probe: 0,
    createSession: 0,
    waitForExit: 0,
    capture: 0,
    killSession: 0,
    sessionExists: 0,
  };
  lastSessionName: string | null = null;
  lastWorkflow: TmuxWorkflowSpec | null = null;
  lastCaptureLines: number | null = null;

  async probe(context: RuntimeOperationContext): Promise<TmuxProbeResult> {
    assertActive(context);
    this.calls.probe += 1;
    return {
      state: this.probeState,
      version: this.probeState === "ABSENT" ? null : this.version,
      detail: `fake tmux probe ${this.probeState}`,
    };
  }

  async createSession(
    sessionName: string,
    workflow: TmuxWorkflowSpec,
    context: RuntimeOperationContext,
  ): Promise<void> {
    assertActive(context);
    this.calls.createSession += 1;
    this.lastSessionName = sessionName;
    this.lastWorkflow = workflow;
    if (this.createMode === "throw-before-create") throw new Error("fake tmux create failed before session creation");
    if (this.sessions.has(sessionName)) throw new Error("fake tmux session already exists");
    this.sessions.add(sessionName);
    if (this.createMode === "throw-after-create") throw new Error("fake tmux create failed after session creation");
  }

  async waitForExit(sessionName: string, context: RuntimeOperationContext): Promise<TmuxExitResult> {
    assertActive(context);
    this.calls.waitForExit += 1;
    if (!this.sessions.has(sessionName)) throw new Error("fake tmux session is absent");
    return { code: this.exitCode, signal: this.exitSignal };
  }

  async capture(sessionName: string, maxLines: number, context: RuntimeOperationContext): Promise<string> {
    assertActive(context);
    this.calls.capture += 1;
    this.lastCaptureLines = maxLines;
    if (!this.sessions.has(sessionName)) throw new Error("fake tmux session is absent");
    return this.transcript;
  }

  async killSession(sessionName: string, context: RuntimeOperationContext): Promise<void> {
    assertActive(context);
    this.calls.killSession += 1;
    if (this.killMode === "throw") throw new Error("fake tmux kill failed");
    if (this.killMode === "leave-session") return;
    this.sessions.delete(sessionName);
  }

  async sessionExists(sessionName: string, context: RuntimeOperationContext): Promise<boolean> {
    assertActive(context);
    this.calls.sessionExists += 1;
    return this.sessions.has(sessionName);
  }
}
