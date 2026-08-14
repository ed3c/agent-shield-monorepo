import { SealedTranscript } from "../claude-canary/index.ts";
import { requiredContextFilesFor } from "../claude-canary/index.ts";
import type {
  CanaryCleanupAccount,
  CarrierTransport,
  ContextReport,
  HostPolicyReport,
  ObservedTool,
  ResolvedSkill,
  TurnKind,
  TurnReport,
  WorkspaceReport,
} from "../claude-canary/index.ts";

export const TREE_DIGEST = "d".repeat(64);
export const CONTEXT_DIGEST = "e".repeat(64);
export const SKILL_DIGEST = "f".repeat(64);

// INT-CODEX-007. What the model said. Distinct from the Claude leaf's canary so a receipt that
// accidentally carried the *other* carrier's output would still be caught.
export const PLANTED_OUTPUT = "planted-codex-transcript-2b8f" as const;

// A deterministic stand-in for the Codex CLI, its authentication, the model turn and the MCP
// transport. Its defaults are Codex's: `.codex/config.toml` in the context, `.codex` state.
export class FakeCodexCarrier implements CarrierTransport {
  present = true;
  authenticated = true;

  materializes = true;
  borrowedFromOwnerCheckout = false;
  treeDigestBefore = TREE_DIGEST;
  treeDigestAfter: string | null = null;

  freezesContext = true;
  contextFiles: string[] = [...requiredContextFilesFor("codex-cli")];
  contextDigest = CONTEXT_DIGEST;

  skills: ResolvedSkill[] = [
    { skillId: "runtime-delivery", canonicalSha256: SKILL_DIGEST, resolvedSha256: SKILL_DIGEST, resolvedFrom: "release-binding" },
  ];

  declaredEnvironmentKeys: string[] = ["PATH", "HOME"];
  reachableStatePaths: string[] = ["/w/workspace/.codex/sessions"];

  tools: ObservedTool[] = [
    { tool: "agent-shield.status", policyExposed: true, inputTyped: true, outputTyped: true },
  ];

  runsTurn = true;
  turnKind: TurnKind = "model";
  turnCompleted = true;
  turnTimedOut = false;
  turnExitCode = 0;
  calledTools: ObservedTool[] | null = null;

  retainedWorkspaces = 0;
  retainedProcesses = 0;
  retainedLeases = 0;

  probe(): { present: boolean; authenticated: boolean } {
    return { present: this.present, authenticated: this.authenticated };
  }

  materializeWorkspace(): WorkspaceReport | null {
    if (!this.materializes) return null;
    return {
      materialized: true,
      borrowedFromOwnerCheckout: this.borrowedFromOwnerCheckout,
      treeDigestBefore: this.treeDigestBefore,
      treeDigestAfter: this.treeDigestAfter ?? this.treeDigestBefore,
    };
  }

  freezeContext(): ContextReport | null {
    if (!this.freezesContext) return null;
    return {
      files: this.contextFiles.map((path, index) => ({ path, sha256: String(index + 5).repeat(64) })),
      frozenDigest: this.contextDigest,
    };
  }

  resolveSkills(): ResolvedSkill[] {
    return this.skills;
  }

  hostPolicy(): HostPolicyReport {
    return {
      declaredEnvironmentKeys: this.declaredEnvironmentKeys,
      reachableStatePaths: this.reachableStatePaths,
    };
  }

  listTools(): ObservedTool[] {
    return this.tools;
  }

  runTurn(): TurnReport | null {
    if (!this.runsTurn) return null;
    return {
      kind: this.turnKind,
      completed: this.turnCompleted,
      timedOut: this.turnTimedOut,
      toolCalls: this.calledTools ?? this.tools,
      exitCode: this.turnExitCode,
      transcript: new SealedTranscript(`assistant: ${PLANTED_OUTPUT}`),
    };
  }

  cleanupAccount(): CanaryCleanupAccount {
    return {
      workspaces: this.retainedWorkspaces,
      processes: this.retainedProcesses,
      leases: this.retainedLeases,
    };
  }
}
