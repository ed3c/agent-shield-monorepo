import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import {
  CONTEXT_DIGEST,
  FakeCarrier,
  PLANTED_OUTPUT,
  REDACTED,
  REQUIRED_CONTEXT_FILES,
  SKILL_DIGEST,
  SealedTranscript,
  TREE_DIGEST,
  assertCanaryTransition,
  canaryReceiptRefusal,
  claudeCanaryState,
  contextRefusal,
  foreignMarkersFor,
  hostPolicyRefusal,
  isCanaryOutcome,
  runCarrierCanary,
  skillRefusal,
  toolRefusal,
  validateCanaryLifecycle,
  type CanaryOutcome,
  type CarrierCanaryReceipt,
  type ContextReport,
  type HostPolicyReport,
  type ObservedTool,
  type ResolvedSkill,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-CLAUDE ${message}`);
}

function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid canary contract: "), `${message} threw "${text}" rather than a canary contract error`);
}

const SUBJECT: ReleaseSubject = {
  repository: "ed3c/agent-shield-monorepo",
  commit: "1".repeat(40),
  tree: "2".repeat(40),
  releaseId: "agent-shield-module-set@0.1.0",
  releaseDigest: "3".repeat(64),
};

function run(transport = new FakeCarrier()): CarrierCanaryReceipt {
  return runCarrierCanary({ carrier: "claude-code", subject: SUBJECT, transport }).receipt;
}

function context(overrides: Partial<ContextReport> = {}): ContextReport {
  return {
    files: [...REQUIRED_CONTEXT_FILES].map((path, index) => ({ path, sha256: String(index + 1).repeat(64) })),
    frozenDigest: CONTEXT_DIGEST,
    ...overrides,
  };
}

function policy(overrides: Partial<HostPolicyReport> = {}): HostPolicyReport {
  return { declaredEnvironmentKeys: ["PATH", "HOME"], reachableStatePaths: ["/w/workspace/.claude/state"], ...overrides };
}

function skill(overrides: Partial<ResolvedSkill> = {}): ResolvedSkill {
  return { skillId: "runtime-delivery", canonicalSha256: SKILL_DIGEST, resolvedSha256: SKILL_DIGEST, resolvedFrom: "release-binding", ...overrides };
}

function tool(overrides: Partial<ObservedTool> = {}): ObservedTool {
  return { tool: "agent-shield.status", policyExposed: true, inputTyped: true, outputTyped: true, ...overrides };
}

// INT-CLAUDE-001. An immutable workspace, checked before and after.
function immutableWorkspace(): void {
  const green = run();
  ok(green.outcome === "CLEANED", `a clean canary reported ${green.outcome}`);

  const borrowed = new FakeCarrier();
  borrowed.borrowedFromOwnerCheckout = true;
  ok(run(borrowed).outcome === "CANARY_FAILED", "a workspace borrowing the owner checkout was admitted");

  const unmaterialized = new FakeCarrier();
  unmaterialized.materializes = false;
  ok(run(unmaterialized).outcome === "CANARY_FAILED", "an unmaterialized workspace was admitted");

  // The control the issue names: mutate the owner checkout during the canary. Checking only
  // before the turn would never see it, which is why the digest is re-read afterwards.
  const mutated = new FakeCarrier();
  mutated.treeDigestAfter = "9".repeat(64);
  const drifted = run(mutated);
  ok(drifted.outcome === "CONTEXT_MISMATCH", `a workspace that changed reported ${drifted.outcome}`);
  ok(drifted.lifecycle.includes("RESULT_VALIDATED"), "the drift was caught before the turn was validated");

  red(() => runCarrierCanary({ carrier: "claude-code", subject: { ...SUBJECT, commit: "short" }, transport: new FakeCarrier() }), "an abbreviated release commit");
  red(() => runCarrierCanary({ carrier: "claude-code", subject: { ...SUBJECT, tree: "short" }, transport: new FakeCarrier() }), "an abbreviated release tree");
  red(() => runCarrierCanary({ carrier: "claude-code", subject: { ...SUBJECT, releaseDigest: "short" }, transport: new FakeCarrier() }), "an unaddressed release digest");
}

// INT-CLAUDE-002. Native context, materialized and frozen.
function nativeContext(): void {
  ok(contextRefusal(context()) === null, "a complete context was refused");

  for (const required of REQUIRED_CONTEXT_FILES) {
    const missing = context({ files: context().files.filter((file) => file.path !== required) });
    ok(contextRefusal(missing) !== null, `a context missing ${required} was admitted`);
  }
  ok(contextRefusal(context({ frozenDigest: "short" })) !== null, "an unaddressed frozen digest was admitted");
  ok(contextRefusal(context({ files: [{ path: "AGENTS.md", sha256: "short" }, ...context().files.slice(1)] })) !== null, "an unaddressed context file was admitted");
  ok(contextRefusal(context({ files: [...context().files, { path: "AGENTS.md", sha256: "4".repeat(64) }] })) !== null, "a duplicated context file was admitted");

  const unfrozen = new FakeCarrier();
  unfrozen.freezesContext = false;
  ok(run(unfrozen).outcome === "CONTEXT_MISMATCH", "an unfrozen context was admitted");

  const incomplete = new FakeCarrier();
  incomplete.contextFiles = ["AGENTS.md"];
  ok(run(incomplete).outcome === "CONTEXT_MISMATCH", "an incomplete context reached the adapter check");

  ok(run().contextDigest === CONTEXT_DIGEST, "the receipt lost the frozen context digest");
}

// INT-CLAUDE-003. Skill parity.
function skillParity(): void {
  ok(skillRefusal([skill()]) === null, "a release-bound Skill was refused");
  ok(skillRefusal([]) !== null, "a carrier resolving no Skills was admitted");
  ok(skillRefusal([skill({ resolvedSha256: "9".repeat(64) })]) !== null, "a Skill resolving to other bytes was admitted");
  // Both digests malformed, so the "resolved differs from canonical" rule cannot claim this
  // fixture and only the shape rule can fire -- which the plant check needed.
  ok(skillRefusal([skill({ canonicalSha256: "short", resolvedSha256: "short" })]) !== null, "a Skill with no canonical digest was admitted");

  // Even byte-identical, a project or user copy is a second canonical source that will drift.
  for (const from of ["project-shadow", "user-shadow"] as const) {
    ok(skillRefusal([skill({ resolvedFrom: from })]) !== null, `a Skill resolved from a ${from} was admitted`);
  }

  const shadowed = new FakeCarrier();
  shadowed.skills = [skill({ resolvedFrom: "project-shadow" })];
  ok(run(shadowed).outcome === "SKILL_MISMATCH", "a shadowed Skill reached the authorization check");
  ok(run().skillCount === 1, "the receipt lost the resolved Skill count");
}

// INT-CLAUDE-004. Host isolation, and the asymmetry that makes it checkable.
function hostIsolation(): void {
  ok(hostPolicyRefusal(policy(), "claude-code") === null, "a clean host policy was refused");

  for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "CODEX_API_KEY", "GITHUB_TOKEN", "FORGEJO_TOKEN"]) {
    ok(hostPolicyRefusal(policy({ declaredEnvironmentKeys: ["PATH", key] }), "claude-code") !== null, `${key} in the declared environment was admitted`);
  }

  // The asymmetry: a carrier legitimately reaches its own state directory and never the other's.
  // Deriving the foreign set from the carrier is what lets #71 reuse this rule unchanged.
  ok(foreignMarkersFor("claude-code").includes(".codex"), "the Codex marker is not foreign to Claude");
  ok(foreignMarkersFor("claude-code").includes(".claude") === false, "the Claude marker is foreign to Claude");
  ok(foreignMarkersFor("codex-cli").includes(".claude"), "the Claude marker is not foreign to Codex");
  ok(foreignMarkersFor("codex-cli").includes(".codex") === false, "the Codex marker is foreign to Codex");

  ok(hostPolicyRefusal(policy({ reachableStatePaths: ["/w/workspace/.codex/sessions"] }), "claude-code") !== null,
    "Claude reaching the Codex session directory was admitted");
  ok(hostPolicyRefusal(policy({ reachableStatePaths: ["/w/workspace/.claude/state"] }), "codex-cli") !== null,
    "Codex reaching the Claude state directory was admitted");
  // And the same path is fine for its own carrier, so the rule is not simply "no dotfiles".
  ok(hostPolicyRefusal(policy({ reachableStatePaths: ["/w/workspace/.claude/state"] }), "claude-code") === null,
    "Claude reaching its own state directory was refused");

  const leaked = new FakeCarrier();
  leaked.reachableStatePaths = ["/w/workspace/.codex/sessions"];
  ok(run(leaked).outcome === "NOT_AUTHENTICATED", "a cross-carrier reachable path reached the turn");
}

// INT-CLAUDE-005. Policy decides exposure; the carrier only reports.
function mcpParity(): void {
  ok(toolRefusal([tool()]) === null, "a policy-exposed typed tool was refused");
  ok(toolRefusal([]) !== null, "a carrier listing no tools was admitted");
  ok(toolRefusal([tool({ policyExposed: false })]) !== null, "a tool policy does not expose was admitted");
  ok(toolRefusal([tool({ inputTyped: false })]) !== null, "an untyped input was admitted");
  ok(toolRefusal([tool({ outputTyped: false })]) !== null, "an untyped output was admitted");

  // A bad *listing* with an acceptable called set. The fake defaults `calledTools` to `tools`,
  // so without pinning the called set separately the called-tool rule was catching this
  // fixture and the listing rule was dead -- which the plant check found.
  const hidden = new FakeCarrier();
  hidden.tools = [tool({ policyExposed: false })];
  hidden.calledTools = [tool()];
  const hiddenReceipt = run(hidden);
  ok(hiddenReceipt.outcome === "MCP_MISMATCH", `a hidden listed tool reported ${hiddenReceipt.outcome}`);
  // It failed before the turn, which is the point: an unexposed tool in the listing is a
  // problem whether or not the model happened to call it.
  ok(hiddenReceipt.lifecycle.includes("CANARY_RUNNING") === false, "a hidden listed tool reached the turn");

  // A tool that is listed acceptably but *called* unacceptably. Checking only the listing would
  // miss it, which is why the called set is checked separately.
  const calledHidden = new FakeCarrier();
  calledHidden.calledTools = [tool({ tool: "agent-shield.private", policyExposed: false })];
  ok(run(calledHidden).outcome === "MCP_MISMATCH", "an unexposed called tool was admitted");
  ok(run().toolCallCount === 1, "the receipt lost the tool call count");
}

// INT-CLAUDE-006. A real bounded turn, and nothing that merely looks like one.
function realCarrier(): void {
  const absent = new FakeCarrier();
  absent.present = false;
  ok(run(absent).outcome === "ABSENT_CLAUDE", "an absent carrier was admitted");

  const anonymous = new FakeCarrier();
  anonymous.authenticated = false;
  ok(run(anonymous).outcome === "NOT_AUTHENTICATED", "an unauthenticated carrier was admitted");

  // The control the issue names: replace the turn with a mock or prose. Package and config
  // presence is exactly what a mock still has, so the turn kind is the only thing that separates
  // them.
  for (const kind of ["mock", "replay"] as const) {
    const faked = new FakeCarrier();
    faked.turnKind = kind;
    const receipt = run(faked);
    ok(receipt.outcome === "OUTPUT_INVALID", `a ${kind} turn reported ${receipt.outcome}`);
    ok(receipt.turnKind === kind, "the receipt hid which kind of turn ran");
  }

  const norun = new FakeCarrier();
  norun.runsTurn = false;
  ok(run(norun).outcome === "CANARY_FAILED", "a turn that did not run was admitted");

  const timedOut = new FakeCarrier();
  timedOut.turnTimedOut = true;
  ok(run(timedOut).outcome === "TIMED_OUT", "a timed-out turn was not reported as a timeout");

  const failed = new FakeCarrier();
  failed.turnExitCode = 2;
  ok(run(failed).outcome === "CANARY_FAILED", "a non-zero exit was admitted");

  const incomplete = new FakeCarrier();
  incomplete.turnCompleted = false;
  ok(run(incomplete).outcome === "CANARY_FAILED", "an incomplete turn was admitted");

  // A turn that called nothing did not exercise the surface this canary exists for.
  const noTools = new FakeCarrier();
  noTools.calledTools = [];
  ok(run(noTools).outcome === "OUTPUT_INVALID", "a turn with no tool call was admitted");

  ok(run().turnKind === "model", "the receipt lost the turn kind");
  ok(run().exitCode === 0, "the receipt lost the exit code");
}

// INT-CLAUDE-007. Exits, digests and a predicate -- never the transcript.
function receiptPrivacy(): void {
  const sealed = new SealedTranscript(`assistant: ${PLANTED_OUTPUT}`);
  ok(sealed.toJSON() === REDACTED, "toJSON leaked the transcript");
  ok(sealed.toString() === REDACTED, "toString leaked the transcript");
  ok(`${sealed}` === REDACTED, "template interpolation leaked the transcript");
  ok(String(sealed) === REDACTED, "String() leaked the transcript");
  ok(JSON.stringify(sealed) === `"${REDACTED}"`, "JSON serialization leaked the transcript");
  ok(JSON.stringify({ sealed }).includes(PLANTED_OUTPUT) === false, "nested serialization leaked the transcript");
  ok((sealed as unknown as Record<symbol, () => string>)[Symbol.for("nodejs.util.inspect.custom")]() === REDACTED, "the inspect hook leaked the transcript");
  ok(/^[a-f0-9]{64}$/.test(sealed.sha256), "the transcript digest is absent");
  ok(sealed.use((value) => value.includes(PLANTED_OUTPUT)), "the scoped accessor could not reach the text");
  ok(sealed.byteLength > 0, "the transcript length is absent");

  const failedRun = new FakeCarrier();
  failedRun.turnExitCode = 2;
  for (const [label, receipt] of [["a clean", run()], ["a failed", run(failedRun)]] as const) {
    const text = JSON.stringify(receipt);
    ok(text.includes(PLANTED_OUTPUT) === false, `the ${label} receipt carried the model transcript`);
    ok(text.includes("assistant:") === false, `the ${label} receipt carried transcript structure`);
    ok(text.includes("/w/") === false, `the ${label} receipt carried a host path`);
  }
  type Forbids<T, K extends string> = K extends keyof T ? never : true;
  const receiptHasNoTranscript: Forbids<CarrierCanaryReceipt, "transcript" | "output" | "token" | "workspacePath"> = true;
  void receiptHasNoTranscript;
}

// INT-CLAUDE-008. Cleanup across success, failure and timeout.
function cleanupAccounting(): void {
  const leaks: [string, (t: FakeCarrier) => void][] = [
    ["a workspace", (t) => { t.retainedWorkspaces = 1; }],
    ["a process", (t) => { t.retainedProcesses = 1; }],
    ["a lease", (t) => { t.retainedLeases = 1; }],
  ];
  for (const [label, leak] of leaks) {
    const transport = new FakeCarrier();
    leak(transport);
    const receipt = run(transport);
    ok(receipt.outcome === "FAILED_CLEANUP", `${label} left behind reported ${receipt.outcome}`);
    ok(receipt.cleanupCleared === false, `${label} left behind was reported as cleared`);
  }
  // Cleanup is accounted for on a failed and on a timed-out run too, not only on success.
  for (const [label, mutate] of [
    ["a failed", (t: FakeCarrier) => { t.turnExitCode = 2; }],
    ["a timed-out", (t: FakeCarrier) => { t.turnTimedOut = true; }],
  ] as const) {
    const transport = new FakeCarrier();
    mutate(transport);
    transport.retainedProcesses = 1;
    ok(run(transport).cleanupCleared === false, `${label} run that leaked was reported as cleared`);
  }
  ok(run().cleanupCleared, "a clean run was reported as leaking");
}

// INT-CODEX-009. The receipt permits a later parity comparison without either carrier proxying
// the other.
function receiptAdmission(): void {
  const receipt = run();
  const expected = { carrier: "claude-code" as const, subject: SUBJECT };
  ok(canaryReceiptRefusal(receipt, expected) === null, "a genuine receipt was refused");

  // The whole point: a Claude receipt can never satisfy a Codex expectation.
  ok(canaryReceiptRefusal(receipt, { ...expected, carrier: "codex-cli" }) !== null, "a Claude receipt satisfied a Codex expectation");

  const forgeries: [string, CarrierCanaryReceipt][] = [
    ["another schema", { ...receipt, schema: "agent-shield/other/v1" as typeof receipt.schema }],
    ["another carrier", { ...receipt, carrier: "codex-cli" }],
    ["another commit", { ...receipt, subject: { ...SUBJECT, commit: "9".repeat(40) } }],
    ["another release", { ...receipt, subject: { ...SUBJECT, releaseId: "other@1" } }],
    ["an uncleaned outcome", { ...receipt, outcome: "TIMED_OUT" }],
    ["a mock turn", { ...receipt, turnKind: "mock" }],
    ["an absent turn kind", { ...receipt, turnKind: null }],
    ["a non-zero exit", { ...receipt, exitCode: 1 }],
    ["no tool call", { ...receipt, toolCallCount: 0 }],
    ["no frozen context", { ...receipt, contextDigest: null }],
    ["retained resources", { ...receipt, cleanupCleared: false }],
  ];
  for (const [label, forged] of forgeries) {
    ok(canaryReceiptRefusal(forged, expected) !== null, `${label} was admitted`);
  }
}

function transitionLegality(): void {
  ok(validateCanaryLifecycle(["UNRESOLVED", "ABSENT_CLAUDE"]) === "ABSENT_CLAUDE", "a legal trace was refused");
  ok(isCanaryOutcome("CLEANED"), "CLEANED is not recognised as an outcome");
  ok(isCanaryOutcome("CANARY_RUNNING") === false, "CANARY_RUNNING is treated as an outcome");

  red(() => assertCanaryTransition("CONTEXT_FROZEN", "RECEIPT_EMITTED"), "emitting a receipt from a frozen context");
  red(() => assertCanaryTransition("CARRIER_AUTH_CHECKED", "RESULT_VALIDATED"), "validating a result without running");
  red(() => assertCanaryTransition("CANARY_RUNNING", "RECEIPT_EMITTED"), "emitting a receipt without validating");
  red(() => assertCanaryTransition("RECEIPT_EMITTED", "UNRESOLVED"), "restarting an emitted canary");
  red(() => assertCanaryTransition("UNRESOLVED", "CANARY_RUNNING"), "running before the release is pinned");

  red(() => validateCanaryLifecycle(["UNRESOLVED", "CLEANED"]), "a trace that skipped the whole canary");
  red(() => validateCanaryLifecycle(["RELEASE_PINNED", "CANARY_FAILED"]), "a trace that did not start at UNRESOLVED");
  red(() => validateCanaryLifecycle(["UNRESOLVED", "RELEASE_PINNED"]), "a trace that stopped short of an outcome");
  red(() => validateCanaryLifecycle(["UNRESOLVED"]), "a single-state trace");
}

function stateSeparation(): void {
  const outcomes = new Set<CanaryOutcome>();
  const fixtures: [string, () => CanaryOutcome][] = [
    ["cleaned", () => run().outcome],
    ["absent carrier", () => { const t = new FakeCarrier(); t.present = false; return run(t).outcome; }],
    ["not authenticated", () => { const t = new FakeCarrier(); t.authenticated = false; return run(t).outcome; }],
    ["context mismatch", () => { const t = new FakeCarrier(); t.freezesContext = false; return run(t).outcome; }],
    ["skill mismatch", () => { const t = new FakeCarrier(); t.skills = [skill({ resolvedFrom: "user-shadow" })]; return run(t).outcome; }],
    ["mcp mismatch", () => { const t = new FakeCarrier(); t.tools = [tool({ policyExposed: false })]; return run(t).outcome; }],
    ["canary failed", () => { const t = new FakeCarrier(); t.runsTurn = false; return run(t).outcome; }],
    ["output invalid", () => { const t = new FakeCarrier(); t.turnKind = "mock"; return run(t).outcome; }],
    ["timed out", () => { const t = new FakeCarrier(); t.turnTimedOut = true; return run(t).outcome; }],
    ["failed cleanup", () => { const t = new FakeCarrier(); t.retainedLeases = 1; return run(t).outcome; }],
  ];
  for (const [label, invoke] of fixtures) {
    const outcome = invoke();
    ok(outcome !== undefined, `${label} produced no outcome`);
    outcomes.add(outcome);
  }
  ok(outcomes.size === 10, `the fixtures cover ${outcomes.size} distinct outcomes, expected 10`);
}

function evidenceBoundary(): void {
  ok(claudeCanaryState.carrierReachability === "NOT_EXERCISED", "carrier reachability was claimed");
  ok(claudeCanaryState.boundedModelTurn === "NOT_EXERCISED", "a bounded model turn was claimed");
  ok(claudeCanaryState.mcpToolCall === "NOT_EXERCISED", "an MCP tool call was claimed");
  ok(claudeCanaryState.codexParity === "NOT_IMPLEMENTED", "Codex parity was claimed");
  ok(claudeCanaryState.releasePromotion === "NOT_IMPLEMENTED", "a release promotion was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const canaryNeverPasses: NeverPass<typeof claudeCanaryState> = true;
void canaryNeverPasses;

ok(TREE_DIGEST !== CONTEXT_DIGEST, "the fixture digests are indistinguishable");

immutableWorkspace();
nativeContext();
skillParity();
hostIsolation();
mcpParity();
realCarrier();
receiptPrivacy();
cleanupAccounting();
receiptAdmission();
transitionLegality();
stateSeparation();
evidenceBoundary();

console.log("INT-CLAUDE GREEN: immutable workspace, native context, Skill parity, host isolation, MCP parity, real carrier, receipt privacy, cleanup, receipt admission, transition legality");
