import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import {
  FakeExecutionPort,
  MCP_POLICY_SCHEMA,
  cliMcpParityState,
  executeMcpRequest,
  generateTools,
  toolNameFor,
  type CliCommand,
  type ClosureSubject,
  type McpExposurePolicy,
  type McpRequest,
  type RequestCarrier,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-MCP ${message}`);
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
  ok(text.startsWith("invalid parity contract: "), `${message} threw "${text}" rather than a parity contract error`);
}

const RELEASE: ReleaseSubject = {
  repository: "https://github.com/ed3c/agent-shield-monorepo",
  commit: "1".repeat(40),
  tree: "2".repeat(40),
  releaseId: "agent-shield-module-set@0.1.0",
  releaseDigest: "3".repeat(64),
};

const COMMANDS: CliCommand[] = [
  { name: "verify", moduleId: "runtime-fabric", inputFields: ["target"], exitCodes: [0, 1] },
  { name: "selftest", moduleId: "runtime-fabric", inputFields: [], exitCodes: [0, 1] },
  { name: "internal dump", moduleId: "runtime-fabric", inputFields: [], exitCodes: [0] },
];

function policy(overrides: Partial<McpExposurePolicy> = {}): McpExposurePolicy {
  return {
    schema: MCP_POLICY_SCHEMA,
    externallyExposed: ["verify", "selftest"],
    maxRequestBytes: 65_536,
    maxOutputBytes: 1_048_576,
    maxDurationMs: 60_000,
    network: "deny-all",
    allowedHosts: [],
    mutation: "workspace",
    maxContinuationSteps: 4,
    ...overrides,
  };
}

const CLOSURE: ClosureSubject = {
  release: RELEASE,
  moduleIds: ["runtime-fabric"],
  skillNames: ["external-verify"],
  runtimeProfileId: "settlement-local",
};

function carrier(overrides: Partial<RequestCarrier> = {}): RequestCarrier {
  return { kind: "inline-bundle", inlineBytes: 512, artifactSha256: null, continuationStep: null, ...overrides };
}

function request(overrides: Partial<McpRequest> = {}): McpRequest {
  return { tool: "loopctl_verify", input: { target: "workspace" }, carrier: carrier(), requestBytes: 1_024, ...overrides };
}

function execute(overrides: Partial<McpRequest> = {}, tune: Partial<{ port: FakeExecutionPort; policy: McpExposurePolicy; closure: ClosureSubject; commands: CliCommand[] }> = {}) {
  const port = tune.port ?? new FakeExecutionPort();
  return {
    port,
    result: executeMcpRequest(request(overrides), {
      commands: tune.commands ?? COMMANDS,
      policy: tune.policy ?? policy(),
      closure: tune.closure ?? CLOSURE,
      port,
    }),
  };
}

// INT-MCP-001 tool parity
function toolParity(): void {
  const tools = generateTools(COMMANDS, policy());
  ok(tools.map((entry) => entry.tool).join(",") === "loopctl_selftest,loopctl_verify", `the surface is ${tools.map((entry) => entry.tool).join(",")}`);
  ok(!tools.some((entry) => entry.command.includes("internal")), "a private command was exposed");

  // Policy naming a command the CLI does not declare is drift in the other direction.
  red(() => generateTools(COMMANDS, policy({ externallyExposed: ["verify", "ghost"] })), "a policy exposing an undeclared command");
  red(() => generateTools([...COMMANDS, COMMANDS[0]], policy()), "a CLI declaring one command twice");
  red(() => generateTools([{ ...COMMANDS[0], name: "Verify" }], policy({ externallyExposed: ["Verify"] })), "a non-portable command name");
  red(
    () => generateTools([{ ...COMMANDS[0], inputFields: ["target-path"] }], policy({ externallyExposed: ["verify"] })),
    "a command declaring an invalid input field",
  );
  ok(toolNameFor("internal dump") === "loopctl_internal_dump", "the tool name projection changed shape");
}

// INT-MCP-002 default deny
function defaultDeny(): void {
  ok(execute({ tool: "loopctl_internal_dump" }).result.outcome === "TOOL_DENIED", "an unexposed command was callable");
  ok(execute({ tool: "loopctl_unknown" }).result.outcome === "TOOL_DENIED", "an unknown tool was callable");
  ok(generateTools(COMMANDS, policy({ externallyExposed: [] })).length === 0, "an empty policy produced tools");
  ok(execute({}, { policy: policy({ externallyExposed: [] }) }).result.outcome === "TOOL_DENIED", "an empty policy still served a tool");
}

// INT-MCP-003 carrier closure
function carrierClosure(): void {
  ok(execute().result.outcome === "COMPLETED", `the happy path reported ${execute().result.outcome}`);

  for (const [label, value] of [
    ["a host absolute path", "/opt/checkout/file.ts"],
    ["a home path", `${"~"}/secrets`],
    ["a Windows path", "C:\\Users\\owner"],
    ["a remote URL", "https://example.com/payload"],
    ["a git URL", "git://example.com/repo"],
    ["a shell fragment", "workspace; rm -rf /"],
    ["a pipe", "workspace | cat"],
    ["a substitution", "$(whoami)"],
    ["a template", "{{ secrets.TOKEN }}"],
  ] as const) {
    ok(
      execute({ input: { target: value } }).result.outcome === "INVALID_CARRIER",
      `${label} was accepted as an input value`,
    );
  }
  ok(execute({ input: { cwd: "workspace" } }).result.outcome === "INVALID_CARRIER", "an undeclared input field was accepted");

  for (const [label, patch] of [
    ["two carriers at once", { inlineBytes: 512, artifactSha256: "d".repeat(64) }],
    ["no carrier at all", { inlineBytes: null }],
    ["a malformed artifact ref", { kind: "artifact-ref" as const, inlineBytes: null, artifactSha256: "short" }],
    ["a zero continuation step", { kind: "continuation" as const, inlineBytes: null, continuationStep: 0 }],
  ] as const) {
    ok(execute({ carrier: carrier(patch) }).result.outcome === "INVALID_CARRIER", `${label} was accepted`);
  }
  ok(execute({ carrier: carrier({ kind: "artifact-ref", inlineBytes: null, artifactSha256: "d".repeat(64) }) }).result.outcome === "COMPLETED", "a valid artifact ref was refused");
}

// INT-MCP-004 immutable subject
function immutableSubject(): void {
  for (const [label, patch] of [
    ["a branch name", { commit: "main" }],
    ["a short commit", { commit: "1".repeat(7) }],
    ["a moving tree", { tree: "HEAD" }],
  ] as const) {
    ok(
      execute({}, { closure: { ...CLOSURE, release: { ...RELEASE, ...patch } } }).result.outcome === "MUTABLE_REF",
      `${label} was accepted as a closure subject`,
    );
  }

  // A pinned closure is unaffected by anything the owner does afterwards: the subject is the
  // commit recorded in the request, and the port receives exactly that.
  const { port, result } = execute();
  ok(result.outcome === "COMPLETED", "a pinned closure failed");
  ok(port.closures[0].release.commit === RELEASE.commit, "the port received a different commit than the pinned one");
}

// INT-MCP-005 selected closure
function selectedClosure(): void {
  const { port } = execute();
  ok(port.closures[0].moduleIds.join(",") === "runtime-fabric", "the workspace received more than the selected modules");
  ok(port.closures[0].skillNames.join(",") === "external-verify", "the workspace received unselected Skills");
  ok(port.materialized.length === 1, "a call materialized more than one workspace");

  ok(
    execute({}, { closure: { ...CLOSURE, moduleIds: [] } }).result.outcome === "MATERIALIZATION_FAILED",
    "an empty closure was materialized",
  );
  ok(
    execute({}, { closure: { ...CLOSURE, moduleIds: ["/opt/live-checkout"] } }).result.outcome === "MATERIALIZATION_FAILED",
    "a live checkout path was accepted as a module",
  );
  const failing = new FakeExecutionPort();
  failing.materializes = false;
  ok(execute({}, { port: failing }).result.outcome === "MATERIALIZATION_FAILED", "a failed materialization reported success");

  // Each call gets its own fresh workspace.
  const shared = new FakeExecutionPort();
  execute({}, { port: shared });
  execute({}, { port: shared });
  ok(shared.materialized.length === 2 && shared.materialized[0] !== shared.materialized[1], "two calls shared one workspace");
}

// INT-MCP-006 limits
function limits(): void {
  ok(execute({ requestBytes: 65_537 }).result.outcome === "LIMIT_EXCEEDED", "an oversized request was accepted");
  ok(
    execute({ carrier: carrier({ inlineBytes: 65_537 }) }).result.outcome === "LIMIT_EXCEEDED",
    "an oversized inline bundle was accepted",
  );
  ok(
    execute({ carrier: carrier({ kind: "continuation", inlineBytes: null, continuationStep: 5 }) }).result.outcome === "LIMIT_EXCEEDED",
    "a continuation beyond its step budget was accepted",
  );

  const loud = new FakeExecutionPort();
  loud.result = { ...loud.result, outputBytes: 1_048_577 };
  ok(execute({}, { port: loud }).result.outcome === "LIMIT_EXCEEDED", "an oversized output was accepted");

  const slow = new FakeExecutionPort();
  slow.result = { ...slow.result, durationMs: 60_001 };
  ok(execute({}, { port: slow }).result.outcome === "LIMIT_EXCEEDED", "an overlong call was accepted");

  // No `as const`: it would make the nested array readonly, which Partial<McpExposurePolicy>
  // does not accept.
  const policyPatches: Array<[string, Partial<McpExposurePolicy>]> = [
    ["an unbounded request size", { maxRequestBytes: 0 }],
    ["an unbounded duration", { maxDurationMs: 600_001 }],
    ["an unbounded continuation budget", { maxContinuationSteps: 33 }],
    ["deny-all with hosts", { allowedHosts: ["example.com"] }],
    ["an empty allowlist", { network: "allowlist" }],
  ];
  for (const [label, patch] of policyPatches) {
    ok(execute({}, { policy: policy(patch) }).result.outcome === "POLICY_MISSING", `${label} was accepted as policy`);
  }
}

// INT-MCP-007 exit and state fidelity
function exitFidelity(): void {
  for (const [exitCode, evidence] of [[0, "PASS"], [1, "FAIL"], [1, "ABSENT"], [0, "NOT_EXERCISED"]] as const) {
    const port = new FakeExecutionPort();
    port.result = { ...port.result, exitCode, evidence };
    const { result } = execute({}, { port });
    ok(result.outcome === "COMPLETED", `exit ${exitCode}/${evidence} reported ${result.outcome}`);
    ok(result.exitCode === exitCode, `exit code ${exitCode} was remapped to ${result.exitCode}`);
    ok(result.evidence === evidence, `evidence ${evidence} was folded into ${result.evidence}`);
  }

  const undeclared = new FakeExecutionPort();
  undeclared.result = { ...undeclared.result, exitCode: 7 };
  const result = execute({}, { port: undeclared }).result;
  ok(result.outcome === "OUTPUT_INVALID", `an undeclared exit code reported ${result.outcome}`);
  ok(result.exitCode === 7, "the undeclared exit code was hidden rather than reported");

  const badArtifact = new FakeExecutionPort();
  badArtifact.result = { ...badArtifact.result, artifactSha256: "not-a-digest" };
  ok(execute({}, { port: badArtifact }).result.outcome === "OUTPUT_INVALID", "a malformed artifact reference was accepted");

  const silent = new FakeExecutionPort();
  silent.runs = false;
  ok(execute({}, { port: silent }).result.outcome === "EXECUTION_FAILED", "a port returning nothing reported success");
}

// INT-MCP-008 cleanup
function cleanup(): void {
  const { port, result } = execute();
  ok(result.cleanupVerified && port.cleaned.length === 1, "a successful call did not clean its workspace");

  // Cleanup runs on every path, and a retained resource overrides the outcome.
  for (const [label, tune] of [
    ["a limit failure", { requestOverrides: { requestBytes: 1_024 }, mutate: (port: FakeExecutionPort) => { port.result = { ...port.result, outputBytes: 2_000_000 }; } }],
    ["an execution failure", { requestOverrides: {}, mutate: (port: FakeExecutionPort) => { port.runs = false; } }],
    ["an invalid output", { requestOverrides: {}, mutate: (port: FakeExecutionPort) => { port.result = { ...port.result, exitCode: 9 }; } }],
  ] as const) {
    const port = new FakeExecutionPort();
    tune.mutate(port);
    execute(tune.requestOverrides, { port });
    ok(port.cleaned.length === 1, `${label} skipped cleanup`);
  }

  const dirty = new FakeExecutionPort();
  dirty.cleans = false;
  const dirtyResult = execute({}, { port: dirty }).result;
  ok(dirtyResult.outcome === "FAILED_CLEANUP" && !dirtyResult.cleanupVerified, `an uncleaned workspace reported ${dirtyResult.outcome}`);

  const leaking = new FakeExecutionPort();
  leaking.leaks = 1;
  ok(execute({}, { port: leaking }).result.outcome === "FAILED_CLEANUP", "a retained resource reported a clean call");
}

// INT-MCP-009 macro continuation
function continuation(): void {
  for (const step of [1, 2, 3, 4]) {
    ok(
      execute({ carrier: carrier({ kind: "continuation", inlineBytes: null, continuationStep: step }) }).result.outcome === "COMPLETED",
      `continuation step ${step} was refused`,
    );
  }
  ok(
    execute({ carrier: carrier({ kind: "continuation", inlineBytes: null, continuationStep: 5 }) }).result.outcome === "LIMIT_EXCEEDED",
    "an unbounded continuation was accepted",
  );
}

function evidenceBoundary(): void {
  ok(cliMcpParityState.claudeCarrier === "NOT_EXERCISED", "a Claude carrier was claimed");
  ok(cliMcpParityState.releasePromotion === "NOT_IMPLEMENTED", "release promotion was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const parityNeverPasses: NeverPass<typeof cliMcpParityState> = true;
void parityNeverPasses;

toolParity();
defaultDeny();
carrierClosure();
immutableSubject();
selectedClosure();
limits();
exitFidelity();
cleanup();
continuation();
evidenceBoundary();

console.log("SELFTEST GREEN: INT-MCP tool parity, default deny, carrier closure, immutable subject, selected closure, limits, exit fidelity, cleanup, continuation");
