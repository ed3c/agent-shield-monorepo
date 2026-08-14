import {
  CONSUMER_LOCK_SCHEMA,
  CONSUMER_REQUIREMENTS_SCHEMA,
  EVIDENCE_LADDER,
  assertEvidenceLadder,
  assertIntegrationTransition,
  externalInterfaceDigest,
  integrationEvidenceForOutcome,
  planRollback,
  projectMcpTools,
  resolveClosure,
  validateConsumerLock,
  validateConsumerRequirements,
  validateReleaseModule,
  validateReleaseSubject,
  type ConsumerLock,
  type EvidenceRung,
  type IntegrationOutcome,
  type IntegrationState,
  type ReleaseModule,
} from "./index.ts";
import type { EvidenceState } from "../index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-FND ${message}`);
}

// A control that only asserts "something threw" also passes when a later line throws a
// TypeError for an unrelated reason, which makes a dead guard look load-bearing under a
// plant check. Every control names the message fragment its own rule produces.
function red(action: () => unknown, message: string, expected: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.includes(expected), `${message} threw "${text}" instead of a message containing "${expected}"`);
}

const COMMIT = "1".repeat(40);
const TREE = "2".repeat(40);
const DIGEST = "3".repeat(64);

function releaseValue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    repository: "https://github.com/ed3c/agent-shield-monorepo",
    commit: COMMIT,
    tree: TREE,
    releaseId: "agent-shield-module-set@0.1.0",
    releaseDigest: DIGEST,
    ...overrides,
  };
}

function moduleValue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "runtime-fabric",
    interfaceVersion: "1.0.0",
    manifestSha256: "a".repeat(64),
    roots: ["services/runtime-fabric"],
    provides: ["runtime.provider/v2"],
    requires: [],
    externalExposed: true,
    ...overrides,
  };
}

const RELEASE_MODULES: ReleaseModule[] = [
  validateReleaseModule(moduleValue()),
  validateReleaseModule(moduleValue({
    id: "bettor-consumer", roots: ["scripts/bootstrap-bettor.ts"],
    provides: ["bettor.consumer/v1"], requires: ["runtime.provider/v2"], externalExposed: false,
  })),
  validateReleaseModule(moduleValue({
    id: "document-ingest", roots: ["services/document-ingest"],
    provides: ["document.ingest/v1"], requires: [], externalExposed: false,
  })),
];

function requirementsValue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: CONSUMER_REQUIREMENTS_SCHEMA,
    consumerId: "bettor-arena",
    requestedModules: ["bettor-consumer"],
    requiredCapabilities: [],
    surfaces: ["claude-code", "mcp"],
    ...overrides,
  };
}

const GREEN_LIFECYCLE: IntegrationState[] = [
  "UNRESOLVED", "RELEASE_PINNED", "REQUIREMENTS_VALIDATED", "CLOSURE_RESOLVED", "CONFLICTS_CHECKED",
  "SKILLS_BOUND", "RUNTIME_BOUND", "SURFACES_GENERATED", "OFFLINE_VERIFIED", "ADAPTERS_PENDING",
];

function ladder(overrides: Partial<Record<EvidenceRung, EvidenceState>> = {}): Record<EvidenceRung, EvidenceState> {
  const result = {} as Record<EvidenceRung, EvidenceState>;
  for (const rung of EVIDENCE_LADDER) result[rung] = rung === "offline" ? "PASS" : "NOT_EXERCISED";
  return { ...result, ...overrides };
}

function lockValue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const selected = resolveClosure(RELEASE_MODULES, validateConsumerRequirements(requirementsValue()));
  const interfaceDigests: Record<string, string> = {};
  for (const module of selected) interfaceDigests[module.id] = externalInterfaceDigest(module);
  return {
    schema: CONSUMER_LOCK_SCHEMA,
    consumerId: "bettor-arena",
    release: releaseValue(),
    moduleIds: selected.map((module) => module.id).sort(),
    interfaceDigests,
    skillBindings: [{ skillId: "agent-shield.verify", origin: "consumer-projection", canonicalSha256: "b".repeat(64), ownerModuleId: "runtime-fabric" }],
    runtimeBindings: [{ profileId: "local-disposable", origin: "consumer-projection", canonicalSha256: "c".repeat(64), ownerModuleId: "runtime-fabric", scope: "local" }],
    mcpTools: [{ tool: "loopctl_verify", command: "verify", ownerModuleId: "runtime-fabric" }],
    lifecycle: [...GREEN_LIFECYCLE],
    outcome: "ADAPTERS_PENDING",
    state: "NOT_EXERCISED",
    evidence: ladder(),
    exclusions: ["bettor-execution", "origins", "production", "promotion"],
    ...overrides,
  };
}

