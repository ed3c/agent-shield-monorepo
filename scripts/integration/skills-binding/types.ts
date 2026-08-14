import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";

export const SKILL_BINDING_SCHEMA = "agent-shield/skill-binding/v1" as const;

export type SkillState =
  | "UNRESOLVED"
  | "SOURCE_RELEASE_PINNED"
  | "REQUIREMENTS_PARSED"
  | "SKILLS_SELECTED"
  | "INTERFACES_CHECKED"
  | "SHADOWING_CHECKED"
  | "BUNDLE_RENDERED"
  | "CLAUDE_PROJECTED"
  | "CODEX_PROJECTED"
  | "BINDING_LOCKED"
  | "ABSENT_SOURCE"
  | "MISSING_SKILL"
  | "INTERFACE_CONFLICT"
  | "DIGEST_CONFLICT"
  | "SHADOWING_RED"
  | "PROJECTION_MISMATCH"
  | "MUTABLE_SOURCE"
  | "BUNDLE_DRIFT";

export type SkillOutcome = Extract<SkillState,
  | "BINDING_LOCKED"
  | "ABSENT_SOURCE"
  | "MISSING_SKILL"
  | "INTERFACE_CONFLICT"
  | "DIGEST_CONFLICT"
  | "SHADOWING_RED"
  | "PROJECTION_MISMATCH"
  | "MUTABLE_SOURCE"
  | "BUNDLE_DRIFT">;

// INT-SKILL-001. A name belongs to exactly one origin. The type admits both values, and the
// resolver refuses a name that appears under both -- that is the whole rule, and it is why the
// origin is a field on the skill rather than something inferred from where a file was found.
export type SkillOrigin = "shared" | "repo-owned";

export interface SkillBody {
  name: string;
  origin: SkillOrigin;
  interfaceMajor: number;
  bodySha256: string;
}

export interface SkillSource {
  release: ReleaseSubject;
  // A dirty checkout cannot produce a pinned source: the flag is recorded rather than assumed
  // false, so INT-SKILL-003 has something to refuse.
  workingTreeClean: boolean;
  skills: SkillBody[];
}

export interface SkillRequirement {
  name: string;
  interfaceMajor: number;
  optional: boolean;
  // A promotion reference is the only way a same-name body with a different digest may be
  // accepted, and it is Human-owned evidence rather than something the resolver can mint.
  promotionRef: string | null;
  expectedBodySha256: string;
}

export interface SkillRequirements {
  consumerId: string;
  required: SkillRequirement[];
  approvedOptional: string[];
}

export interface SkillProjection {
  host: "claude-code" | "codex-cli";
  entries: Array<{ name: string; bodySha256: string }>;
  projectionDigest: string;
}

export interface SkillBinding {
  schema: typeof SKILL_BINDING_SCHEMA;
  consumerId: string;
  source: ReleaseSubject;
  selected: SkillBody[];
  bundleDigest: string;
  projections: SkillProjection[];
}

export interface SkillBindingResult {
  lifecycle: SkillState[];
  outcome: SkillOutcome;
  binding: SkillBinding | null;
  detail: string;
}
