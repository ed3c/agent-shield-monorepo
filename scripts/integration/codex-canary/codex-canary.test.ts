import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import {
  FakeCarrier,
  PLANTED_OUTPUT as CLAUDE_OUTPUT,
  canaryReceiptRefusal,
  contextRefusal,
  foreignMarkersFor,
  hostPolicyRefusal,
  requiredContextFilesFor,
  runCarrierCanary,
  type CarrierCanaryReceipt,
  type ContextReport,
  type HostPolicyReport,
  type ObservedTool,
  type ResolvedSkill,
} from "../claude-canary/index.ts";
import {
  CONTEXT_DIGEST,
  FakeCodexCarrier,
  PLANTED_OUTPUT,
  SKILL_DIGEST,
  codexCanaryState,
  runCodexCanary,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-CODEX ${message}`);
}

const SUBJECT: ReleaseSubject = {
  repository: "ed3c/agent-shield-monorepo",
  commit: "1".repeat(40),
  tree: "2".repeat(40),
  releaseId: "agent-shield-module-set@0.1.0",
  releaseDigest: "3".repeat(64),
};

function run(transport = new FakeCodexCarrier()): CarrierCanaryReceipt {
  return runCodexCanary({ subject: SUBJECT, transport }).receipt;
}

function policy(overrides: Partial<HostPolicyReport> = {}): HostPolicyReport {
  return { declaredEnvironmentKeys: ["PATH", "HOME"], reachableStatePaths: ["/w/workspace/.codex/sessions"], ...overrides };
}

function skill(overrides: Partial<ResolvedSkill> = {}): ResolvedSkill {
  return { skillId: "runtime-delivery", canonicalSha256: SKILL_DIGEST, resolvedSha256: SKILL_DIGEST, resolvedFrom: "release-binding", ...overrides };
}

function tool(overrides: Partial<ObservedTool> = {}): ObservedTool {
  return { tool: "agent-shield.status", policyExposed: true, inputTyped: true, outputTyped: true, ...overrides };
}

function context(overrides: Partial<ContextReport> = {}): ContextReport {
  return {
    files: [...requiredContextFilesFor("codex-cli")].map((path, index) => ({ path, sha256: String(index + 5).repeat(64) })),
    frozenDigest: CONTEXT_DIGEST,
    ...overrides,
  };
}

// INT-CODEX-002. The native context is Codex's, not Claude's. This is the whole reason the
// required list is derived from the carrier: the two share the repository-level files and differ
// in exactly one adapter file each.
function nativeContext(): void {
  const green = run();
  ok(green.outcome === "CLEANED", `a clean Codex canary reported ${green.outcome}`);
  ok(green.carrier === "codex-cli", `the receipt names ${green.carrier}`);

  ok(requiredContextFilesFor("codex-cli").includes(".codex/config.toml"), "the Codex context does not require its config");
  ok(requiredContextFilesFor("codex-cli").includes("CLAUDE.md") === false, "the Codex context requires the Claude adapter file");
  ok(requiredContextFilesFor("claude-code").includes("CLAUDE.md"), "the Claude context no longer requires its adapter file");
  ok(requiredContextFilesFor("claude-code").includes(".codex/config.toml") === false, "the Claude context requires the Codex config");
  for (const shared of ["AGENTS.md", "CONTEXT.md", "ARCHITECTURE.md"]) {
    ok(requiredContextFilesFor("codex-cli").includes(shared), `the Codex context does not require ${shared}`);
    ok(requiredContextFilesFor("claude-code").includes(shared), `the Claude context does not require ${shared}`);
  }

  ok(contextRefusal(context(), "codex-cli") === null, "a complete Codex context was refused");
  // The asymmetry has to bite in both directions, or the parameter is decoration.
  ok(contextRefusal(context(), "claude-code") !== null, "a Codex context satisfied the Claude requirement");

  for (const required of requiredContextFilesFor("codex-cli")) {
    const missing = context({ files: context().files.filter((file) => file.path !== required) });
    ok(contextRefusal(missing, "codex-cli") !== null, `a Codex context missing ${required} was admitted`);
  }

  // A Codex run against a Claude-shaped workspace: the config file the carrier reads is absent.
  const claudeShaped = new FakeCodexCarrier();
  claudeShaped.contextFiles = [...requiredContextFilesFor("claude-code")];
  ok(run(claudeShaped).outcome === "CONTEXT_MISMATCH", "a Claude-shaped context satisfied the Codex canary");
}

// INT-CODEX-004. Host isolation, mirrored. The rule is the shared one; what differs is which
// directory is foreign, and that is derived rather than restated.
function hostIsolation(): void {
  ok(hostPolicyRefusal(policy(), "codex-cli") === null, "a clean Codex host policy was refused");
  ok(hostPolicyRefusal(policy(), "claude-code") !== null, "Claude reaching the Codex session directory was admitted");
  ok(hostPolicyRefusal(policy({ reachableStatePaths: ["/w/workspace/.claude/state"] }), "codex-cli") !== null,
    "Codex reaching the Claude state directory was admitted");
  ok(foreignMarkersFor("codex-cli").includes(".claude"), "the Claude marker is not foreign to Codex");
  ok(foreignMarkersFor("codex-cli").includes(".codex") === false, "the Codex marker is foreign to Codex");

  for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CODEX_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]) {
    ok(hostPolicyRefusal(policy({ declaredEnvironmentKeys: ["PATH", key] }), "codex-cli") !== null, `${key} in the Codex environment was admitted`);
  }

  const leaked = new FakeCodexCarrier();
  leaked.reachableStatePaths = ["/w/workspace/.claude/state"];
  ok(run(leaked).outcome === "NOT_AUTHENTICATED", "a cross-carrier reachable path reached the Codex turn");
}

// INT-CODEX-001, 003, 005, 006, 008. The shared rules, exercised through the Codex adapter so
// that reuse is a claim this suite checks rather than one the README asserts.
function sharedRulesThroughCodex(): void {
  const cases: [string, (t: FakeCodexCarrier) => void, string][] = [
    ["an absent carrier", (t) => { t.present = false; }, "ABSENT_CLAUDE"],
    ["an unauthenticated carrier", (t) => { t.authenticated = false; }, "NOT_AUTHENTICATED"],
    ["a borrowed owner checkout", (t) => { t.borrowedFromOwnerCheckout = true; }, "CANARY_FAILED"],
    ["an unmaterialized workspace", (t) => { t.materializes = false; }, "CANARY_FAILED"],
    ["a workspace that changed", (t) => { t.treeDigestAfter = "9".repeat(64); }, "CONTEXT_MISMATCH"],
    ["an unfrozen context", (t) => { t.freezesContext = false; }, "CONTEXT_MISMATCH"],
    ["a shadowed Skill", (t) => { t.skills = [skill({ resolvedFrom: "user-shadow" })]; }, "SKILL_MISMATCH"],
    ["a drifted Skill", (t) => { t.skills = [skill({ resolvedSha256: "9".repeat(64) })]; }, "SKILL_MISMATCH"],
    ["an unexposed listed tool", (t) => { t.tools = [tool({ policyExposed: false })]; t.calledTools = [tool()]; }, "MCP_MISMATCH"],
    ["an unexposed called tool", (t) => { t.calledTools = [tool({ policyExposed: false })]; }, "MCP_MISMATCH"],
    ["a mock turn", (t) => { t.turnKind = "mock"; }, "OUTPUT_INVALID"],
    ["a replayed turn", (t) => { t.turnKind = "replay"; }, "OUTPUT_INVALID"],
    ["a turn with no tool call", (t) => { t.calledTools = []; }, "OUTPUT_INVALID"],
    ["a timed-out turn", (t) => { t.turnTimedOut = true; }, "TIMED_OUT"],
    ["a non-zero exit", (t) => { t.turnExitCode = 2; }, "CANARY_FAILED"],
    ["a turn that did not run", (t) => { t.runsTurn = false; }, "CANARY_FAILED"],
    ["a retained workspace", (t) => { t.retainedWorkspaces = 1; }, "FAILED_CLEANUP"],
    ["a retained process", (t) => { t.retainedProcesses = 1; }, "FAILED_CLEANUP"],
    ["a retained lease", (t) => { t.retainedLeases = 1; }, "FAILED_CLEANUP"],
  ];
  const seen = new Set<string>();
  for (const [label, mutate, expected] of cases) {
    const transport = new FakeCodexCarrier();
    mutate(transport);
    const receipt = run(transport);
    ok(receipt.outcome === expected, `${label} reported ${receipt.outcome}, expected ${expected}`);
    seen.add(receipt.outcome);
  }
  seen.add(run().outcome);
  ok(seen.size === 10, `the Codex fixtures cover ${seen.size} distinct outcomes, expected 10`);

  // A naming divergence worth recording in code rather than only in prose. #70 names the
  // absent-carrier terminal `ABSENT_CLAUDE` and the adapter stage `CLAUDE_ADAPTER_VERIFIED`;
  // #71 names them `ABSENT_CODEX`. One shared state machine cannot have both, and renaming
  // after #70 is open would invalidate its own contract -- so the Claude names stand and this
  // asserts that a Codex run really does report them, rather than leaving a reader to wonder
  // whether the shared machine was reused at all.
  const absent = new FakeCodexCarrier();
  absent.present = false;
  ok(run(absent).outcome === "ABSENT_CLAUDE", "the shared absent-carrier terminal changed name");
  ok(run().lifecycle.includes("CLAUDE_ADAPTER_VERIFIED"), "the shared adapter stage changed name");
}

// INT-CODEX-007 and INT-CODEX-009. Receipt privacy, and no carrier proxying the other.
function receiptSurface(): void {
  const receipt = run();
  const text = JSON.stringify(receipt);
  ok(text.includes(PLANTED_OUTPUT) === false, "the Codex receipt carried its model transcript");
  // The other carrier's canary too: a receipt that somehow carried Claude output would be a
  // cross-carrier leak rather than only a privacy failure.
  ok(text.includes(CLAUDE_OUTPUT) === false, "the Codex receipt carried the Claude transcript");
  ok(text.includes("assistant:") === false, "the Codex receipt carried transcript structure");
  ok(text.includes("/w/") === false, "the Codex receipt carried a host path");

  const expected = { carrier: "codex-cli" as const, subject: SUBJECT };
  ok(canaryReceiptRefusal(receipt, expected) === null, "a genuine Codex receipt was refused");
  // The comparison input INT-CODEX-009 asks for: the two receipts are the same shape and are
  // told apart by a checked field, so neither can stand in for the other.
  ok(canaryReceiptRefusal(receipt, { ...expected, carrier: "claude-code" }) !== null, "a Codex receipt satisfied a Claude expectation");

  const claudeReceipt = runCarrierCanary({ carrier: "claude-code", subject: SUBJECT, transport: new FakeCarrier() }).receipt;
  ok(canaryReceiptRefusal(claudeReceipt, expected) !== null, "a Claude receipt satisfied a Codex expectation");
  ok(claudeReceipt.schema === receipt.schema, "the two carriers emit different schemas, so no parity comparison is possible");
  ok(claudeReceipt.carrier !== receipt.carrier, "the two receipts are indistinguishable");
}

function evidenceBoundary(): void {
  ok(codexCanaryState.carrierReachability === "NOT_EXERCISED", "Codex reachability was claimed");
  ok(codexCanaryState.boundedModelTurn === "NOT_EXERCISED", "a bounded Codex turn was claimed");
  ok(codexCanaryState.mcpToolCall === "NOT_EXERCISED", "an MCP tool call was claimed");
  ok(codexCanaryState.claudeParity === "NOT_IMPLEMENTED", "Claude parity was claimed");
  ok(codexCanaryState.releasePromotion === "NOT_IMPLEMENTED", "a release promotion was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const codexNeverPasses: NeverPass<typeof codexCanaryState> = true;
void codexNeverPasses;

// The two carriers must plant different canaries, or a receipt carrying the *other* carrier's
// output would pass a scan that only knows its own. Written as a type-level assertion because
// tsc proves it: both are literal types, so an overlap is a compile error rather than a runtime
// check that could be deleted.
type Distinct<A extends string, B extends string> = A extends B ? never : true;
const canariesAreDistinct: Distinct<typeof PLANTED_OUTPUT, typeof CLAUDE_OUTPUT> = true;
void canariesAreDistinct;

nativeContext();
hostIsolation();
sharedRulesThroughCodex();
receiptSurface();
evidenceBoundary();

console.log("INT-CODEX GREEN: native context, host isolation, shared rules through the Codex adapter, receipt surface and carrier separation");
