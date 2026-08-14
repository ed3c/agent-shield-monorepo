import type { EvidenceState } from "../index.ts";

export const CONSUMER_LOCK_SCHEMA = "agent-shield/consumer-lock/v1" as const;
export const CONSUMER_REQUIREMENTS_SCHEMA = "agent-shield/consumer-requirements/v1" as const;
export const ROLLBACK_PLAN_SCHEMA = "agent-shield/consumer-rollback-plan/v1" as const;

export type IntegrationState =
  | "UNRESOLVED"
  | "RELEASE_PINNED"
  | "REQUIREMENTS_VALIDATED"
  | "CLOSURE_RESOLVED"
  | "CONFLICTS_CHECKED"
  | "SKILLS_BOUND"
  | "RUNTIME_BOUND"
  | "SURFACES_GENERATED"
  | "OFFLINE_VERIFIED"
  | "ADAPTERS_PENDING"
  | "ABSENT_RELEASE"
  | "INVALID_REQUIREMENTS"
  | "CAPABILITY_CONFLICT"
  | "PATH_CONFLICT"
  | "SKILL_CONFLICT"
  | "RUNTIME_CONFLICT"
  | "SURFACE_DRIFT"
  | "ADAPTER_ABSENT"
  | "ORIGIN_ABSENT"
  | "EQUIVALENCE_FAIL"
  | "ROLLBACK_REFUSED_DRIFT";

export type IntegrationOutcome = Extract<IntegrationState,
  | "ADAPTERS_PENDING"
  | "ABSENT_RELEASE"
  | "INVALID_REQUIREMENTS"
  | "CAPABILITY_CONFLICT"
  | "PATH_CONFLICT"
  | "SKILL_CONFLICT"
  | "RUNTIME_CONFLICT"
  | "SURFACE_DRIFT"
  | "ADAPTER_ABSENT"
  | "ORIGIN_ABSENT"
  | "EQUIVALENCE_FAIL"
  | "ROLLBACK_REFUSED_DRIFT">;

// INT-FND-007. The ladder is ordered, and each rung is a different subject. A rung can only
// be claimed once every rung below it is claimed: an offline verification is not an adapter
// result, an adapter result is not a live carrier run, and none of them is a release.
export const EVIDENCE_LADDER = [
  "offline",
  "adapter",
  "live-carrier",
  "origin",
  "equivalence",
  "release",
  "production",
] as const;

export type EvidenceRung = (typeof EVIDENCE_LADDER)[number];

// INT-FND-001. Only an immutable identity. A branch name, HEAD or tag can move under the
// same string, so none of them can name a release.
export interface ReleaseSubject {
  repository: string;
  commit: string;
  tree: string;
  releaseId: string;
  releaseDigest: string;
}

export interface ReleaseModule {
  id: string;
  interfaceVersion: string;
  manifestSha256: string;
  roots: string[];
  provides: string[];
  requires: string[];
  externalExposed: boolean;
}

export interface ConsumerRequirements {
  schema: typeof CONSUMER_REQUIREMENTS_SCHEMA;
  consumerId: string;
  requestedModules: string[];
  requiredCapabilities: string[];
  surfaces: ConsumerSurface[];
}

export type ConsumerSurface = "claude-code" | "codex-cli" | "mcp";

// INT-FND-005. A binding is a projection that points at a canonical source; it never becomes
// a second canonical copy, and it carries no value that could be a secret.
export type BindingOrigin = "canonical" | "consumer-projection";

export interface SkillBinding {
  skillId: string;
  origin: BindingOrigin;
  canonicalSha256: string;
  ownerModuleId: string;
}

export interface RuntimeBinding {
  profileId: string;
  origin: BindingOrigin;
  canonicalSha256: string;
  ownerModuleId: string;
  scope: "local" | "cloud";
}

// INT-FND-006. Default deny. A CLI command reaches MCP only when policy exposes it, and a
// command that reads as a private, generic-shell or live-owner path can never be exposed.
export interface CliCommand {
  name: string;
  ownerModuleId: string;
  policyExposed: boolean;
}

export interface McpToolProjection {
  tool: string;
  command: string;
  ownerModuleId: string;
}

export interface ConsumerLock {
  schema: typeof CONSUMER_LOCK_SCHEMA;
  consumerId: string;
  release: ReleaseSubject;
  moduleIds: string[];
  interfaceDigests: Record<string, string>;
  skillBindings: SkillBinding[];
  runtimeBindings: RuntimeBinding[];
  mcpTools: McpToolProjection[];
  lifecycle: IntegrationState[];
  outcome: IntegrationOutcome;
  state: EvidenceState;
  evidence: Record<EvidenceRung, EvidenceState>;
  exclusions: string[];
}

export interface RollbackPlan {
  schema: typeof ROLLBACK_PLAN_SCHEMA;
  consumerId: string;
  fromRelease: ReleaseSubject;
  toRelease: ReleaseSubject;
  removedTools: string[];
  removedSkillIds: string[];
  detail: string;
}
