import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";

export const MCP_POLICY_SCHEMA = "agent-shield/mcp-policy/v1" as const;
export const MCP_RESULT_SCHEMA = "agent-shield/mcp-result/v1" as const;

export type ParityState =
  | "UNRESOLVED"
  | "RELEASE_PINNED"
  | "POLICY_LOADED"
  | "CLI_SURFACE_RESOLVED"
  | "MCP_TOOLS_GENERATED"
  | "REQUEST_VALIDATED"
  | "CLOSURE_MATERIALIZED"
  | "EXECUTING"
  | "VALIDATING_RESULT"
  | "CLEANING"
  | "COMPLETED"
  | "ABSENT_RELEASE"
  | "POLICY_MISSING"
  | "SURFACE_DRIFT"
  | "TOOL_DENIED"
  | "INVALID_CARRIER"
  | "MUTABLE_REF"
  | "MATERIALIZATION_FAILED"
  | "EXECUTION_FAILED"
  | "OUTPUT_INVALID"
  | "LIMIT_EXCEEDED"
  | "FAILED_CLEANUP";

export type ParityOutcome = Extract<ParityState,
  | "COMPLETED"
  | "ABSENT_RELEASE"
  | "POLICY_MISSING"
  | "SURFACE_DRIFT"
  | "TOOL_DENIED"
  | "INVALID_CARRIER"
  | "MUTABLE_REF"
  | "MATERIALIZATION_FAILED"
  | "EXECUTION_FAILED"
  | "OUTPUT_INVALID"
  | "LIMIT_EXCEEDED"
  | "FAILED_CLEANUP">;

// INT-MCP-001. The CLI surface and the policy are two declarations of one thing, and the
// generator refuses to proceed unless they agree exactly -- in both directions.
export interface CliCommand {
  name: string;
  moduleId: string;
  // A command declares the exact input field names it accepts. There is no free-form
  // argument, so INT-MCP-003's rejections are a property of the schema rather than a filter.
  inputFields: string[];
  exitCodes: number[];
}

export interface McpExposurePolicy {
  schema: typeof MCP_POLICY_SCHEMA;
  externallyExposed: string[];
  maxRequestBytes: number;
  maxOutputBytes: number;
  maxDurationMs: number;
  network: "deny-all" | "allowlist";
  allowedHosts: string[];
  mutation: "none" | "workspace";
  maxContinuationSteps: number;
}

export interface McpTool {
  tool: string;
  command: string;
  moduleId: string;
  inputFields: string[];
}

// INT-MCP-003. The only carrier a request may use. There is no command, cwd, env, argv,
// private-flag or URL field, so those rejections cannot be bypassed by a new call site.
export type CarrierKind = "inline-bundle" | "artifact-ref" | "continuation";

export interface RequestCarrier {
  kind: CarrierKind;
  // An inline bundle carries bytes; an artifact ref carries a digest; a continuation carries a
  // step token. Exactly one is populated, and the validator enforces it.
  inlineBytes: number | null;
  artifactSha256: string | null;
  continuationStep: number | null;
}

export interface McpRequest {
  tool: string;
  input: Record<string, string>;
  carrier: RequestCarrier;
  requestBytes: number;
}

export type CliEvidence = "PASS" | "FAIL" | "ABSENT" | "NOT_EXERCISED";

export interface CliResult {
  exitCode: number;
  evidence: CliEvidence;
  outputBytes: number;
  durationMs: number;
  artifactSha256: string | null;
  detail: string;
}

export interface McpResult {
  schema: typeof MCP_RESULT_SCHEMA;
  tool: string;
  lifecycle: ParityState[];
  outcome: ParityOutcome;
  // INT-MCP-007. The CLI's own exit code and evidence state pass through unchanged.
  exitCode: number | null;
  evidence: CliEvidence | null;
  artifactSha256: string | null;
  cleanupVerified: boolean;
  detail: string;
}

export interface ClosureSubject {
  release: ReleaseSubject;
  moduleIds: string[];
  skillNames: string[];
  runtimeProfileId: string;
}

// The execution surface. A workspace is materialized fresh per call and destroyed after, and
// the port reports what it still holds so a retained resource is visible.
export interface ExecutionPort {
  materialize(closure: ClosureSubject): string | null;
  run(workspaceId: string, command: string, input: Record<string, string>): CliResult | null;
  cleanup(workspaceId: string): boolean;
  retainedResources(): number;
}
