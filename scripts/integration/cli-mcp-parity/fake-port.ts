import type { CliResult, ClosureSubject, ExecutionPort } from "./types.ts";

// Deterministic in-memory execution port. It materializes a fresh workspace id per call and
// records what it still holds, so a retained resource is visible rather than assumed absent.
export class FakeExecutionPort implements ExecutionPort {
  materializes = true;
  runs = true;
  cleans = true;
  leaks = 0;
  result: CliResult = {
    exitCode: 0,
    evidence: "PASS",
    outputBytes: 1_024,
    durationMs: 500,
    artifactSha256: "d".repeat(64),
    detail: "fixture CLI completed",
  };
  readonly materialized: string[] = [];
  readonly cleaned: string[] = [];
  readonly closures: ClosureSubject[] = [];
  readonly ran: Array<{ command: string; input: Record<string, string> }> = [];

  materialize(closure: ClosureSubject): string | null {
    if (!this.materializes) return null;
    this.closures.push(closure);
    const id = `ws-${this.materialized.length + 1}`;
    this.materialized.push(id);
    return id;
  }

  run(_workspaceId: string, command: string, input: Record<string, string>): CliResult | null {
    if (!this.runs) return null;
    this.ran.push({ command, input });
    return { ...this.result };
  }

  cleanup(workspaceId: string): boolean {
    if (!this.cleans) return false;
    this.cleaned.push(workspaceId);
    return true;
  }

  retainedResources(): number {
    return this.leaks;
  }
}