// INT-FND-001 immutable identity
function immutableIdentity(): void {
  ok(validateReleaseSubject(releaseValue()).commit === COMMIT, "immutable release subject was rejected");
  for (const [label, overrides, expected] of [
    ["branch name as commit", { commit: "main" }, "commit must be a full 40-hex object ID"],
    ["HEAD as commit", { commit: "HEAD" }, "commit must be a full 40-hex object ID"],
    ["tag as tree", { tree: "v0.1.0" }, "tree must be a full 40-hex object ID"],
    ["short commit", { commit: "1".repeat(7) }, "commit must be a full 40-hex object ID"],
    ["credential-bearing repository", { repository: "https://user:pw@github.com/ed3c/agent-shield-monorepo" }, "credential-free immutable HTTPS identity"],
    ["query-bearing repository", { repository: "https://github.com/ed3c/agent-shield-monorepo?ref=main" }, "credential-free immutable HTTPS identity"],
    ["non-https repository", { repository: "git@github.com:ed3c/agent-shield-monorepo.git" }, "absolute repository URL"],
    ["mutable release id", { releaseId: "agent-shield-module-set@" }, "releaseId has an invalid format"],
  ] as const) {
    red(() => validateReleaseSubject(releaseValue(overrides)), label, expected);
  }
}

// INT-FND-002 closure
function closure(): void {
  const requirements = validateConsumerRequirements(requirementsValue());
  const selected = resolveClosure(RELEASE_MODULES, requirements);
  ok(selected.map((module) => module.id).join(",") === "bettor-consumer,runtime-fabric", "transitive closure was not resolved deterministically");
  ok(
    resolveClosure([...RELEASE_MODULES].reverse(), requirements).map((module) => module.id).join(",") === selected.map((module) => module.id).join(","),
    "closure depended on release ordering",
  );
  ok(!selected.some((module) => module.id === "document-ingest"), "closure pulled in an unrequested module");

  red(
    () => resolveClosure([RELEASE_MODULES[1]], requirements),
    "missing transitive provider",
    "no module in the release provides runtime.provider/v2, required by bettor-consumer",
  );
  red(
    () => resolveClosure(RELEASE_MODULES, validateConsumerRequirements(requirementsValue({ requestedModules: ["absent-module"] }))),
    "absent requested module",
    "requested module is absent from the release: absent-module",
  );
  red(
    () => resolveClosure([...RELEASE_MODULES, validateReleaseModule(moduleValue({ id: "runtime-fabric-2", roots: ["services/other"] }))], requirements),
    "duplicate capability provider",
    "is provided by both",
  );
  red(
    () => resolveClosure(RELEASE_MODULES, validateConsumerRequirements(requirementsValue({ requiredCapabilities: ["absent.capability/v1"] }))),
    "unprovided required capability",
    "no module in the release provides absent.capability/v1",
  );
  ok(
    resolveClosure(RELEASE_MODULES, validateConsumerRequirements(requirementsValue({ requiredCapabilities: ["document.ingest/v1"] })))
      .some((module) => module.id === "document-ingest"),
    "a required capability did not pull in its provider",
  );
}

// INT-FND-003 ownership and conflict
function ownershipConflict(): void {
  const requirements = validateConsumerRequirements(requirementsValue({ requestedModules: ["bettor-consumer", "shadow"] }));
  red(
    () => resolveClosure([...RELEASE_MODULES, validateReleaseModule(moduleValue({
      id: "shadow", roots: ["services/runtime-fabric/src"], provides: ["shadow.thing/v1"],
    }))], requirements),
    "nested path shadowing",
    "overlaps",
  );
  red(
    () => resolveClosure([...RELEASE_MODULES, validateReleaseModule(moduleValue({
      id: "shadow", roots: ["services/runtime-fabric"], provides: ["shadow.thing/v1"],
    }))], requirements),
    "identical path owned twice",
    "overlaps",
  );
  red(
    () => validateReleaseModule(moduleValue({ requires: ["runtime.provider/v2"] })),
    "module requiring what it provides",
    "both provides and requires",
  );
  red(
    () => validateConsumerLock(lockValue({
      skillBindings: [
        { skillId: "agent-shield.verify", origin: "consumer-projection", canonicalSha256: "b".repeat(64), ownerModuleId: "runtime-fabric" },
        { skillId: "agent-shield.verify", origin: "consumer-projection", canonicalSha256: "d".repeat(64), ownerModuleId: "bettor-consumer" },
      ],
    })),
    "one skill bound twice",
    "has more than one binding",
  );
}

