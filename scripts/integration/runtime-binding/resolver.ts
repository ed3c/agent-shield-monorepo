import { createHash } from "node:crypto";
import { validateReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import {
  RUNTIME_BINDING_SCHEMA,
  type Carrier,
  type CarrierPolicy,
  type RuntimeBinding,
  type RuntimeBindingResult,
  type RuntimeBindingState,
  type RuntimeCatalog,
  type RuntimeProjection,
  type RuntimeRequirements,
  type RuntimeWorkload,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const REPO_PATH = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*\.[a-z0-9]+$/;
const SAFE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// INT-RUNTIME-003. Shapes that mean a value escaped into a contract that should only carry
// names. This is a scan over rendered bytes, and the controls prove it can fail.
const SECRET_VALUE = /(?:sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9._-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,})/;
const HOST_PATH = /(?:^|[\s"'(=])(?:\/(?:home|opt|var|etc|private|tmp)\/|[A-Za-z]:\\)/;
// The files a consumer must never copy, whatever a catalog says.
const NEVER_COPIED = /(?:^|\/)(?:\.env(?:\..*)?|.*\.keychain|cookies\.sqlite|Login Data|.*\.pem|.*\.p12)$/i;

export function fail(message: string): never {
  throw new Error(`invalid runtime binding contract: ${message}`);
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

// INT-RUNTIME-003. Every rendered byte of the binding is scanned. A name is fine; a value,
// a host path or a never-copied file is not.
export function scanSecretFree(binding: unknown): { ok: boolean; detail: string } {
  const text = canonical(binding);
  if (SECRET_VALUE.test(text)) return { ok: false, detail: "the binding carries a credential-shaped value" };
  if (HOST_PATH.test(text)) return { ok: false, detail: "the binding carries a host path" };
  for (const segment of text.split(/["\s,]+/)) {
    if (NEVER_COPIED.test(segment)) return { ok: false, detail: `the binding references a never-copied file: ${segment}` };
  }
  return { ok: true, detail: "no value, host path or never-copied file appears in the binding" };
}

function projectCarrier(policy: CarrierPolicy, workloads: readonly RuntimeWorkload[]): RuntimeProjection {
  // INT-RUNTIME-005. A carrier receives exactly the names its own policy admits, intersected
  // with the names the selected workloads actually declare. Nothing else can reach it.
  const declared = new Set(workloads.flatMap((workload) => workload.variableNames));
  const variableNames = [...policy.allowedVariableNames].filter((name) => declared.has(name)).sort();
  const workloadIds = workloads
    .filter((workload) => workload.variableNames.every((name) => policy.allowedVariableNames.includes(name)))
    .map((workload) => workload.id)
    .sort();
  return { carrier: policy.carrier, variableNames, workloadIds, projectionDigest: digest({ variableNames, workloadIds }) };
}

export function resolveRuntimeBinding(catalog: RuntimeCatalog, requirements: RuntimeRequirements): RuntimeBindingResult {
  const lifecycle: RuntimeBindingState[] = ["UNRESOLVED"];
  const settle = (outcome: RuntimeBindingState, detail: string): RuntimeBindingResult =>
    ({ lifecycle: [...lifecycle, outcome], outcome: outcome as RuntimeBindingResult["outcome"], binding: null, detail });

  try {
    validateReleaseSubject(catalog.release);
  } catch {
    return settle("MUTABLE_SOURCE", "the catalog release is not an immutable identity");
  }
  if (!catalog.workingTreeClean) return settle("MUTABLE_SOURCE", "the catalog working tree is dirty");
  lifecycle.push("SOURCE_RELEASE_PINNED");

  if (!SAFE_ID.test(requirements.consumerId)) return settle("MISSING_MODULE", "the requirements name no consumer");
  if (requirements.modules.length === 0) return settle("MISSING_MODULE", "the requirements select no module");
  lifecycle.push("REQUIREMENTS_PARSED");

  // INT-RUNTIME-002. Only the selected modules; the rest of the catalog is not copied.
  for (const module of requirements.modules) {
    if (!catalog.modules.includes(module)) return settle("MISSING_MODULE", `module ${module} is absent from the catalog`);
  }
  const modules = [...new Set(requirements.modules)].sort();
  lifecycle.push("MODULES_SELECTED");

  const profile = catalog.profiles.find((entry) => entry.id === requirements.profileId);
  if (profile === undefined) return settle("PROFILE_CONFLICT", `profile ${requirements.profileId} is absent from the catalog`);
  if (!SAFE_ID.test(profile.id) || !SAFE_VERSION.test(profile.version) || !SHA_256.test(profile.profileSha256)) {
    return settle("PROFILE_CONFLICT", `profile ${profile.id} is not pinned`);
  }
  const seenNames = new Set<string>();
  for (const variable of profile.variables) {
    if (!ENV_NAME.test(variable.name)) return settle("PROFILE_CONFLICT", `variable ${variable.name} is not an environment name`);
    if (seenNames.has(variable.name)) return settle("PROFILE_CONFLICT", `variable ${variable.name} is declared twice`);
    seenNames.add(variable.name);
    // INT-RUNTIME-004. A secret has no default, ever. A non-secret default is a name/value
    // pair the consumer may hold, and it is checked for value shapes like everything else.
    if (variable.secret && variable.defaultValue !== null) {
      return settle("SECRET_VALUE_DETECTED", `secret variable ${variable.name} declares a default`);
    }
  }
  lifecycle.push("PROFILE_RESOLVED");

  const workloads: RuntimeWorkload[] = [];
  for (const id of [...new Set(requirements.workloadIds)].sort()) {
    const workload = catalog.workloads.find((entry) => entry.id === id);
    if (workload === undefined) return settle("WORKLOAD_CONFLICT", `workload ${id} is absent from the catalog`);
    // Two distinct defects, two outcomes. A path that names a host location is a host-path
    // detection; one that is merely malformed is a workload conflict. Collapsing them into one
    // rule would leave whichever control fired second unable to distinguish them.
    if (HOST_PATH.test(workload.entrypointPath) || workload.entrypointPath.startsWith("/")) {
      return settle("HOST_PATH_DETECTED", `workload ${id} entrypoint names a host location`);
    }
    if (!REPO_PATH.test(workload.entrypointPath)) {
      return settle("WORKLOAD_CONFLICT", `workload ${id} entrypoint is not a normalized repository path`);
    }
    if (!SHA_256.test(workload.entrypointSha256)) return settle("WORKLOAD_CONFLICT", `workload ${id} entrypoint is not pinned`);
    for (const name of workload.variableNames) {
      if (!seenNames.has(name)) return settle("WORKLOAD_CONFLICT", `workload ${id} declares ${name}, which the profile does not`);
    }
    if (workload.network === "deny-all" && workload.allowedHosts.length > 0) {
      return settle("POLICY_CONFLICT", `workload ${id} denies network yet lists hosts`);
    }
    if (workload.network === "allowlist" && workload.allowedHosts.length === 0) {
      return settle("POLICY_CONFLICT", `workload ${id} allows network with an empty allowlist`);
    }
    for (const host of workload.allowedHosts) {
      if (!SAFE_HOST.test(host)) return settle("POLICY_CONFLICT", `workload ${id} lists an invalid host`);
    }
    workloads.push(workload);
  }
  lifecycle.push("WORKLOAD_RESOLVED");

  const policies: CarrierPolicy[] = [];
  const carriers = [...new Set(requirements.carriers)].sort() as Carrier[];
  for (const carrier of carriers) {
    const policy = catalog.policies.find((entry) => entry.carrier === carrier);
    if (policy === undefined) return settle("POLICY_CONFLICT", `no policy for carrier ${carrier}`);
    for (const path of policy.configPaths) {
      if (HOST_PATH.test(path) || path.startsWith("/")) {
        return settle("HOST_PATH_DETECTED", `carrier ${carrier} declares a host config path`);
      }
      if (!REPO_PATH.test(path)) return settle("POLICY_CONFLICT", `carrier ${carrier} declares a malformed config path`);
    }
    for (const name of policy.allowedVariableNames) {
      if (!ENV_NAME.test(name)) return settle("POLICY_CONFLICT", `carrier ${carrier} admits an invalid variable name`);
    }
    policies.push(policy);
  }

  // INT-RUNTIME-008. No config path may be claimed by two carriers: a shared path is exactly
  // how one carrier's session ends up visible to another.
  const pathOwner = new Map<string, Carrier>();
  for (const policy of policies) {
    for (const path of policy.configPaths) {
      const existing = pathOwner.get(path);
      if (existing !== undefined) return settle("POLICY_CONFLICT", `config path ${path} is claimed by ${existing} and ${policy.carrier}`);
      pathOwner.set(path, policy.carrier);
    }
  }
  lifecycle.push("POLICIES_RESOLVED");

  const draft = {
    schema: RUNTIME_BINDING_SCHEMA,
    consumerId: requirements.consumerId,
    source: catalog.release,
    modules,
    profile,
    workloads,
    policies,
  };
  const scan = scanSecretFree(draft);
  if (!scan.ok) {
    return settle(scan.detail.includes("host path") ? "HOST_PATH_DETECTED" : "SECRET_VALUE_DETECTED", scan.detail);
  }
  lifecycle.push("SECRET_FREE_CHECKED");

  const projections = policies.map((policy) => projectCarrier(policy, workloads));
  lifecycle.push("PROJECTIONS_RENDERED", "BINDING_LOCKED");

  const binding: RuntimeBinding = { ...draft, projections, bindingDigest: "" };
  binding.bindingDigest = digest({ ...binding, bindingDigest: "" });
  return { lifecycle, outcome: "BINDING_LOCKED", binding, detail: `bound ${modules.length} module(s) for ${carriers.length} carrier(s)` };
}

// The digest a consumer recomputes to check a binding was not edited. Exported because a
// consumer needs it, and because a control has to be able to produce a binding whose digest is
// valid while something inside it is wrong -- otherwise the digest check masks every other
// rule in verification and they cannot be tested at all.
export function bindingDigestOf(binding: RuntimeBinding): string {
  return digest({ ...binding, bindingDigest: "" });
}

// INT-RUNTIME-007. Verification is a pure function of the binding bytes: no network, no
// sibling checkout, no filesystem, no automatic sync.
export function verifyRuntimeBinding(binding: RuntimeBinding): { ok: boolean; detail: string } {
  if (binding.schema !== RUNTIME_BINDING_SCHEMA) return { ok: false, detail: "unsupported binding schema" };
  if (bindingDigestOf(binding) !== binding.bindingDigest) {
    return { ok: false, detail: "the binding digest does not match its content" };
  }
  const scan = scanSecretFree({ ...binding, bindingDigest: "" });
  if (!scan.ok) return scan;
  for (const projection of binding.projections) {
    const policy = binding.policies.find((entry) => entry.carrier === projection.carrier);
    if (policy === undefined) return { ok: false, detail: `projection for ${projection.carrier} has no policy` };
    const expected = projectCarrier(policy, binding.workloads);
    // Compare the rendered projection, not only its digest. A forged projection that leaves the
    // stored digest untouched matches on digest alone, so a digest-only comparison would accept
    // exactly the tampering this check exists to catch.
    if (canonical(expected) !== canonical(projection)) {
      return { ok: false, detail: `the ${projection.carrier} projection does not match its policy` };
    }
  }
  return { ok: true, detail: `binding verified for ${binding.projections.length} carrier(s)` };
}
