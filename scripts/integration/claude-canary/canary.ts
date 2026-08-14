import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import { validateCanaryLifecycle } from "./state-machine.ts";
import {
  CARRIER_CANARY_RECEIPT_SCHEMA,
  type CanaryState,
  type CarrierCanaryReceipt,
  type CarrierKind,
  type CarrierTransport,
  type ContextReport,
  type HostPolicyReport,
  type ObservedTool,
  type ResolvedSkill,
  type TurnReport,
} from "./types.ts";

const GIT_OID = /^[a-f0-9]{40}$/;
const SHA_256 = /^[a-f0-9]{64}$/;

// INT-CLAUDE-002. The passive-context files this carrier reads on its own. Named rather than
// discovered, because "the carrier found what it needed" is not a claim anyone can check and
// "these four files were present and hashed to this" is.
export const REQUIRED_CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md", "ARCHITECTURE.md"] as const;

// INT-CLAUDE-004. State belonging to the other carrier. A path under either of these means the
// two carriers can see each other's sessions, which is the cross-carrier leak the control names.
const FOREIGN_STATE_MARKERS = [".codex", ".claude", ".config/codex", ".config/claude"] as const;

// Environment names that carry a secret or another carrier's session.
const FORBIDDEN_ENVIRONMENT_KEYS = [
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN",
  "CODEX_API_KEY", "GITHUB_TOKEN", "FORGEJO_TOKEN",
];

export function fail(message: string): never {
  throw new Error(`invalid canary contract: ${message}`);
}

// INT-CLAUDE-004. Which foreign-state markers this carrier must not be able to reach. A carrier
// legitimately reaches its *own* state directory, so the check is asymmetric and the asymmetry
// is derived from the carrier rather than hardcoded per leaf.
export function foreignMarkersFor(carrier: CarrierKind): readonly string[] {
  const own = carrier === "claude-code" ? [".claude", ".config/claude"] : [".codex", ".config/codex"];
  return FOREIGN_STATE_MARKERS.filter((marker) => !own.includes(marker));
}

export function hostPolicyRefusal(policy: HostPolicyReport, carrier: CarrierKind): string | null {
  for (const key of policy.declaredEnvironmentKeys) {
    if (FORBIDDEN_ENVIRONMENT_KEYS.includes(key)) return `the declared environment carries ${key}`;
  }
  const foreign = foreignMarkersFor(carrier);
  for (const path of policy.reachableStatePaths) {
    for (const marker of foreign) {
      if (path.includes(marker)) return `the carrier can reach ${marker}, which belongs to another carrier`;
    }
  }
  return null;
}

// INT-CLAUDE-002. Every required file present, content-addressed, and the whole set frozen to
// one digest so a later stage can prove nothing moved.
export function contextRefusal(report: ContextReport): string | null {
  if (!SHA_256.test(report.frozenDigest)) return "the frozen context digest is not content-addressed";
  const present = report.files.map((file) => file.path);
  for (const required of REQUIRED_CONTEXT_FILES) {
    if (!present.includes(required)) return `the materialized context is missing ${required}`;
  }
  for (const file of report.files) {
    if (!SHA_256.test(file.sha256)) return `${file.path} is not content-addressed`;
  }
  if (new Set(present).size !== present.length) return "the context reports a file twice";
  return null;
}

// INT-CLAUDE-003. What the carrier read has to be what the release binds. A shadow copy and a
// forwarder both show up here as a resolved digest that is not the canonical one.
export function skillRefusal(skills: readonly ResolvedSkill[]): string | null {
  if (skills.length === 0) return "the carrier resolved no Skills";
  for (const skill of skills) {
    if (!SHA_256.test(skill.canonicalSha256)) return `${skill.skillId} has no canonical digest`;
    if (skill.resolvedSha256 !== skill.canonicalSha256) return `${skill.skillId} resolved to bytes the release does not bind`;
    // Even byte-identical, a project or user copy is a second canonical source that will drift.
    if (skill.resolvedFrom !== "release-binding") return `${skill.skillId} resolved from a ${skill.resolvedFrom}`;
  }
  return null;
}

// INT-CLAUDE-005. Policy decides what is exposed; the carrier only reports what it saw.
export function toolRefusal(tools: readonly ObservedTool[]): string | null {
  if (tools.length === 0) return "the carrier listed no tools";
  for (const tool of tools) {
    if (!tool.policyExposed) return `${tool.tool} is listed but policy does not expose it`;
    if (!tool.inputTyped) return `${tool.tool} has an untyped input`;
    if (!tool.outputTyped) return `${tool.tool} has an untyped output`;
  }
  return null;
}

