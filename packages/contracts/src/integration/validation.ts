import { createHash } from "node:crypto";
import type { EvidenceState } from "../index.ts";
import { assertEvidenceLadder, integrationEvidenceForOutcome, validateIntegrationLifecycle } from "./state-machine.ts";
import {
  CONSUMER_LOCK_SCHEMA,
  CONSUMER_REQUIREMENTS_SCHEMA,
  EVIDENCE_LADDER,
  ROLLBACK_PLAN_SCHEMA,
  type CliCommand,
  type ConsumerLock,
  type ConsumerRequirements,
  type EvidenceRung,
  type IntegrationState,
  type McpToolProjection,
  type ReleaseModule,
  type ReleaseSubject,
  type RollbackPlan,
  type RuntimeBinding,
  type SkillBinding,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const SAFE_CAPABILITY = /^[a-z0-9][a-z0-9._-]*(?:\.[a-z0-9._-]+)*\/v[0-9]+$/;
const SAFE_TOOL = /^[a-z][a-z0-9_]{0,63}$/;
const SAFE_COMMAND = /^[a-z][a-z0-9-]{0,63}(?: [a-z][a-z0-9-]{0,63}){0,3}$/;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// INT-FND-001 needs no denylist of moving names. A release identity must be a full 40-hex
// object ID, and `main`, `HEAD`, `latest` and every tag fail that by construction. A denylist
// on top would be dead code: removing it changes no control.

// INT-FND-006. Command shapes that must never reach MCP even if policy marks them exposed:
// a generic shell, a private internal command, or something that owns a live subject.
const NEVER_EXPOSED = /(?:^|[ -])(?:sh|bash|zsh|exec|eval|run-shell|shell|internal|private|debug|admin|promote|rollback|publish|release|secret|credential|login|token)(?:$|[ -])/;

export function fail(message: string): never {
  throw new Error(`invalid integration contract: ${message}`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${name} must be a plain own-key object`);
  for (const key of Object.keys(value)) {
    if (key.length === 0 || key.length > 128 || /\p{Cc}/u.test(key) || FORBIDDEN_OBJECT_KEYS.has(key)) {
      fail(`${name} contains an unsafe object key`);
    }
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) fail(`${name}.${key} is not allowed`);
  for (const key of allowed) if (!Object.hasOwn(value, key)) fail(`${name}.${key} is required`);
}

function text(value: unknown, name: string, pattern?: RegExp, maxLength = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    fail(`${name} must be a non-empty bounded string`);
  }
  if (/\p{Cc}/u.test(value)) fail(`${name} contains control characters`);
  if (pattern && !pattern.test(value)) fail(`${name} has an invalid format`);
  return value;
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") fail(`${name} must be a boolean`);
  return value;
}

function enumValue<T extends string>(value: unknown, name: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail(`${name} is invalid`);
  return value as T;
}

function sortedUnique(
  value: unknown,
  name: string,
  maxItems: number,
  validate: (entry: string, index: number) => void,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(`${name} must be an array of at most ${maxItems} items`);
  const result = value.map((entry, index) => {
    const item = text(entry, `${name}[${index}]`, undefined, 256);
    validate(item, index);
    return item;
  });
  if (new Set(result).size !== result.length) fail(`${name} contains duplicates`);
  return result.sort();
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

export function validateReleaseSubject(value: unknown, name = "release"): ReleaseSubject {
  const release = record(value, name);
  exactKeys(release, ["repository", "commit", "tree", "releaseId", "releaseDigest"], name);
  const repository = text(release.repository, `${name}.repository`, undefined, 256);
  let parsed: URL;
  try {
    parsed = new URL(repository);
  } catch {
    fail(`${name}.repository must be an absolute repository URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.port) {
    fail(`${name}.repository must be a credential-free immutable HTTPS identity`);
  }
  if (!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(parsed.pathname)) {
    fail(`${name}.repository must identify one portable repository`);
  }
  const commit = text(release.commit, `${name}.commit`, undefined, 64);
  const tree = text(release.tree, `${name}.tree`, undefined, 64);
  for (const [label, ref] of [["commit", commit], ["tree", tree]] as const) {
    if (!GIT_OID.test(ref)) fail(`${name}.${label} must be a full 40-hex object ID`);
  }
  return {
    repository,
    commit,
    tree,
    releaseId: text(release.releaseId, `${name}.releaseId`, /^[a-z0-9][a-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._+-]*$/, 128),
    releaseDigest: text(release.releaseDigest, `${name}.releaseDigest`, SHA_256, 64),
  };
}

export function validateReleaseModule(value: unknown, name = "module"): ReleaseModule {
  const module = record(value, name);
  exactKeys(module, ["id", "interfaceVersion", "manifestSha256", "roots", "provides", "requires", "externalExposed"], name);
  const provides = sortedUnique(module.provides, `${name}.provides`, 32, (entry, index) => {
    if (!SAFE_CAPABILITY.test(entry)) fail(`${name}.provides[${index}] must be a versioned capability`);
  });
  const requires = sortedUnique(module.requires, `${name}.requires`, 32, (entry, index) => {
    if (!SAFE_CAPABILITY.test(entry)) fail(`${name}.requires[${index}] must be a versioned capability`);
  });
  for (const capability of requires) {
    if (provides.includes(capability)) fail(`${name} both provides and requires ${capability}`);
  }
  return {
    id: text(module.id, `${name}.id`, SAFE_ID, 128),
    interfaceVersion: text(module.interfaceVersion, `${name}.interfaceVersion`, SAFE_VERSION, 64),
    manifestSha256: text(module.manifestSha256, `${name}.manifestSha256`, SHA_256, 64),
    roots: sortedUnique(module.roots, `${name}.roots`, 32, (entry, index) => {
      if (entry.startsWith("/") || entry.includes("..") || entry.includes("\\")) {
        fail(`${name}.roots[${index}] must be a normalized repository-relative path`);
      }
    }),
    provides,
    requires,
    externalExposed: bool(module.externalExposed, `${name}.externalExposed`),
  };
}

// INT-FND-004. The external digest covers the external surface and nothing else. A private
// refactor moves manifestSha256 and roots without moving this; a schema, capability or
// exposure change moves it.
export function externalInterfaceDigest(module: ReleaseModule): string {
  return createHash("sha256")
    .update(canonical({
      id: module.id,
      interfaceVersion: module.interfaceVersion,
      provides: [...module.provides].sort(),
      requires: [...module.requires].sort(),
      externalExposed: module.externalExposed,
    }))
    .digest("hex");
}

export function validateConsumerRequirements(value: unknown): ConsumerRequirements {
  const requirements = record(value, "requirements");
  exactKeys(requirements, ["schema", "consumerId", "requestedModules", "requiredCapabilities", "surfaces"], "requirements");
  if (requirements.schema !== CONSUMER_REQUIREMENTS_SCHEMA) fail("requirements.schema is unsupported");
  const requestedModules = sortedUnique(requirements.requestedModules, "requirements.requestedModules", 64, (entry, index) => {
    if (!SAFE_ID.test(entry)) fail(`requirements.requestedModules[${index}] is invalid`);
  });
  if (requestedModules.length === 0) fail("requirements.requestedModules must not be empty");
  return {
    schema: CONSUMER_REQUIREMENTS_SCHEMA,
    consumerId: text(requirements.consumerId, "requirements.consumerId", SAFE_ID, 128),
    requestedModules,
    requiredCapabilities: sortedUnique(requirements.requiredCapabilities, "requirements.requiredCapabilities", 64, (entry, index) => {
      if (!SAFE_CAPABILITY.test(entry)) fail(`requirements.requiredCapabilities[${index}] must be a versioned capability`);
    }),
    surfaces: (sortedUnique(requirements.surfaces, "requirements.surfaces", 3, (entry, index) => {
      if (!["claude-code", "codex-cli", "mcp"].includes(entry)) fail(`requirements.surfaces[${index}] is invalid`);
    }) as ConsumerRequirements["surfaces"]),
  };
}

// INT-FND-002 and INT-FND-003. Resolve the transitive closure deterministically. Exactly one
// module may provide a capability, every required capability must be provided, and no two
// selected modules may own the same repository path.
export function resolveClosure(
  modules: readonly ReleaseModule[],
  requirements: ConsumerRequirements,
): ReleaseModule[] {
  const byId = new Map<string, ReleaseModule>();
  const providerOf = new Map<string, string>();
  for (const module of modules) {
    if (byId.has(module.id)) fail(`duplicate module ID in the release: ${module.id}`);
    byId.set(module.id, module);
    for (const capability of module.provides) {
      const owner = providerOf.get(capability);
      if (owner !== undefined) fail(`capability ${capability} is provided by both ${owner} and ${module.id}`);
      providerOf.set(capability, module.id);
    }
  }

  const selected = new Map<string, ReleaseModule>();
  const queue = [...requirements.requestedModules];
  for (const capability of requirements.requiredCapabilities) {
    const owner = providerOf.get(capability);
    if (owner === undefined) fail(`no module in the release provides ${capability}`);
    queue.push(owner);
  }
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (selected.has(id)) continue;
    const module = byId.get(id);
    if (module === undefined) fail(`requested module is absent from the release: ${id}`);
    selected.set(id, module);
    for (const capability of module.requires) {
      const owner = providerOf.get(capability);
      if (owner === undefined) fail(`no module in the release provides ${capability}, required by ${id}`);
      queue.push(owner);
    }
  }

  const ownerOfPath = new Map<string, string>();
  for (const module of selected.values()) {
    for (const root of module.roots) {
      for (const [existing, owner] of ownerOfPath) {
        if (existing === root || existing.startsWith(`${root}/`) || root.startsWith(`${existing}/`)) {
          fail(`path ${root} of ${module.id} overlaps ${existing} of ${owner}`);
        }
      }
      ownerOfPath.set(root, module.id);
    }
  }

  return [...selected.values()].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

export function validateSkillBinding(value: unknown, name = "skillBinding"): SkillBinding {
  const binding = record(value, name);
  exactKeys(binding, ["skillId", "origin", "canonicalSha256", "ownerModuleId"], name);
  return {
    skillId: text(binding.skillId, `${name}.skillId`, SAFE_ID, 128),
    origin: enumValue(binding.origin, `${name}.origin`, ["canonical", "consumer-projection"] as const),
    canonicalSha256: text(binding.canonicalSha256, `${name}.canonicalSha256`, SHA_256, 64),
    ownerModuleId: text(binding.ownerModuleId, `${name}.ownerModuleId`, SAFE_ID, 128),
  };
}

export function validateRuntimeBinding(value: unknown, name = "runtimeBinding"): RuntimeBinding {
  const binding = record(value, name);
  exactKeys(binding, ["profileId", "origin", "canonicalSha256", "ownerModuleId", "scope"], name);
  return {
    profileId: text(binding.profileId, `${name}.profileId`, SAFE_ID, 128),
    origin: enumValue(binding.origin, `${name}.origin`, ["canonical", "consumer-projection"] as const),
    canonicalSha256: text(binding.canonicalSha256, `${name}.canonicalSha256`, SHA_256, 64),
    ownerModuleId: text(binding.ownerModuleId, `${name}.ownerModuleId`, SAFE_ID, 128),
    scope: enumValue(binding.scope, `${name}.scope`, ["local", "cloud"] as const),
  };
}

// INT-FND-003 and INT-FND-005. One owner per skill, and the consumer holds projections only:
// a second canonical copy on the consumer side is the shadowing this rule exists to stop.
export function assertSkillBindings(bindings: readonly SkillBinding[], selectedIds: ReadonlySet<string>): void {
  const seen = new Set<string>();
  for (const binding of bindings) {
    if (seen.has(binding.skillId)) fail(`skill ${binding.skillId} has more than one binding`);
    seen.add(binding.skillId);
    if (!selectedIds.has(binding.ownerModuleId)) fail(`skill ${binding.skillId} is owned by an unselected module`);
    if (binding.origin !== "consumer-projection") {
      fail(`skill ${binding.skillId} declares a consumer-local canonical source`);
    }
  }
}

export function assertRuntimeBindings(bindings: readonly RuntimeBinding[], selectedIds: ReadonlySet<string>): void {
  const seen = new Set<string>();
  for (const binding of bindings) {
    const key = `${binding.profileId} ${binding.scope}`;
    if (seen.has(key)) fail(`runtime profile ${binding.profileId} has more than one ${binding.scope} binding`);
    seen.add(key);
    if (!selectedIds.has(binding.ownerModuleId)) fail(`runtime profile ${binding.profileId} is owned by an unselected module`);
    if (binding.origin !== "consumer-projection") {
      fail(`runtime profile ${binding.profileId} declares a consumer-local canonical source`);
    }
  }
}

export function validateCliCommand(value: unknown, name = "command"): CliCommand {
  const command = record(value, name);
  exactKeys(command, ["name", "ownerModuleId", "policyExposed"], name);
  return {
    name: text(command.name, `${name}.name`, SAFE_COMMAND, 256),
    ownerModuleId: text(command.ownerModuleId, `${name}.ownerModuleId`, SAFE_ID, 128),
    policyExposed: bool(command.policyExposed, `${name}.policyExposed`),
  };
}

// INT-FND-006. Default deny: the projection is derived from the command catalog, never
// supplied. A command that policy did not expose simply produces no tool, and a command whose
// name reads as shell, private or live-owner is refused even when policy marks it exposed.
export function projectMcpTools(commands: readonly CliCommand[]): McpToolProjection[] {
  const tools = new Map<string, McpToolProjection>();
  for (const command of commands) {
    if (!command.policyExposed) continue;
    if (NEVER_EXPOSED.test(command.name)) fail(`command "${command.name}" can never be exposed as an MCP tool`);
    const tool = `loopctl_${command.name.replace(/[ -]/g, "_")}`;
    if (!SAFE_TOOL.test(tool)) fail(`command "${command.name}" does not project to a portable tool name`);
    if (tools.has(tool)) fail(`tool ${tool} is projected by more than one command`);
    tools.set(tool, { tool, command: command.name, ownerModuleId: command.ownerModuleId });
  }
  return [...tools.values()].sort((left, right) => (left.tool < right.tool ? -1 : left.tool > right.tool ? 1 : 0));
}

function evidenceLadder(value: unknown, name: string): Record<EvidenceRung, EvidenceState> {
  const evidence = record(value, name);
  exactKeys(evidence, EVIDENCE_LADDER, name);
  const result = {} as Record<EvidenceRung, EvidenceState>;
  for (const rung of EVIDENCE_LADDER) {
    result[rung] = enumValue(evidence[rung], `${name}.${rung}`, ["PASS", "FAIL", "ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED"] as const);
  }
  assertEvidenceLadder(result);
  return result;
}

export function validateConsumerLock(value: unknown): ConsumerLock {
  const lock = record(value, "consumerLock");
  exactKeys(
    lock,
    ["schema", "consumerId", "release", "moduleIds", "interfaceDigests", "skillBindings", "runtimeBindings", "mcpTools", "lifecycle", "outcome", "state", "evidence", "exclusions"],
    "consumerLock",
  );
  if (lock.schema !== CONSUMER_LOCK_SCHEMA) fail("consumerLock.schema is unsupported");
  if (!Array.isArray(lock.lifecycle)) fail("consumerLock.lifecycle must be an array");
  const outcome = validateIntegrationLifecycle(lock.lifecycle as IntegrationState[]);
  if (lock.outcome !== outcome) fail("consumerLock.outcome does not match its own lifecycle");
  if (lock.state !== integrationEvidenceForOutcome(outcome)) fail("consumerLock.state does not match its outcome");

  const moduleIds = sortedUnique(lock.moduleIds, "consumerLock.moduleIds", 64, (entry, index) => {
    if (!SAFE_ID.test(entry)) fail(`consumerLock.moduleIds[${index}] is invalid`);
  });
  const digests = record(lock.interfaceDigests, "consumerLock.interfaceDigests");
  const interfaceDigests: Record<string, string> = {};
  for (const id of moduleIds) {
    if (!Object.hasOwn(digests, id)) fail(`consumerLock.interfaceDigests is missing ${id}`);
    interfaceDigests[id] = text(digests[id], `consumerLock.interfaceDigests.${id}`, SHA_256, 64);
  }
  for (const key of Object.keys(digests)) {
    if (!moduleIds.includes(key)) fail(`consumerLock.interfaceDigests.${key} is not a locked module`);
  }

  const selected = new Set(moduleIds);
  const skillBindings = (Array.isArray(lock.skillBindings) ? lock.skillBindings : fail("consumerLock.skillBindings must be an array"))
    .map((entry, index) => validateSkillBinding(entry, `consumerLock.skillBindings[${index}]`));
  assertSkillBindings(skillBindings, selected);
  const runtimeBindings = (Array.isArray(lock.runtimeBindings) ? lock.runtimeBindings : fail("consumerLock.runtimeBindings must be an array"))
    .map((entry, index) => validateRuntimeBinding(entry, `consumerLock.runtimeBindings[${index}]`));
  assertRuntimeBindings(runtimeBindings, selected);

  const mcpTools = (Array.isArray(lock.mcpTools) ? lock.mcpTools : fail("consumerLock.mcpTools must be an array"))
    .map((entry, index) => {
      const projection = record(entry, `consumerLock.mcpTools[${index}]`);
      exactKeys(projection, ["tool", "command", "ownerModuleId"], `consumerLock.mcpTools[${index}]`);
      const name = text(projection.command, `consumerLock.mcpTools[${index}].command`, SAFE_COMMAND, 256);
      if (NEVER_EXPOSED.test(name)) fail(`consumerLock.mcpTools[${index}] exposes a command that can never be exposed`);
      const owner = text(projection.ownerModuleId, `consumerLock.mcpTools[${index}].ownerModuleId`, SAFE_ID, 128);
      if (!selected.has(owner)) fail(`consumerLock.mcpTools[${index}] is owned by an unselected module`);
      return { tool: text(projection.tool, `consumerLock.mcpTools[${index}].tool`, SAFE_TOOL, 64), command: name, ownerModuleId: owner };
    });
  if (new Set(mcpTools.map((entry) => entry.tool)).size !== mcpTools.length) fail("consumerLock.mcpTools contains duplicate tools");

  return {
    schema: CONSUMER_LOCK_SCHEMA,
    consumerId: text(lock.consumerId, "consumerLock.consumerId", SAFE_ID, 128),
    release: validateReleaseSubject(lock.release, "consumerLock.release"),
    moduleIds,
    interfaceDigests,
    skillBindings,
    runtimeBindings,
    mcpTools,
    lifecycle: [...(lock.lifecycle as IntegrationState[])],
    outcome,
    state: integrationEvidenceForOutcome(outcome),
    evidence: evidenceLadder(lock.evidence, "consumerLock.evidence"),
    exclusions: sortedUnique(lock.exclusions, "consumerLock.exclusions", 32, (entry, index) => {
      if (!SAFE_ID.test(entry)) fail(`consumerLock.exclusions[${index}] is invalid`);
    }),
  };
}

// INT-FND-008. A rollback names the exact prior release, refuses to run when the observed
// target has drifted from the lock it claims to restore, and removes every projection the
// prior lock did not have.
export function planRollback(
  current: ConsumerLock,
  prior: ConsumerLock,
  observedCurrentReleaseDigest: string,
): RollbackPlan {
  if (current.consumerId !== prior.consumerId) fail("rollback crosses two consumers");
  if (current.release.releaseDigest === prior.release.releaseDigest) fail("rollback target is the current release");
  if (observedCurrentReleaseDigest !== current.release.releaseDigest) {
    throw new Error("invalid integration contract: rollback refused, the target drifted from its lock");
  }
  const priorTools = new Set(prior.mcpTools.map((entry) => entry.tool));
  const priorSkills = new Set(prior.skillBindings.map((entry) => entry.skillId));
  return {
    schema: ROLLBACK_PLAN_SCHEMA,
    consumerId: current.consumerId,
    fromRelease: current.release,
    toRelease: prior.release,
    removedTools: current.mcpTools.map((entry) => entry.tool).filter((tool) => !priorTools.has(tool)).sort(),
    removedSkillIds: current.skillBindings.map((entry) => entry.skillId).filter((skill) => !priorSkills.has(skill)).sort(),
    detail: `rollback ${current.release.releaseId} to ${prior.release.releaseId}`,
  };
}
