import { createHash } from "node:crypto";
import { validateReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import {
  SKILL_BINDING_SCHEMA,
  type SkillBinding,
  type SkillBindingResult,
  type SkillBody,
  type SkillProjection,
  type SkillRequirements,
  type SkillSource,
  type SkillState,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
// INT-SKILL-007. A bundle carries portable identities only. An absolute path, a home
// reference, a Windows drive or anything credential-shaped is refused wherever it appears.
const HOST_PATH = /(?:^|[\s"'(=])(?:\/[A-Za-z0-9._-]+\/|~\/|[A-Za-z]:\\)/;
const CREDENTIAL_SHAPE = /(?:bearer\s+[A-Za-z0-9._-]{8,}|eyJ[A-Za-z0-9._-]{16,}|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|_API_KEY\s*=|_TOKEN\s*=)/i;

export function fail(message: string): never {
  throw new Error(`invalid skill binding contract: ${message}`);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function assertPortable(value: string, name: string): void {
  if (HOST_PATH.test(value)) fail(`${name} carries a host path`);
  if (CREDENTIAL_SHAPE.test(value)) fail(`${name} carries credential-shaped content`);
}

// INT-SKILL-005. Both host projections are generated from the same selected bodies by the same
// function, so parity is not something to check afterwards -- there is one source for both.
// The controls still mutate a projection to prove the comparison would catch a divergence.
export function projectSkills(selected: readonly SkillBody[], host: SkillProjection["host"]): SkillProjection {
  const entries = [...selected]
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    .map((skill) => ({ name: skill.name, bodySha256: skill.bodySha256 }));
  return { host, entries, projectionDigest: digest(entries) };
}

export function resolveSkillBinding(source: SkillSource, requirements: SkillRequirements): SkillBindingResult {
  const lifecycle: SkillState[] = ["UNRESOLVED"];
  const settle = (outcome: SkillState, detail: string): SkillBindingResult =>
    ({ lifecycle: [...lifecycle, outcome], outcome: outcome as SkillBindingResult["outcome"], binding: null, detail });

  try {
    validateReleaseSubject(source.release);
  } catch {
    return settle("MUTABLE_SOURCE", "the source release is not an immutable identity");
  }
  // INT-SKILL-003. A dirty checkout cannot be pinned, whatever its recorded commit says.
  if (!source.workingTreeClean) return settle("MUTABLE_SOURCE", "the source working tree is dirty");
  lifecycle.push("SOURCE_RELEASE_PINNED");

  if (!SAFE_ID.test(requirements.consumerId)) return settle("MISSING_SKILL", "the requirements name no consumer");
  for (const requirement of requirements.required) {
    if (!SKILL_NAME.test(requirement.name)) return settle("MISSING_SKILL", `skill name ${requirement.name} is invalid`);
    if (!SHA_256.test(requirement.expectedBodySha256)) return settle("DIGEST_CONFLICT", `skill ${requirement.name} has no expected digest`);
  }
  lifecycle.push("REQUIREMENTS_PARSED");

  // INT-SKILL-001. One name, one origin. A name that appears as both shared and repo-owned is
  // the local same-name shadowing this rule exists to stop, and it is refused before anything
  // is selected -- so a consumer can never end up silently preferring one copy.
  const originOf = new Map<string, string>();
  for (const skill of source.skills) {
    if (!SKILL_NAME.test(skill.name)) return settle("MISSING_SKILL", `source skill name ${skill.name} is invalid`);
    if (!SHA_256.test(skill.bodySha256)) return settle("DIGEST_CONFLICT", `source skill ${skill.name} has no body digest`);
    const existing = originOf.get(skill.name);
    if (existing !== undefined) {
      return settle("SHADOWING_RED", `skill ${skill.name} exists as both ${existing} and ${skill.origin}`);
    }
    originOf.set(skill.name, skill.origin);
  }
  lifecycle.push("SHADOWING_CHECKED");

  const byName = new Map(source.skills.map((skill) => [skill.name, skill]));
  const selected: SkillBody[] = [];
  for (const requirement of requirements.required) {
    const body = byName.get(requirement.name);
    if (body === undefined) {
      // INT-SKILL-002. An optional requirement that is absent is simply not materialized; a
      // required one that is absent is a failure.
      if (requirement.optional) continue;
      return settle("MISSING_SKILL", `required skill ${requirement.name} is absent from the source`);
    }
    if (requirement.optional && !requirements.approvedOptional.includes(requirement.name)) continue;

    // INT-SKILL-004. A body whose digest differs from what the consumer was built against is
    // only admissible with a compatible interface major and Human-owned promotion evidence.
    if (body.bodySha256 !== requirement.expectedBodySha256) {
      if (body.interfaceMajor !== requirement.interfaceMajor) {
        return settle("INTERFACE_CONFLICT", `skill ${requirement.name} changed interface major without promotion`);
      }
      if (requirement.promotionRef === null) {
        return settle("DIGEST_CONFLICT", `skill ${requirement.name} changed body without promotion evidence`);
      }
      if (!SAFE_ID.test(requirement.promotionRef)) {
        return settle("DIGEST_CONFLICT", `skill ${requirement.name} has an unusable promotion reference`);
      }
    } else if (body.interfaceMajor !== requirement.interfaceMajor) {
      return settle("INTERFACE_CONFLICT", `skill ${requirement.name} declares a different interface major`);
    }
    selected.push(body);
  }
  lifecycle.push("SKILLS_SELECTED", "INTERFACES_CHECKED");

  // INT-SKILL-002 from the other side needs no re-check: `selected` is built by walking
  // `requirements.required` and nothing else, so an unrequested skill has no way in. A loop
  // asserting that afterwards would be dead code -- disabling it changes no control, which is
  // how the first version of this file was caught.
  const bundle = [...selected].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const skill of bundle) {
    assertPortable(skill.name, `skill ${skill.name} name`);
    assertPortable(skill.bodySha256, `skill ${skill.name} digest`);
  }
  lifecycle.push("BUNDLE_RENDERED");

  const claude = projectSkills(bundle, "claude-code");
  lifecycle.push("CLAUDE_PROJECTED");
  const codex = projectSkills(bundle, "codex-cli");
  lifecycle.push("CODEX_PROJECTED");
  // No parity comparison here: both projections come from `projectSkills` over the same
  // bundle, so they cannot differ, and a comparison that cannot fail is dead code. Parity is
  // enforced where it can actually be violated -- `verifyBinding` recomputes both projections
  // from the selected bodies, which is what catches a binding tampered with after the fact.
  lifecycle.push("BINDING_LOCKED");
  return {
    lifecycle,
    outcome: "BINDING_LOCKED",
    detail: `bound ${bundle.length} skill(s)`,
    binding: {
      schema: SKILL_BINDING_SCHEMA,
      consumerId: requirements.consumerId,
      source: source.release,
      selected: bundle,
      bundleDigest: digest(bundle),
      projections: [claude, codex],
    },
  };
}

// INT-SKILL-005 and INT-SKILL-006. Verification uses the binding alone: no sibling checkout,
// no network, no filesystem. Everything it needs is inside the bytes it was handed.
export function verifyBinding(binding: SkillBinding): { ok: boolean; detail: string } {
  if (binding.schema !== SKILL_BINDING_SCHEMA) return { ok: false, detail: "unsupported binding schema" };
  if (digest(binding.selected) !== binding.bundleDigest) return { ok: false, detail: "bundle digest does not match its bodies" };
  // One rule, not two: requiring the sorted host list to be exactly these two already implies
  // there are exactly two of them. A separate length check would be dead.
  const hosts = binding.projections.map((projection) => projection.host).sort().join(",");
  if (hosts !== "claude-code,codex-cli") return { ok: false, detail: "the binding does not cover both hosts exactly once" };
  for (const projection of binding.projections) {
    const expected = projectSkills(binding.selected, projection.host);
    if (projection.projectionDigest !== expected.projectionDigest) {
      return { ok: false, detail: `the ${projection.host} projection does not match the selected bodies` };
    }
    if (canonical(projection.entries) !== canonical(expected.entries)) {
      return { ok: false, detail: `the ${projection.host} projection entries were altered` };
    }
  }
  return { ok: true, detail: `binding verified against ${binding.selected.length} selected body(ies)` };
}

// INT-SKILL-008. Removal leaves no orphan: the projections are regenerated from the selected
// set, so a name that left the requirements is absent from both hosts rather than lingering.
export function orphanProjections(next: SkillBinding): string[] {
  // One rule: anything a projection still names that the selected set no longer contains. A
  // second pass over the previous binding would be strictly narrower -- every name it could
  // find, this already finds -- so it would be dead code.
  const kept = new Set(next.selected.map((skill) => skill.name));
  const orphans = new Set<string>();
  for (const projection of next.projections) {
    for (const entry of projection.entries) if (!kept.has(entry.name)) orphans.add(entry.name);
  }
  return [...orphans].sort();
}