interface Cleanup {
  cleared: boolean;
  detail: string;
}

function cleanup(transport: CarrierTransport): Cleanup {
  const account = transport.cleanupAccount();
  const leaks = [
    ["workspaces", account.workspaces],
    ["processes", account.processes],
    ["leases", account.leases],
  ] as const;
  const retained = leaks.filter(([, count]) => count > 0);
  if (retained.length === 0) return { cleared: true, detail: "no workspace, process or lease was retained" };
  return { cleared: false, detail: `the run retained ${retained.map(([n, c]) => `${c} ${n}`).join(", ")}` };
}

export interface CanaryRequest {
  carrier: CarrierKind;
  subject: ReleaseSubject;
  transport: CarrierTransport;
}

function receipt(
  request: CanaryRequest,
  lifecycle: CanaryState[],
  detail: string,
  parts: {
    contextDigest?: string | null;
    skillCount?: number;
    toolCallCount?: number;
    turn?: TurnReport | null;
  },
  cleanupCleared: boolean,
): CarrierCanaryReceipt {
  return {
    schema: CARRIER_CANARY_RECEIPT_SCHEMA,
    carrier: request.carrier,
    subject: request.subject,
    lifecycle,
    outcome: validateCanaryLifecycle(lifecycle),
    contextDigest: parts.contextDigest ?? null,
    skillCount: parts.skillCount ?? 0,
    toolCallCount: parts.toolCallCount ?? 0,
    turnKind: parts.turn?.kind ?? null,
    exitCode: parts.turn?.exitCode ?? null,
    cleanupCleared,
    detail,
  };
}

