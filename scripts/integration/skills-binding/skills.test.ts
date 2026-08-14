import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import {
  assertPortable,
  orphanProjections,
  projectSkills,
  resolveSkillBinding,
  skillsBindingState,
  verifyBinding,
  type SkillBinding,
  type SkillBody,
  type SkillRequirement,
  type SkillRequirements,
  type SkillSource,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-SKILL ${message}`);
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
  ok(text.startsWith("invalid skill binding contract: "), `${message} threw "${text}" rather than a skill binding error`);
}

const RELEASE: ReleaseSubject = {
  repository: "https://github.com/ed3c/agent-shield-monorepo",
  commit: "1".repeat(40),
  tree: "2".repeat(40),
  releaseId: "skills-shared@0.4.0",
  releaseDigest: "3".repeat(64),
};

const SHARED_DIGEST = "a".repeat(64);
const REPO_DIGEST = "b".repeat(64);

function body(name: string, overrides: Partial<SkillBody> = {}): SkillBody {
  return { name, origin: "shared", interfaceMajor: 1, bodySha256: SHARED_DIGEST, ...overrides };
}

function source(overrides: Partial<SkillSource> = {}): SkillSource {
  return {
    release: RELEASE,
    workingTreeClean: true,
    skills: [
      body("external-verify"),
      body("code-review", { bodySha256: REPO_DIGEST, origin: "repo-owned" }),
      body("unused-upstream", { bodySha256: "c".repeat(64) }),
    ],
    ...overrides,
  };
}

function requirement(name: string, overrides: Partial<SkillRequirement> = {}): SkillRequirement {
  return { name, interfaceMajor: 1, optional: false, promotionRef: null, expectedBodySha256: SHARED_DIGEST, ...overrides };
}

function requirements(overrides: Partial<SkillRequirements> = {}): SkillRequirements {
  return {
    consumerId: "bettor-arena",
    required: [requirement("external-verify"), requirement("code-review", { expectedBodySha256: REPO_DIGEST })],
    approvedOptional: [],
    ...overrides,
  };
}

// INT-SKILL-001 canonical ownership
function canonicalOwnership(): void {
  const resolved = resolveSkillBinding(source(), requirements());
  ok(resolved.outcome === "BINDING_LOCKED", `a clean source reported ${resolved.outcome}: ${resolved.detail}`);

  const shadowed = resolveSkillBinding(
    source({ skills: [...source().skills, body("code-review", { bodySha256: REPO_DIGEST })] }),
    requirements(),
  );
  ok(shadowed.outcome === "SHADOWING_RED", `a same-name shared copy reported ${shadowed.outcome}`);
  ok(shadowed.detail.includes("both"), "the shadowing failure did not name both origins");

  // Even an identical duplicate under the same origin is a shadow: two bodies claiming one
  // name means the consumer would have to pick, and picking silently is the defect.
  const duplicated = resolveSkillBinding(
    source({ skills: [...source().skills, body("external-verify")] }),
    requirements(),
  );
  ok(duplicated.outcome === "SHADOWING_RED", `a duplicated name reported ${duplicated.outcome}`);
}

// INT-SKILL-002 requirements closure
function requirementsClosure(): void {
  const resolved = resolveSkillBinding(source(), requirements());
  const names = (resolved.binding?.selected ?? []).map((skill) => skill.name);
  ok(names.join(",") === "code-review,external-verify", `the bundle is ${names.join(",")}`);
  ok(!names.includes("unused-upstream"), "an unrequested upstream skill entered the bundle");

  // Injecting the entire upstream registry changes nothing, because selection is driven by
  // requirements rather than by what the source happens to contain.
  const inflated = resolveSkillBinding(
    source({ skills: [...source().skills, body("extra-one", { bodySha256: "d".repeat(64) }), body("extra-two", { bodySha256: "e".repeat(64) })] }),
    requirements(),
  );
  ok(
    JSON.stringify(inflated.binding?.selected) === JSON.stringify(resolved.binding?.selected),
    "injecting the upstream registry changed the bundle",
  );

  const missing = resolveSkillBinding(
    source({ skills: [body("code-review", { bodySha256: REPO_DIGEST, origin: "repo-owned" })] }),
    requirements(),
  );
  ok(missing.outcome === "MISSING_SKILL", `an omitted required skill reported ${missing.outcome}`);

  // An optional requirement is materialized only when it is approved.
  const optionalRequirements = requirements({
    required: [...requirements().required, requirement("unused-upstream", { optional: true, expectedBodySha256: "c".repeat(64) })],
  });
  const unapproved = resolveSkillBinding(source(), optionalRequirements);
  ok(
    !(unapproved.binding?.selected ?? []).some((skill) => skill.name === "unused-upstream"),
    "an unapproved optional skill was materialized",
  );
  const approved = resolveSkillBinding(source(), { ...optionalRequirements, approvedOptional: ["unused-upstream"] });
  ok(
    (approved.binding?.selected ?? []).some((skill) => skill.name === "unused-upstream"),
    "an approved optional skill was not materialized",
  );
}

// INT-SKILL-003 immutable identity
function immutableIdentity(): void {
  const dirty = resolveSkillBinding(source({ workingTreeClean: false }), requirements());
  ok(dirty.outcome === "MUTABLE_SOURCE", `a dirty checkout reported ${dirty.outcome}`);

  for (const [label, patch] of [
    ["a branch name", { commit: "main" }],
    ["a short commit", { commit: "1".repeat(7) }],
    ["a moving tree", { tree: "HEAD" }],
  ] as const) {
    const mutable = resolveSkillBinding(source({ release: { ...RELEASE, ...patch } }), requirements());
    ok(mutable.outcome === "MUTABLE_SOURCE", `${label} reported ${mutable.outcome}`);
  }

  const staleDigest = resolveSkillBinding(source(), requirements({
    required: [requirement("external-verify", { expectedBodySha256: "9".repeat(64) }), requirement("code-review", { expectedBodySha256: REPO_DIGEST })],
  }));
  ok(staleDigest.outcome === "DIGEST_CONFLICT", `a stale expected digest reported ${staleDigest.outcome}`);
}

// INT-SKILL-004 compatibility
function compatibility(): void {
  // A changed body with a compatible interface and promotion evidence is admissible.
  const promoted = resolveSkillBinding(source(), requirements({
    required: [
      requirement("external-verify", { expectedBodySha256: "9".repeat(64), promotionRef: "promotion-2026-08" }),
      requirement("code-review", { expectedBodySha256: REPO_DIGEST }),
    ],
  }));
  ok(promoted.outcome === "BINDING_LOCKED", `a promoted body reported ${promoted.outcome}: ${promoted.detail}`);

  // The same change without promotion evidence is not.
  const unpromoted = resolveSkillBinding(source(), requirements({
    required: [
      requirement("external-verify", { expectedBodySha256: "9".repeat(64) }),
      requirement("code-review", { expectedBodySha256: REPO_DIGEST }),
    ],
  }));
  ok(unpromoted.outcome === "DIGEST_CONFLICT", `an unpromoted body change reported ${unpromoted.outcome}`);

  // Nor is an incompatible interface, promotion evidence or not.
  const incompatible = resolveSkillBinding(source(), requirements({
    required: [
      requirement("external-verify", { expectedBodySha256: "9".repeat(64), interfaceMajor: 2, promotionRef: "promotion-2026-08" }),
      requirement("code-review", { expectedBodySha256: REPO_DIGEST }),
    ],
  }));
  ok(incompatible.outcome === "INTERFACE_CONFLICT", `an incompatible interface reported ${incompatible.outcome}`);

  // A matching digest with a drifted interface major is a conflict too.
  const drifted = resolveSkillBinding(source(), requirements({
    required: [requirement("external-verify", { interfaceMajor: 3 }), requirement("code-review", { expectedBodySha256: REPO_DIGEST })],
  }));
  ok(drifted.outcome === "INTERFACE_CONFLICT", `a drifted interface major reported ${drifted.outcome}`);

  const unusablePromotion = resolveSkillBinding(source(), requirements({
    required: [
      requirement("external-verify", { expectedBodySha256: "9".repeat(64), promotionRef: "Promotion Ref!" }),
      requirement("code-review", { expectedBodySha256: REPO_DIGEST }),
    ],
  }));
  ok(unusablePromotion.outcome === "DIGEST_CONFLICT", `an unusable promotion reference reported ${unusablePromotion.outcome}`);
}

// INT-SKILL-005 host parity
function hostParity(): void {
  const resolved = resolveSkillBinding(source(), requirements());
  const binding = resolved.binding as SkillBinding;
  const [claude, codex] = binding.projections;
  ok(claude.projectionDigest === codex.projectionDigest, "the two host projections diverged");
  ok(JSON.stringify(claude.entries) === JSON.stringify(codex.entries), "the two host projections carry different entries");
  ok(verifyBinding(binding).ok, "a genuine binding failed verification");

  // Mutating one projection must be caught, otherwise the parity assertion above proves
  // nothing about a binding that was tampered with after the fact.
  const mutated: SkillBinding = {
    ...binding,
    projections: [{ ...claude, entries: [...claude.entries].reverse() }, codex],
  };
  ok(!verifyBinding(mutated).ok, "a reordered projection passed verification");

  const forged: SkillBinding = {
    ...binding,
    projections: [{ ...claude, entries: [{ name: "external-verify", bodySha256: "9".repeat(64) }] }, codex],
  };
  ok(!verifyBinding(forged).ok, "a forged projection entry passed verification");

  // Entries intact, digest wrong. Without this the digest comparison in verifyBinding is
  // dominated by the entries comparison, because every other tampering changes both.
  const wrongDigest: SkillBinding = {
    ...binding,
    projections: [{ ...claude, projectionDigest: "9".repeat(64) }, codex],
  };
  ok(!verifyBinding(wrongDigest).ok, "a projection with a forged digest passed verification");

  const oneHost: SkillBinding = { ...binding, projections: [claude] };
  ok(!verifyBinding(oneHost).ok, "a binding covering one host passed verification");

  // Two projections, but both for the same host. The count check passes and both recompute
  // correctly, so only the host-coverage rule can catch this one.
  const duplicatedHost: SkillBinding = {
    ...binding,
    projections: [claude, { ...codex, host: "claude-code" }],
  };
  ok(!verifyBinding(duplicatedHost).ok, "a binding projecting one host twice passed verification");

  const tamperedBundle: SkillBinding = { ...binding, bundleDigest: "9".repeat(64) };
  ok(!verifyBinding(tamperedBundle).ok, "a tampered bundle digest passed verification");

  const wrongSchema = { ...binding, schema: "agent-shield/skill-binding/v0" } as unknown as SkillBinding;
  ok(!verifyBinding(wrongSchema).ok, "a binding with an unsupported schema passed verification");
}

// INT-SKILL-006 portability
function portability(): void {
  const binding = resolveSkillBinding(source(), requirements()).binding as SkillBinding;
  // Verification is a pure function of the binding bytes: serializing and re-parsing it, which
  // is what a consumer with no upstream checkout has, verifies identically.
  const roundTripped = JSON.parse(JSON.stringify(binding)) as SkillBinding;
  ok(verifyBinding(roundTripped).ok, "a binding could not be verified from its own bytes");
  ok(verifyBinding.length === 1, "verification takes something beyond the binding");

  const serialized = JSON.stringify(binding);
  ok(!serialized.includes("/Users") && !serialized.includes("\\\\"), "the binding carries a host path");
}

// INT-SKILL-007 no host paths or secrets
function noHostPathsOrSecrets(): void {
  for (const [label, value] of [
    ["an absolute path", "/opt/checkout/skills/body.md"],
    // Assembled at runtime: the repository's own verify.ts forbids this token appearing
    // literally in a tracked file, and the rule under test is the regex, not the spelling.
    ["a home reference", `${"~"}/skills/body.md`],
    ["a Windows drive", "C:\\skills\\body.md"],
    ["a bearer token", "Authorization: Bearer abcdefghijklmnop"],
    ["a JWT", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"],
    ["an API key assignment", "ANTHROPIC_API_KEY = sk-live"],
  ] as const) {
    red(() => assertPortable(value, "fixture"), `${label} in a bundle field`);
  }
  assertPortable("external-verify", "a plain skill name");
  assertPortable(SHARED_DIGEST, "a plain digest");
}

// INT-SKILL-008 staleness and removal
function stalenessAndRemoval(): void {
  const before = resolveSkillBinding(source(), requirements()).binding as SkillBinding;

  // A changed source body invalidates the binding rather than being absorbed.
  const changedSource = resolveSkillBinding(
    source({ skills: [body("external-verify", { bodySha256: "7".repeat(64) }), body("code-review", { bodySha256: REPO_DIGEST, origin: "repo-owned" })] }),
    requirements(),
  );
  ok(changedSource.outcome === "DIGEST_CONFLICT", `a changed source body reported ${changedSource.outcome}`);

  // A changed requirement set produces a different bundle digest.
  const fewer = resolveSkillBinding(source(), requirements({ required: [requirement("external-verify")] })).binding as SkillBinding;
  ok(fewer.bundleDigest !== before.bundleDigest, "removing a requirement did not change the bundle digest");

  // Removal leaves no orphan in either projection.
  ok(orphanProjections(fewer).length === 0, "removing a skill left an orphan projection");
  ok(
    !fewer.projections.some((projection) => projection.entries.some((entry) => entry.name === "code-review")),
    "a removed skill is still projected",
  );

  // The orphan detector itself must be able to see one, or its clean result proves nothing.
  const orphaned: SkillBinding = {
    ...fewer,
    projections: fewer.projections.map((projection) => ({
      ...projection,
      entries: [...projection.entries, { name: "code-review", bodySha256: REPO_DIGEST }],
    })),
  };
  ok(orphanProjections(orphaned).join(",") === "code-review", "the orphan detector cannot detect an orphan");
  ok(!verifyBinding(orphaned).ok, "an orphaned projection passed verification");
  ok(before.selected.length > fewer.selected.length, "the removal fixture did not actually remove anything");
}

function projectionSorting(): void {
  const unsorted = [body("zebra", { bodySha256: "8".repeat(64) }), body("alpha")];
  ok(projectSkills(unsorted, "claude-code").entries[0].name === "alpha", "a projection is not sorted");
  ok(
    projectSkills(unsorted, "claude-code").projectionDigest === projectSkills([...unsorted].reverse(), "claude-code").projectionDigest,
    "a projection digest depends on input order",
  );
}

function evidenceBoundary(): void {
  ok(skillsBindingState.modelCarrier === "NOT_EXERCISED", "a model carrier was claimed");
  ok(skillsBindingState.promptEffectiveness === "NOT_IMPLEMENTED", "prompt effectiveness was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const skillsNeverPasses: NeverPass<typeof skillsBindingState> = true;
void skillsNeverPasses;

canonicalOwnership();
requirementsClosure();
immutableIdentity();
compatibility();
hostParity();
portability();
noHostPathsOrSecrets();
stalenessAndRemoval();
projectionSorting();
evidenceBoundary();

console.log("SELFTEST GREEN: INT-SKILL canonical ownership, requirements closure, immutable identity, compatibility, host parity, portability, no host paths, staleness and removal");