// INT-FND-004 interface versus implementation
function interfaceVersusImplementation(): void {
  const base = validateReleaseModule(moduleValue());
  const refactored = validateReleaseModule(moduleValue({ manifestSha256: "f".repeat(64), roots: ["services/runtime-fabric", "services/runtime-fabric-internal"] }));
  ok(externalInterfaceDigest(base) === externalInterfaceDigest(refactored), "a private refactor changed the external digest");

  for (const [label, overrides] of [
    ["interface version", { interfaceVersion: "2.0.0" }],
    ["added capability", { provides: ["runtime.provider/v2", "runtime.extra/v1"] }],
    ["capability major version", { provides: ["runtime.provider/v3"] }],
    ["new requirement", { requires: ["document.ingest/v1"] }],
    ["exposure change", { externalExposed: false }],
  ] as const) {
    ok(
      externalInterfaceDigest(base) !== externalInterfaceDigest(validateReleaseModule(moduleValue(overrides))),
      `a breaking ${label} change did not move the external digest`,
    );
  }
}

// INT-FND-005 binding separation
function bindingSeparation(): void {
  red(
    () => validateConsumerLock(lockValue({
      skillBindings: [{ skillId: "agent-shield.verify", origin: "canonical", canonicalSha256: "b".repeat(64), ownerModuleId: "runtime-fabric" }],
    })),
    "consumer-local canonical skill",
    "declares a consumer-local canonical source",
  );
  red(
    () => validateConsumerLock(lockValue({
      runtimeBindings: [{ profileId: "local-disposable", origin: "canonical", canonicalSha256: "c".repeat(64), ownerModuleId: "runtime-fabric", scope: "local" }],
    })),
    "consumer-local canonical runtime profile",
    "declares a consumer-local canonical source",
  );
  red(
    () => validateConsumerLock(lockValue({
      skillBindings: [{ skillId: "agent-shield.verify", origin: "consumer-projection", canonicalSha256: "b".repeat(64), ownerModuleId: "document-ingest" }],
    })),
    "skill owned by an unselected module",
    "owned by an unselected module",
  );
  red(
    () => validateConsumerLock(lockValue({
      skillBindings: [{ skillId: "agent-shield.verify", origin: "consumer-projection", canonicalSha256: "b".repeat(64), ownerModuleId: "runtime-fabric", secret: "x" }],
    })),
    "extra field on a binding",
    "is not allowed",
  );
}

// INT-FND-006 default deny
function defaultDeny(): void {
  const tools = projectMcpTools([
    { name: "verify", ownerModuleId: "runtime-fabric", policyExposed: true },
    { name: "selftest", ownerModuleId: "runtime-fabric", policyExposed: true },
    { name: "internal-dump", ownerModuleId: "runtime-fabric", policyExposed: false },
  ]);
  ok(tools.map((entry) => entry.tool).join(",") === "loopctl_selftest,loopctl_verify", "default deny did not hold");

  for (const [label, command] of [
    ["generic shell", "exec-shell"],
    ["bare shell", "sh"],
    ["private command", "internal-dump"],
    ["live owner", "promote"],
    ["rollback owner", "rollback"],
    ["credential path", "login"],
  ] as const) {
    red(
      () => projectMcpTools([{ name: command, ownerModuleId: "runtime-fabric", policyExposed: true }]),
      `exposed ${label}`,
      "can never be exposed as an MCP tool",
    );
  }
  red(
    () => projectMcpTools([
      { name: "verify", ownerModuleId: "runtime-fabric", policyExposed: true },
      { name: "verify", ownerModuleId: "bettor-consumer", policyExposed: true },
    ]),
    "two commands projecting one tool",
    "is projected by more than one command",
  );
  red(
    () => validateConsumerLock(lockValue({ mcpTools: [{ tool: "loopctl_promote", command: "promote", ownerModuleId: "runtime-fabric" }] })),
    "never-exposed command inside a lock",
    "exposes a command that can never be exposed",
  );
}