// UNRESOLVED → RELEASE_PINNED → WORKSPACE_MATERIALIZED → CONTEXT_FROZEN
//           → CLAUDE_ADAPTER_VERIFIED → CARRIER_AUTH_CHECKED → CANARY_RUNNING
//           → RESULT_VALIDATED → RECEIPT_EMITTED → CLEANED
export function runCarrierCanary(request: CanaryRequest): { receipt: CarrierCanaryReceipt } {
  const { subject, transport } = request;
  if (!GIT_OID.test(subject.commit)) fail("the release commit is not a full object identifier");
  if (!GIT_OID.test(subject.tree)) fail("the release tree is not a full object identifier");
  if (!SHA_256.test(subject.releaseDigest)) fail("the release digest is not content-addressed");

  const lifecycle: CanaryState[] = ["UNRESOLVED"];
  let contextDigest: string | null = null;
  let skillCount = 0;
  let turn: TurnReport | null = null;
  const done = (detail: string): { receipt: CarrierCanaryReceipt } => {
    const cleared = cleanup(transport);
    return {
      receipt: receipt(request, lifecycle, detail, {
        contextDigest,
        skillCount,
        toolCallCount: turn?.toolCalls.length ?? 0,
        turn,
      }, cleared.cleared),
    };
  };

  const probe = transport.probe();
  if (!probe.present) {
    lifecycle.push("ABSENT_CLAUDE");
    return done("the carrier is not installed on this host");
  }
  if (!probe.authenticated) {
    lifecycle.push("NOT_AUTHENTICATED");
    return done("the carrier is present and not authenticated");
  }
  lifecycle.push("RELEASE_PINNED");

  // INT-CLAUDE-001. A disposable workspace materialized from the pinned release. Borrowing the
  // owner's live checkout would measure the machine rather than the release.
  const workspace = transport.materializeWorkspace(subject);
  if (workspace === null || !workspace.materialized) {
    lifecycle.push("CANARY_FAILED");
    return done("the disposable workspace was not materialized");
  }
  if (workspace.borrowedFromOwnerCheckout) {
    lifecycle.push("CANARY_FAILED");
    return done("the workspace borrowed the owner live checkout");
  }
  lifecycle.push("WORKSPACE_MATERIALIZED");

  const context = transport.freezeContext();
  if (context === null) {
    lifecycle.push("CONTEXT_MISMATCH");
    return done("the native context could not be frozen");
  }
  const contextRefused = contextRefusal(context);
  if (contextRefused !== null) {
    lifecycle.push("CONTEXT_MISMATCH");
    return done(contextRefused);
  }
  contextDigest = context.frozenDigest;
  lifecycle.push("CONTEXT_FROZEN");

  const skills = transport.resolveSkills();
  skillCount = skills.length;
  const skillRefused = skillRefusal(skills);
  if (skillRefused !== null) {
    lifecycle.push("SKILL_MISMATCH");
    return done(skillRefused);
  }
  lifecycle.push("CLAUDE_ADAPTER_VERIFIED");

  // INT-CLAUDE-004. Host isolation is checked before the turn: a carrier that can reach the
  // other one's session directory has already been given it, whatever the turn later does.
  const policyRefused = hostPolicyRefusal(transport.hostPolicy(), request.carrier);
  if (policyRefused !== null) {
    lifecycle.push("NOT_AUTHENTICATED");
    return done(policyRefused);
  }

  const listedRefused = toolRefusal(transport.listTools());
  if (listedRefused !== null) {
    lifecycle.push("MCP_MISMATCH");
    return done(listedRefused);
  }
  lifecycle.push("CARRIER_AUTH_CHECKED", "CANARY_RUNNING");

  turn = transport.runTurn();
  if (turn === null) {
    lifecycle.push("CANARY_FAILED");
    return done("the carrier turn did not run");
  }
  // INT-CLAUDE-006. A mock or a replayed turn produces the same receipt as a real one unless it
  // is refused here. `package presence remains NOT_EXERCISED` is exactly this: the carrier being
  // installed and configured proves nothing about a call.
  if (turn.kind !== "model") {
    lifecycle.push("OUTPUT_INVALID");
    return done(`the turn was a ${turn.kind} rather than a model call`);
  }
  if (turn.timedOut) {
    lifecycle.push("TIMED_OUT");
    return done("the carrier turn exceeded its bound");
  }
  if (!turn.completed || turn.exitCode !== 0) {
    lifecycle.push("CANARY_FAILED");
    return done(`the carrier turn exited ${turn.exitCode}`);
  }
  // A turn that made no tool call did not exercise the surface this canary exists to exercise.
  if (turn.toolCalls.length === 0) {
    lifecycle.push("OUTPUT_INVALID");
    return done("the turn completed without calling a tool");
  }
  const calledRefused = toolRefusal(turn.toolCalls);
  if (calledRefused !== null) {
    lifecycle.push("MCP_MISMATCH");
    return done(calledRefused);
  }
  lifecycle.push("RESULT_VALIDATED");

  // INT-CLAUDE-001, again and deliberately. The workspace is re-read after the turn: a run that
  // mutated what it was measuring has invalidated its own observation, and checking only before
  // would never see it.
  if (workspace.treeDigestAfter !== workspace.treeDigestBefore) {
    lifecycle.push("CONTEXT_MISMATCH");
    return done("the workspace changed during the turn");
  }
  lifecycle.push("RECEIPT_EMITTED");

  const cleared = cleanup(transport);
  if (!cleared.cleared) {
    lifecycle.push("FAILED_CLEANUP");
    return {
      receipt: receipt(request, lifecycle, cleared.detail, {
        contextDigest, skillCount, toolCallCount: turn.toolCalls.length, turn,
      }, false),
    };
  }
  lifecycle.push("CLEANED");
  return done("the carrier reached the released consumer surface");
}

// A receipt is checkable by a party that did not produce it.
export function canaryReceiptRefusal(
  value: CarrierCanaryReceipt,
  expected: { carrier: CarrierKind; subject: ReleaseSubject },
): string | null {
  if (value.schema !== CARRIER_CANARY_RECEIPT_SCHEMA) return "the receipt carries another schema";
  // INT-CODEX-009. One carrier can never stand in for the other, so the carrier is checked
  // rather than assumed from which verifier produced the receipt.
  if (value.carrier !== expected.carrier) return `the receipt describes ${value.carrier}`;
  if (value.subject.commit !== expected.subject.commit) return "the receipt names another commit";
  if (value.subject.releaseId !== expected.subject.releaseId) return "the receipt names another release";
  if (value.outcome !== "CLEANED") return `the receipt reports ${value.outcome}`;
  if (value.turnKind !== "model") return `the receipt reports a ${value.turnKind} turn`;
  if (value.exitCode !== 0) return `the receipt reports exit ${value.exitCode}`;
  if (value.toolCallCount === 0) return "the receipt reports no tool call";
  if (value.contextDigest === null) return "the receipt reports no frozen context";
  if (!value.cleanupCleared) return "the receipt reports retained resources";
  return null;
}

export const claudeCanaryState = {
  carrierReachability: "NOT_EXERCISED",
  boundedModelTurn: "NOT_EXERCISED",
  mcpToolCall: "NOT_EXERCISED",
  codexParity: "NOT_IMPLEMENTED",
  releasePromotion: "NOT_IMPLEMENTED",
} as const;
