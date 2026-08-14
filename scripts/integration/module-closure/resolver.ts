import { createHash } from "node:crypto";
import { validateReleaseSubject, type ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import {
  CLOSURE_LOCK_SCHEMA,
  type ClosureRequirements,
  type ClosureResult,
  type ClosureState,
  type ComponentManifest,
  type InterfaceSignature,
  type ModuleManifest,
  type SelectedComponent,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_CAPABILITY = /^[a-z0-9][a-z0-9._-]*(?:\.[a-z0-9._-]+)*\/v[0-9]+$/;
// INT-CLOSURE-006. A tracked file is repository-relative, normalized and outside every
// runtime, temp and owner-checkout location. This is an allowlist on shape plus an explicit
// exclusion of the directories that only exist on a developer's machine.
const TRACKED_FILE = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*\.[a-z0-9]+$/;
const NEVER_TRACKED = /^(?:node_modules|\.git|dist|build|coverage|tmp|\.cache|\.claude)\//;

export function fail(message: string): never {
  throw new Error(`invalid closure contract: ${message}`);
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

// INT-CLOSURE-007. A module's digest covers its own manifest and component digests and
// nothing else, so a change to an unrelated module cannot stale it -- and repository HEAD is
// deliberately not an input.
export function moduleDigest(module: ModuleManifest): string {
  return digest({
    id: module.id,
    interfaceVersion: module.interfaceVersion,
    manifestSha256: module.manifestSha256,
    provides: [...module.provides].map((entry) => `${entry.capability}:${entry.exclusive}`).sort(),
    requires: [...module.requires].sort(),
    components: module.components
      .map((component) => `${component.id}:${componentDigest(component)}`)
      .sort(),
    signatures: module.signatures.map((signature) => signatureKey(signature)).sort(),
  });
}

export function componentDigest(component: ComponentManifest): string {
  return digest({
    id: component.id,
    visibility: component.visibility,
    optional: component.optional,
    files: [...component.files].sort().map((file) => `${file}:${component.fileDigests[file] ?? "absent"}`),
  });
}

function signatureKey(signature: InterfaceSignature): string {
  return canonical({
    capability: signature.capability,
    majorVersion: signature.majorVersion,
    inputDigest: signature.inputDigest,
    outputDigest: signature.outputDigest,
    exitCodes: [...signature.exitCodes].sort((left, right) => left - right),
    effects: [...signature.effects].sort(),
  });
}

function assertManifest(module: ModuleManifest): void {
  if (!SAFE_ID.test(module.id)) fail(`module id ${module.id} is invalid`);
  if (!SHA_256.test(module.manifestSha256)) fail(`module ${module.id} has no manifest digest`);
  for (const declaration of module.provides) {
    if (!SAFE_CAPABILITY.test(declaration.capability)) fail(`module ${module.id} provides an invalid capability`);
  }
  for (const capability of module.requires) {
    if (!SAFE_CAPABILITY.test(capability)) fail(`module ${module.id} requires an invalid capability`);
  }
  for (const component of module.components) {
    if (!SAFE_ID.test(component.id)) fail(`module ${module.id} has an invalid component id`);
    for (const file of component.files) {
      if (!TRACKED_FILE.test(file)) fail(`component ${component.id} tracks a non-repository-relative file: ${file}`);
      if (NEVER_TRACKED.test(file)) fail(`component ${component.id} tracks a runtime or checkout path: ${file}`);
      // INT-CLOSURE-008. A file without a digest cannot be pinned, so it cannot be locked.
      if (!SHA_256.test(component.fileDigests[file] ?? "")) fail(`component ${component.id} has no digest for ${file}`);
    }
    const declared = Object.keys(component.fileDigests).sort().join(",");
    if (declared !== [...component.files].sort().join(",")) {
      fail(`component ${component.id} declares digests for files it does not track`);
    }
  }
}

interface Resolution {
  selected: Map<string, ModuleManifest>;
  owners: Map<string, string>;
}

// INT-CLOSURE-002 and INT-CLOSURE-003. Expand the transitive closure while detecting cycles
// and refusing a second provider for an exclusive capability.
function expand(
  catalog: Map<string, ModuleManifest>,
  roots: readonly string[],
  lifecycle: ClosureState[],
): Resolution | ClosureState {
  const owners = new Map<string, string>();
  const exclusive = new Set<string>();
  for (const module of catalog.values()) {
    for (const declaration of module.provides) {
      const existing = owners.get(declaration.capability);
      if (existing !== undefined) return "DUPLICATE_PROVIDER";
      owners.set(declaration.capability, module.id);
      if (declaration.exclusive) exclusive.add(declaration.capability);
    }
  }

  const selected = new Map<string, ModuleManifest>();
  const visiting = new Set<string>();

  const visit = (id: string): ClosureState | null => {
    if (selected.has(id)) return null;
    // INT-CLOSURE-002's cycle case: a module already on the current path is a dependency loop,
    // which must fail rather than resolve to whichever order the walk happened to take.
    if (visiting.has(id)) return "CYCLE";
    const module = catalog.get(id);
    if (module === undefined) return "MISSING_MODULE";
    visiting.add(id);
    for (const capability of [...module.requires].sort()) {
      const owner = owners.get(capability);
      if (owner === undefined) return "MISSING_CAPABILITY";
      const nested = visit(owner);
      if (nested !== null) return nested;
    }
    visiting.delete(id);
    selected.set(id, module);
    return null;
  };

  for (const root of [...roots].sort()) {
    const blocked = visit(root);
    if (blocked !== null) return blocked;
  }
  lifecycle.push("DEPENDENCIES_EXPANDED", "CAPABILITIES_RESOLVED");

  // An exclusive capability may only be provided by a selected module once, which is already
  // guaranteed above, but a second *selected* provider of the same capability would also be a
  // conflict if the catalog ever allowed aliasing.
  const selectedOwners = new Map<string, string>();
  for (const module of selected.values()) {
    for (const declaration of module.provides) {
      if (!exclusive.has(declaration.capability)) continue;
      const existing = selectedOwners.get(declaration.capability);
      if (existing !== undefined && existing !== module.id) return "DUPLICATE_PROVIDER";
      selectedOwners.set(declaration.capability, module.id);
    }
  }

  return { selected, owners };
}

export function resolveClosureLock(
  release: ReleaseSubject,
  catalog: readonly ModuleManifest[],
  requirements: ClosureRequirements,
): ClosureResult {
  const lifecycle: ClosureState[] = ["UNRESOLVED"];
  const settle = (outcome: ClosureState, detail: string): ClosureResult =>
    ({ lifecycle: [...lifecycle, outcome], outcome: outcome as ClosureResult["outcome"], lock: null, detail });

  try {
    validateReleaseSubject(release);
  } catch {
    return settle("ABSENT_RELEASE", "the release subject is not an immutable identity");
  }
  lifecycle.push("RELEASE_VERIFIED");

  if (!SAFE_ID.test(requirements.consumerId) || requirements.modules.length === 0) {
    return settle("INVALID_REQUIREMENTS", "the requirements name no consumer or no module");
  }
  for (const capability of requirements.capabilities) {
    if (!SAFE_CAPABILITY.test(capability)) return settle("INVALID_REQUIREMENTS", `required capability ${capability} is invalid`);
  }
  lifecycle.push("REQUIREMENTS_PARSED");

  const byId = new Map<string, ModuleManifest>();
  for (const module of catalog) {
    assertManifest(module);
    if (byId.has(module.id)) return settle("DUPLICATE_PROVIDER", `module ${module.id} appears twice in the catalog`);
    byId.set(module.id, module);
  }

  const roots = [...requirements.modules];
  for (const capability of requirements.capabilities) {
    const owner = [...byId.values()].find((module) => module.provides.some((entry) => entry.capability === capability));
    if (owner === undefined) return settle("MISSING_CAPABILITY", `no module provides ${capability}`);
    roots.push(owner.id);
  }
  lifecycle.push("MODULES_SELECTED");

  const expanded = expand(byId, roots, lifecycle);
  if (typeof expanded === "string") return settle(expanded, `closure expansion stopped at ${expanded}`);

  // INT-CLOSURE-006. Only public, selected components are bundled, and an optional component
  // is excluded unless the consumer asked for it by name.
  const components: SelectedComponent[] = [];
  for (const module of expanded.selected.values()) {
    for (const component of module.components) {
      if (component.visibility === "private") continue;
      if (component.optional && !requirements.components.includes(component.id)) continue;
      components.push({
        moduleId: module.id,
        componentId: component.id,
        files: [...component.files].sort(),
        digest: componentDigest(component),
      });
    }
  }
  for (const requested of requirements.components) {
    if (!components.some((component) => component.componentId === requested)) {
      return settle("MISSING_COMPONENT", `component ${requested} is not available in the selected closure`);
    }
  }

  // INT-CLOSURE-004. Every selected file has exactly one owner, and no two owners may claim
  // the same file or a path that contains another's.
  const owner = new Map<string, string>();
  for (const component of components) {
    for (const file of component.files) {
      const existing = owner.get(file);
      if (existing !== undefined) return settle("PATH_CONFLICT", `file ${file} is owned by both ${existing} and ${component.componentId}`);
      for (const [other, holder] of owner) {
        if (file.startsWith(`${other}/`) || other.startsWith(`${file}/`)) {
          return settle("PATH_CONFLICT", `path ${file} of ${component.componentId} overlaps ${other} of ${holder}`);
        }
      }
      owner.set(file, component.componentId);
    }
  }
  lifecycle.push("OWNERSHIP_CHECKED");

  // INT-CLOSURE-005. What the consumer was built against must still be what the release
  // offers, byte for byte, including exit codes and declared effects.
  for (const expected of requirements.expects) {
    const providerId = expanded.owners.get(expected.capability);
    if (providerId === undefined || !expanded.selected.has(providerId)) {
      return settle("MISSING_CAPABILITY", `expected capability ${expected.capability} is not in the closure`);
    }
    const actual = (expanded.selected.get(providerId) as ModuleManifest).signatures
      .find((signature) => signature.capability === expected.capability);
    if (actual === undefined) return settle("INTERFACE_CONFLICT", `${providerId} declares no signature for ${expected.capability}`);
    if (signatureKey(actual) !== signatureKey(expected)) {
      return settle("INTERFACE_CONFLICT", `${expected.capability} changed without a version bump`);
    }
  }
  lifecycle.push("INTERFACES_CHECKED");

  const moduleIds = [...expanded.selected.keys()].sort();
  const moduleDigests: Record<string, string> = {};
  for (const id of moduleIds) moduleDigests[id] = moduleDigest(expanded.selected.get(id) as ModuleManifest);

  const capabilityOwners: Record<string, string> = {};
  for (const [capability, providerId] of [...expanded.owners.entries()].sort()) {
    if (expanded.selected.has(providerId)) capabilityOwners[capability] = providerId;
  }

  // INT-CLOSURE-001. Everything that enters the digest is sorted first, so the lock is a
  // function of the inputs and not of the order they arrived in.
  const sortedComponents = [...components].sort((left, right) =>
    left.componentId < right.componentId ? -1 : left.componentId > right.componentId ? 1 : 0);

  lifecycle.push("CLOSURE_LOCKED");
  return {
    lifecycle,
    outcome: "CLOSURE_LOCKED",
    detail: `locked ${moduleIds.length} module(s) and ${sortedComponents.length} component(s)`,
    lock: {
      schema: CLOSURE_LOCK_SCHEMA,
      consumerId: requirements.consumerId,
      release,
      moduleIds,
      components: sortedComponents,
      capabilityOwners,
      moduleDigests,
      closureDigest: digest({ release, moduleIds, components: sortedComponents, capabilityOwners, moduleDigests }),
    },
  };
}
