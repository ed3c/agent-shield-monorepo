import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import type { SealedTranscript } from "./sealed-transcript.ts";

export const CARRIER_CANARY_RECEIPT_SCHEMA = "agent-shield/carrier-canary-receipt/v1" as const;

export type CanaryState =
  | "UNRESOLVED"
  | "RELEASE_PINNED"
  | "WORKSPACE_MATERIALIZED"
  | "CONTEXT_FROZEN"
  | "CLAUDE_ADAPTER_VERIFIED"
  | "CARRIER_AUTH_CHECKED"
  | "CANARY_RUNNING"
  | "RESULT_VALIDATED"
  | "RECEIPT_EMITTED"
  | "CLEANED"
  | "ABSENT_CLAUDE"
  | "NOT_AUTHENTICATED"
  | "CONTEXT_MISMATCH"
  | "SKILL_MISMATCH"
  | "MCP_MISMATCH"
  | "CANARY_FAILED"
  | "OUTPUT_INVALID"
  | "TIMED_OUT"
  | "FAILED_CLEANUP";

export type CanaryOutcome = Extract<CanaryState,
  | "CLEANED"
  | "ABSENT_CLAUDE"
  | "NOT_AUTHENTICATED"
  | "CONTEXT_MISMATCH"
  | "SKILL_MISMATCH"
  | "MCP_MISMATCH"
  | "CANARY_FAILED"
  | "OUTPUT_INVALID"
  | "TIMED_OUT"
  | "FAILED_CLEANUP">;

// INT-CODEX-009. The receipt surface has to permit a later parity comparison without either
// carrier proxying the other, so the carrier is a field on a shared schema rather than a
// separate schema per carrier. #71 emits the same shape with `carrier: "codex-cli"`, and a
// comparison of the two is then a comparison of like with like.
export type CarrierKind = "claude-code" | "codex-cli";

// INT-CLAUDE-001. The workspace is disposable and pinned. An owner checkout is a place where
// somebody is working; a materialized workspace is a place where nothing changes under the run.
export interface WorkspaceReport {
  materialized: boolean;
  // Set when the workspace is the owner's live checkout, or borrows from it. Either way the run
  // is measuring the machine rather than the release.
  borrowedFromOwnerCheckout: boolean;
  // Recorded before and after the turn. A difference means the workspace was not immutable, so
  // whatever the canary observed was not the pinned subject.
  treeDigestBefore: string;
  treeDigestAfter: string;
}

// INT-CLAUDE-002. The native passive-context files the carrier reads on its own, and the digest
// they were frozen at. Each is named, because "the context was right" is not checkable and
// "these five files hashed to this" is.
export interface ContextFile {
  path: string;
  sha256: string;
}

export interface ContextReport {
  files: ContextFile[];
  frozenDigest: string;
}

// INT-CLAUDE-003. A Skill the carrier resolved. `resolvedSha256` is what the carrier actually
// read; `canonicalSha256` is what the release says it should be. A local shadow or a forwarder
// shows up as a difference between them and as nothing else.
export interface ResolvedSkill {
  skillId: string;
  canonicalSha256: string;
  resolvedSha256: string;
  // Where the carrier found it. A project- or user-level copy shadowing the release binding is
  // the failure this field exists to make visible.
  resolvedFrom: "release-binding" | "project-shadow" | "user-shadow";
}

// INT-CLAUDE-005. A tool the carrier listed or called. Policy exposure is decided by the
// release, not by the carrier, so a tool the carrier offers that policy does not expose is a
// mismatch rather than a bonus.
export interface ObservedTool {
  tool: string;
  policyExposed: boolean;
  inputTyped: boolean;
  outputTyped: boolean;
}

// INT-CLAUDE-006. What actually ran. `mock` and `replay` exist so that refusing them is a rule
// with one place to live -- a canary that quietly accepted a recorded turn would report exactly
// the same receipt as one that made a real call.
export type TurnKind = "model" | "mock" | "replay";

export interface TurnReport {
  kind: TurnKind;
  completed: boolean;
  timedOut: boolean;
  toolCalls: ObservedTool[];
  exitCode: number;
  transcript: SealedTranscript;
}

// INT-CLAUDE-004. What the carrier was given. Anything here that belongs to another carrier, or
// that is a secret, is cross-carrier leakage.
export interface HostPolicyReport {
  declaredEnvironmentKeys: string[];
  // Session or state directories the carrier could reach. A path belonging to the other carrier
  // is the control INT-CLAUDE-004 names.
  reachableStatePaths: string[];
}

export interface CanaryCleanupAccount {
  workspaces: number;
  processes: number;
  leases: number;
}

// INT-CLAUDE-007. Exits, digests and an OK predicate. No model output, no credential, no host
// path -- there is no field here that can hold any of them.
export interface CarrierCanaryReceipt {
  schema: typeof CARRIER_CANARY_RECEIPT_SCHEMA;
  carrier: CarrierKind;
  subject: ReleaseSubject;
  lifecycle: CanaryState[];
  outcome: CanaryOutcome;
  contextDigest: string | null;
  skillCount: number;
  toolCallCount: number;
  turnKind: TurnKind | null;
  exitCode: number | null;
  cleanupCleared: boolean;
  detail: string;
}

// The carrier boundary. The Claude Code binary, its authentication, the model turn and the MCP
// transport live on the far side; workspace immutability, context freezing, Skill parity, host
// isolation, tool policy, turn admission, receipt privacy and cleanup are owned here.
//
// No member returns a transcript, a token or a host path as a value -- `TurnReport.transcript`
// is sealed, and the state paths are compared rather than published.
export interface CarrierTransport {
  probe(): { present: boolean; authenticated: boolean };
  materializeWorkspace(subject: ReleaseSubject): WorkspaceReport | null;
  freezeContext(): ContextReport | null;
  resolveSkills(): ResolvedSkill[];
  hostPolicy(): HostPolicyReport;
  listTools(): ObservedTool[];
  runTurn(): TurnReport | null;
  cleanupAccount(): CanaryCleanupAccount;
}
