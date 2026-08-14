import { SealedTranscript } from "./sealed-transcript.ts";
import { REQUIRED_CONTEXT_FILES } from "./canary.ts";
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
} from "./types.ts";

export const TREE_DIGEST = "a".repeat(64);
export const CONTEXT_DIGEST = "b".repeat(64);
export const SKILL_DIGEST = "c".repeat(64);

// INT-CLAUDE-007. What the model said. The privacy control searches every serialized receipt
// for it, so a receipt that grows a transcript field turns the eval red rather than quiet.
export const PLANTED_OUTPUT = "planted-model-transcript-7a4e" as const;

// A deterministic stand-in for the carrier binary, its authentication, the model turn and the
// MCP transport. Nothing here launches a process or makes a call.
export class FakeCarrier implements CarrierTransport {
  present = true;
  authenticated = true;

  materializes = true;
  borrowedFromOwnerCheckout = false;
  treeDigestBefore = TREE_DIGEST;
  treeDigestAfter: string | null = null;

  freezesContext = true;
  contextFiles: string[] = [...REQUIRED_CONTEXT_FILES];
  contextDigest = CONTEXT_DIGEST;

  skills: ResolvedSkill[] = [
    { skillId: "runtime-delivery", canonicalSha256: SKILL_DIGEST, resolvedSha256: SKILL_DIGEST, resolvedFrom: "release-binding" },
  ];

  declaredEnvironmentKeys: string[] = ["PATH", "HOME"];
  reachableStatePaths: string[] = ["/w/workspace/.claude/state"];

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
      files: this.contextFiles.map((path, index) => ({ path, sha256: String(index + 1).repeat(64) })),
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
