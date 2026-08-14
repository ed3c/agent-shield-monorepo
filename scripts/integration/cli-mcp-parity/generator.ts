import { validateReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import {
  MCP_POLICY_SCHEMA,
  MCP_RESULT_SCHEMA,
  type CliCommand,
  type ClosureSubject,
  type ExecutionPort,
  type McpExposurePolicy,
  type McpRequest,
  type McpResult,
  type McpTool,
  type ParityState,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const SAFE_COMMAND = /^[a-z][a-z0-9-]{0,63}(?: [a-z][a-z0-9-]{0,63}){0,2}$/;
const SAFE_TOOL = /^[a-z][a-z0-9_]{0,63}$/;
const SAFE_FIELD = /^[a-z][a-zA-Z0-9]{0,31}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// INT-MCP-003. Values a caller must never be able to smuggle through an input field. The
// field *names* are already closed by the command declaration; this catches a value that is
// itself a path, a URL or a shell fragment.
const HOST_PATH_VALUE = /(?:^|[\s"'(=])(?:\/[A-Za-z0-9._-]+\/|~\/|[A-Za-z]:\\)/;
const REMOTE_URL_VALUE = /\b[a-z][a-z0-9+.-]*:\/\//i;
const SHELL_VALUE = /[;&|`$><]|\$\(|\{\{/;

export function fail(message: string): never {
  throw new Error(`invalid parity contract: ${message}`);
}

export function toolNameFor(command: string): string {
  return `loopctl_${command.replace(/[ -]/g, "_")}`;
}

// INT-MCP-001 and INT-MCP-002. The tool surface is generated from the CLI catalog filtered by
// explicit policy, and the two must agree in both directions: a policy naming a command the
// CLI does not have is as much a drift as a CLI command exposed without policy. Default deny
// is what "filtered by policy" means -- a command absent from the policy produces no tool.
export function generateTools(commands: readonly CliCommand[], policy: McpExposurePolicy): McpTool[] {
  if (policy.schema !== MCP_POLICY_SCHEMA) fail("policy schema is unsupported");
  const byName = new Map<string, CliCommand>();
  for (const command of commands) {
    if (!SAFE_COMMAND.test(command.name)) fail(`command ${command.name} is not a portable CLI name`);
    if (byName.has(command.name)) fail(`command ${command.name} is declared twice`);
    for (const field of command.inputFields) {
      if (!SAFE_FIELD.test(field)) fail(`command ${command.name} declares an invalid input field`);
    }
    byName.set(command.name, command);
  }

  const tools: McpTool[] = [];
  for (const name of [...policy.externallyExposed].sort()) {
    const command = byName.get(name);
    if (command === undefined) fail(`policy exposes ${name}, which the CLI does not declare`);
    const tool = toolNameFor(name);
    if (!SAFE_TOOL.test(tool)) fail(`command ${name} does not project to a portable tool name`);
    if (tools.some((entry) => entry.tool === tool)) fail(`tool ${tool} is projected by more than one command`);
    tools.push({ tool, command: name, moduleId: command.moduleId, inputFields: [...command.inputFields].sort() });
  }
  return tools;
}

export function assertPolicy(policy: McpExposurePolicy): McpExposurePolicy {
  if (policy.schema !== MCP_POLICY_SCHEMA) fail("policy schema is unsupported");
  for (const [name, value, max] of [
    ["maxRequestBytes", policy.maxRequestBytes, 1_048_576],
    ["maxOutputBytes", policy.maxOutputBytes, 8_388_608],
    ["maxDurationMs", policy.maxDurationMs, 600_000],
    ["maxContinuationSteps", policy.maxContinuationSteps, 32],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > max) fail(`policy.${name} must be a bounded positive integer`);
  }
  if (policy.network === "deny-all" && policy.allowedHosts.length > 0) fail("policy denies network yet lists hosts");
  if (policy.network === "allowlist" && policy.allowedHosts.length === 0) fail("policy allows network with an empty allowlist");
  for (const host of policy.allowedHosts) if (!SAFE_HOST.test(host)) fail(`policy lists an invalid host: ${host}`);
  return policy;
}

function validateCarrier(request: McpRequest, policy: McpExposurePolicy): ParityState | null {
  const carrier = request.carrier;
  const populated = [carrier.inlineBytes, carrier.artifactSha256, carrier.continuationStep].filter((value) => value !== null);
  if (populated.length !== 1) return "INVALID_CARRIER";
  switch (carrier.kind) {
    case "inline-bundle":
      if (carrier.inlineBytes === null) return "INVALID_CARRIER";
      if (carrier.inlineBytes > policy.maxRequestBytes) return "LIMIT_EXCEEDED";
      return null;
    case "artifact-ref":
      return carrier.artifactSha256 !== null && SHA_256.test(carrier.artifactSha256) ? null : "INVALID_CARRIER";
    default:
      if (carrier.continuationStep === null) return "INVALID_CARRIER";
      if (!Number.isSafeInteger(carrier.continuationStep) || carrier.continuationStep < 1) return "INVALID_CARRIER";
      // INT-MCP-009. A composition that will not fit in one call splits into bounded steps,
      // and the step budget is enforced rather than advisory.
      return carrier.continuationStep > policy.maxContinuationSteps ? "LIMIT_EXCEEDED" : null;
  }
}

export interface ExecuteOptions {
  commands: readonly CliCommand[];
  policy: McpExposurePolicy;
  closure: ClosureSubject;
  port: ExecutionPort;
}

export function executeMcpRequest(request: McpRequest, options: ExecuteOptions): McpResult {
  const lifecycle: ParityState[] = ["UNRESOLVED"];
  const settle = (outcome: ParityState, detail: string, cleanupVerified = true): McpResult => ({
    schema: MCP_RESULT_SCHEMA,
    tool: request.tool,
    lifecycle: [...lifecycle, outcome],
    outcome: outcome as McpResult["outcome"],
    exitCode: null,
    evidence: null,
    artifactSha256: null,
    cleanupVerified,
    detail,
  });

  try {
    validateReleaseSubject(options.closure.release);
  } catch {
    // INT-MCP-004. A mutable ref cannot name the closure a call runs in, so moving the owner's
    // branch after the server started changes nothing about an already-pinned subject.
    return settle("MUTABLE_REF", "the closure release is not an immutable identity");
  }
  lifecycle.push("RELEASE_PINNED");

  let policy: McpExposurePolicy;
  let tools: McpTool[];
  try {
    policy = assertPolicy(options.policy);
    tools = generateTools(options.commands, policy);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return settle(detail.includes("which the CLI does not declare") ? "SURFACE_DRIFT" : "POLICY_MISSING", detail);
  }
  lifecycle.push("POLICY_LOADED", "CLI_SURFACE_RESOLVED", "MCP_TOOLS_GENERATED");

  const tool = tools.find((entry) => entry.tool === request.tool);
  // INT-MCP-002. A tool the policy did not produce simply does not exist here.
  if (tool === undefined) return settle("TOOL_DENIED", `tool ${request.tool} is not externally exposed`);

  if (request.requestBytes > policy.maxRequestBytes) return settle("LIMIT_EXCEEDED", "the request exceeds its admitted size");
  for (const [field, value] of Object.entries(request.input)) {
    if (!tool.inputFields.includes(field)) return settle("INVALID_CARRIER", `field ${field} is not declared by ${tool.command}`);
    if (HOST_PATH_VALUE.test(value)) return settle("INVALID_CARRIER", `field ${field} carries a host path`);
    if (REMOTE_URL_VALUE.test(value)) return settle("INVALID_CARRIER", `field ${field} carries a remote URL`);
    if (SHELL_VALUE.test(value)) return settle("INVALID_CARRIER", `field ${field} carries a shell fragment`);
  }
  const carrierBlocked = validateCarrier(request, policy);
  if (carrierBlocked !== null) return settle(carrierBlocked, `the request carrier is ${carrierBlocked}`);
  lifecycle.push("REQUEST_VALIDATED");

  // INT-MCP-005. The workspace is materialized from the selected closure only.
  for (const moduleId of options.closure.moduleIds) {
    if (!SAFE_ID.test(moduleId)) return settle("MATERIALIZATION_FAILED", `closure module ${moduleId} is invalid`);
  }
  if (options.closure.moduleIds.length === 0) return settle("MATERIALIZATION_FAILED", "the closure selects no module");
  const workspaceId = options.port.materialize(options.closure);
  if (workspaceId === null) return settle("MATERIALIZATION_FAILED", "the closure could not be materialized");
  lifecycle.push("CLOSURE_MATERIALIZED", "EXECUTING");

  const finish = (outcome: ParityState, detail: string, result: { exitCode: number | null; evidence: McpResult["evidence"]; artifact: string | null }): McpResult => {
    // INT-MCP-008. Cleanup runs on every path -- success, failure, limit and cancellation --
    // and its result is reported rather than assumed.
    lifecycle.push("CLEANING");
    const cleaned = options.port.cleanup(workspaceId) && options.port.retainedResources() === 0;
    return {
      schema: MCP_RESULT_SCHEMA,
      tool: request.tool,
      lifecycle: [...lifecycle, cleaned ? outcome : "FAILED_CLEANUP"],
      outcome: (cleaned ? outcome : "FAILED_CLEANUP") as McpResult["outcome"],
      exitCode: result.exitCode,
      evidence: result.evidence,
      artifactSha256: result.artifact,
      cleanupVerified: cleaned,
      detail: cleaned ? detail : "a resource was retained after the call",
    };
  };

  const result = options.port.run(workspaceId, tool.command, request.input);
  if (result === null) return finish("EXECUTION_FAILED", "the CLI port did not return a result", { exitCode: null, evidence: null, artifact: null });
  lifecycle.push("VALIDATING_RESULT");

  const command = options.commands.find((entry) => entry.name === tool.command) as CliCommand;
  // INT-MCP-007. The CLI's exit code must be one it declares, and its evidence state passes
  // through unchanged -- no remapping, no folding of ABSENT or NOT_EXERCISED into FAIL.
  if (!command.exitCodes.includes(result.exitCode)) {
    return finish("OUTPUT_INVALID", `exit code ${result.exitCode} is not declared by ${tool.command}`, { exitCode: result.exitCode, evidence: result.evidence, artifact: null });
  }
  if (result.artifactSha256 !== null && !SHA_256.test(result.artifactSha256)) {
    return finish("OUTPUT_INVALID", "the result artifact reference is not a digest", { exitCode: result.exitCode, evidence: result.evidence, artifact: null });
  }
  if (result.outputBytes > policy.maxOutputBytes) {
    return finish("LIMIT_EXCEEDED", "the result exceeds its admitted output size", { exitCode: result.exitCode, evidence: result.evidence, artifact: result.artifactSha256 });
  }
  if (result.durationMs > policy.maxDurationMs) {
    return finish("LIMIT_EXCEEDED", "the call exceeded its admitted duration", { exitCode: result.exitCode, evidence: result.evidence, artifact: result.artifactSha256 });
  }

  return finish("COMPLETED", result.detail, { exitCode: result.exitCode, evidence: result.evidence, artifact: result.artifactSha256 });
}