// INT-FND-007 evidence ladder
function evidenceLadderRungs(): void {
  ok(EVIDENCE_LADDER.length === 7, "the evidence ladder lost a rung");
  assertEvidenceLadder(ladder());
  assertEvidenceLadder(ladder({ adapter: "PASS" }));
  for (const [label, overrides] of [
    ["live-carrier PASS above an unproven adapter", { "live-carrier": "PASS" }],
    ["adapter PASS above an unproven offline rung", { offline: "NOT_EXERCISED", adapter: "PASS" }],
    ["production PASS above the whole ladder", { production: "PASS" }],
    ["adapter PASS above a failed offline rung", { offline: "FAIL", adapter: "PASS" }],
  ] as const) {
    red(() => assertEvidenceLadder(ladder(overrides)), label, "claims PASS above an unproven rung");
  }

  for (const [outcome, evidence] of [
    ["ADAPTERS_PENDING", "NOT_EXERCISED"],
    ["ABSENT_RELEASE", "ABSENT"],
    ["ADAPTER_ABSENT", "ABSENT"],
    ["CAPABILITY_CONFLICT", "FAIL"],
    ["ROLLBACK_REFUSED_DRIFT", "FAIL"],
  ] as const) {
    ok(integrationEvidenceForOutcome(outcome as IntegrationOutcome) === evidence, `${outcome} projected as the wrong evidence state`);
  }
  // This foundation cannot project PASS at all: ADAPTERS_PENDING is the only non-failure
  // outcome it can reach, and it maps to NOT_EXERCISED.
  ok(
    (["ADAPTERS_PENDING", "ABSENT_RELEASE", "ADAPTER_ABSENT", "ORIGIN_ABSENT", "EQUIVALENCE_FAIL"] as const)
      .every((outcome) => integrationEvidenceForOutcome(outcome) !== "PASS"),
    "the integration foundation projected PASS",
  );

  red(() => validateConsumerLock(lockValue({ state: "PASS" })), "lock asserting its own PASS", "state does not match its outcome");
  red(
    () => validateConsumerLock(lockValue({ lifecycle: ["UNRESOLVED", "SKILLS_BOUND", "RUNTIME_BOUND", "SURFACES_GENERATED", "OFFLINE_VERIFIED", "ADAPTERS_PENDING"] })),
    "lifecycle skipping closure",
    "illegal transition UNRESOLVED -> SKILLS_BOUND",
  );
  red(
    () => assertIntegrationTransition("CLOSURE_RESOLVED", "SKILLS_BOUND"),
    "closure skipping the conflict check",
    "illegal transition CLOSURE_RESOLVED -> SKILLS_BOUND",
  );
  red(
    () => validateConsumerLock(lockValue({ lifecycle: [...GREEN_LIFECYCLE, "ORIGIN_ABSENT"] })),
    "transition out of a terminal outcome",
    "illegal transition ADAPTERS_PENDING -> ORIGIN_ABSENT",
  );
  red(
    () => validateConsumerLock(lockValue({ interfaceDigests: {} })),
    "lock missing an interface digest",
    "interfaceDigests is missing",
  );
}

// INT-FND-008 rollback
function rollback(): void {
  const current = validateConsumerLock(lockValue()) as ConsumerLock;
  const prior = validateConsumerLock(lockValue({
    release: releaseValue({ commit: "4".repeat(40), tree: "5".repeat(40), releaseId: "agent-shield-module-set@0.0.9", releaseDigest: "6".repeat(64) }),
    mcpTools: [],
    skillBindings: [],
  })) as ConsumerLock;

  const plan = planRollback(current, prior, current.release.releaseDigest);
  ok(plan.toRelease.releaseId === "agent-shield-module-set@0.0.9", "rollback did not name the exact prior release");
  ok(plan.removedTools.join(",") === "loopctl_verify", "rollback left an orphan tool projection");
  ok(plan.removedSkillIds.join(",") === "agent-shield.verify", "rollback left an orphan skill projection");

  red(() => planRollback(current, prior, "9".repeat(64)), "rollback onto a drifted target", "the target drifted from its lock");
  red(() => planRollback(current, current, current.release.releaseDigest), "rollback to the current release", "rollback target is the current release");
  red(
    () => planRollback(current, validateConsumerLock(lockValue({ consumerId: "other-consumer" })) as ConsumerLock, current.release.releaseDigest),
    "rollback across two consumers",
    "rollback crosses two consumers",
  );
}

immutableIdentity();
closure();
ownershipConflict();
interfaceVersusImplementation();
bindingSeparation();
defaultDeny();
evidenceLadderRungs();
rollback();

console.log("SELFTEST GREEN: INT-FND immutable identity, closure, ownership, interface-vs-implementation, binding separation, default deny, evidence ladder, rollback");
