import { createHash } from "node:crypto";
import type { EvidenceState } from "../../../../../packages/contracts/src/index.ts";
import { runtimeRequestDigest } from "../../spi/index.ts";
import { OpenShellPolicyLifecycle, validateOpenShellPolicyLifecycle } from "./state-machine.ts";
import {
  OPENSHELL_POLICY_ENVELOPE_SCHEMA,
  type OpenShellCredentialBinding,
  type OpenShellNetworkPolicy,
  type OpenShellPolicyDocument,
  type OpenShellPolicyEnvelope,
  type OpenShellPolicyOutcome,
  type OpenShellPolicyRequest,
  type OpenShellReloadMode,
} from "./types.ts";
import { validateOpenShellPolicyRequest } from "./validation.ts";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("non-JSON policy value");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}
function digest(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function evidence(outcome: OpenShellPolicyOutcome): EvidenceState { return outcome === "COMPLETED" ? "PASS" : outcome === "ABSENT_POLICY" ? "ABSENT" : "FAIL"; }
function mappedPath(workspaceRoot: string, relative: string): string {
  const normalized = relative === "workspace" ? "" : relative.startsWith("workspace/") ? relative.slice("workspace/".length) : relative;
  return normalized ? `${workspaceRoot}/${normalized}` : workspaceRoot;
}
function covered(path: string, roots: readonly string[]): boolean { return roots.some((root) => path === root || path.startsWith(`${root}/`)); }
function networkSet(policies: readonly OpenShellNetworkPolicy[]): string[] {
  return policies.flatMap((policy) => policy.endpoints.map((endpoint) => `${endpoint.host}:${endpoint.port}`)).sort();
}
function runtimeNetworkSet(request: OpenShellPolicyRequest): string[] {
  return [...request.runtimeRequest.network.allowlist].map((entry) => entry.includes(":") ? entry : `${entry}:443`).sort();
}
function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}
function bindingsMatch(request: OpenShellPolicyRequest): boolean {
  const expected = request.runtimeRequest.secrets.map((entry) => ({ name: entry.name, brokerRef: entry.brokerRef })).sort((left, right) => left.name.localeCompare(right.name));
  const observed = request.credentialBindings.map((entry) => ({ ...entry })).sort((left, right) => left.name.localeCompare(right.name));
  return canonical(expected) === canonical(observed);
}
function document(request: OpenShellPolicyRequest): OpenShellPolicyDocument {
  const network_policies: OpenShellPolicyDocument["network_policies"] = {};
  for (const policy of request.networkPolicies) {
    network_policies[policy.id] = {
      name: policy.name,
      endpoints: policy.endpoints.map((endpoint) => ({ ...endpoint })),
      binaries: policy.binaries.map((path) => ({ path })),
    };
  }
  return {
    version: 1,
    filesystem_policy: {
      include_workdir: request.filesystem.includeWorkdir,
      read_only: [...request.filesystem.readOnly],
      read_write: [...request.filesystem.readWrite],
    },
    landlock: { compatibility: request.filesystem.landlockCompatibility },
    network_policies,
  };
}
function staticSubject(request: OpenShellPolicyRequest): unknown {
  return {
    workspaceRoot: request.workspaceRoot,
    filesystem: request.filesystem,
    processProfile: request.processProfile,
  };
}
function dynamicSubject(request: OpenShellPolicyRequest): unknown {
  return {
    networkPolicies: request.networkPolicies,
    inferenceProfile: request.inferenceProfile,
    credentialBindings: request.credentialBindings,
  };
}
function blocked(
  request: OpenShellPolicyRequest,
  lifecycle: OpenShellPolicyLifecycle,
  outcome: Exclude<OpenShellPolicyOutcome, "COMPLETED">,
  detail: string,
): OpenShellPolicyEnvelope {
  lifecycle.transition(outcome);
  validateOpenShellPolicyLifecycle(lifecycle.trace);
  return freeze({
    schema: OPENSHELL_POLICY_ENVELOPE_SCHEMA,
    requestId: request.requestId,
    runtimeRequestDigest: runtimeRequestDigest(request.runtimeRequest),
    upstream: { ...request.upstream },
    policyEpoch: request.policyEpoch.current,
    lifecycle: [...lifecycle.trace],
    outcome,
    state: evidence(outcome),
    externalRuntimeState: "NOT_EXERCISED",
    reloadMode: null,
    staticDigest: null,
    dynamicDigest: null,
    task: { id: request.runtimeRequest.workload.id, version: request.runtimeRequest.workload.version },
    processProfile: { ...request.processProfile },
    inferenceProfile: request.inferenceProfile ? { ...request.inferenceProfile } : null,
    credentialBindings: request.credentialBindings.map((entry: OpenShellCredentialBinding) => ({ ...entry })),
    document: null,
    exclusions: [...request.exclusions],
    detail,
  });
}

export function compileOpenShellPolicy(value: unknown): OpenShellPolicyEnvelope {
  const request = freeze(validateOpenShellPolicyRequest(value));
  const lifecycle = new OpenShellPolicyLifecycle();
  lifecycle.transition("POLICY_RESOLVED");
  if (request.previous && request.previous.epoch !== request.policyEpoch.previous) {
    return blocked(request, lifecycle, "STALE_EPOCH", "previous policy epoch drifted");
  }
  lifecycle.transition("POLICY_VERIFIED");

  const writable = request.runtimeRequest.mutation.writableRoots.map((path) => mappedPath(request.workspaceRoot, path));
  const readOnly = request.runtimeRequest.mutation.readOnlyRoots.map((path) => mappedPath(request.workspaceRoot, path));
  if (writable.some((path) => !covered(path, request.filesystem.readWrite)) || readOnly.some((path) => !covered(path, request.filesystem.readOnly))) {
    return blocked(request, lifecycle, "REFUSED_FILESYSTEM", "runtime mutation roots are not covered by the static filesystem policy");
  }
  const runtimeNetwork = runtimeNetworkSet(request);
  const policyNetwork = networkSet(request.networkPolicies);
  if (request.runtimeRequest.network.mode === "deny-all" ? policyNetwork.length !== 0 : !sameStrings(runtimeNetwork, policyNetwork)) {
    return blocked(request, lifecycle, "REFUSED_NETWORK", "runtime network contract and OpenShell dynamic policy disagree");
  }
  if (!bindingsMatch(request)) {
    return blocked(request, lifecycle, "REFUSED_TASK", "credential bindings do not match the runtime request's opaque references");
  }
  lifecycle.transition("AUTHORIZED");

  const compiled = document(request);
  const staticDigest = digest(staticSubject(request));
  const dynamicDigest = digest(dynamicSubject(request));
  let reloadMode: OpenShellReloadMode = "CREATE_REQUIRED";
  if (request.previous) {
    reloadMode = request.previous.staticDigest !== staticDigest
      ? "CREATE_REQUIRED"
      : request.previous.dynamicDigest !== dynamicDigest
        ? "HOT_RELOAD_DYNAMIC"
        : "NO_CHANGE";
  }
  lifecycle.transition("COMPILED");
  lifecycle.transition("COMPLETED");
  validateOpenShellPolicyLifecycle(lifecycle.trace);
  return freeze({
    schema: OPENSHELL_POLICY_ENVELOPE_SCHEMA,
    requestId: request.requestId,
    runtimeRequestDigest: runtimeRequestDigest(request.runtimeRequest),
    upstream: { ...request.upstream },
    policyEpoch: request.policyEpoch.current,
    lifecycle: [...lifecycle.trace],
    outcome: "COMPLETED",
    state: "PASS",
    externalRuntimeState: "NOT_EXERCISED",
    reloadMode,
    staticDigest,
    dynamicDigest,
    task: { id: request.runtimeRequest.workload.id, version: request.runtimeRequest.workload.version },
    processProfile: { ...request.processProfile },
    inferenceProfile: request.inferenceProfile ? { ...request.inferenceProfile } : null,
    credentialBindings: request.credentialBindings.map((entry) => ({ ...entry })),
    document: compiled,
    exclusions: [...request.exclusions],
    detail: reloadMode === "HOT_RELOAD_DYNAMIC"
      ? "network/inference policy can be proposed for runtime hot reload; external OpenShell execution remains unexercised"
      : reloadMode === "CREATE_REQUIRED"
        ? "static policy requires sandbox creation or recreation; external OpenShell execution remains unexercised"
        : "policy bytes are unchanged; external OpenShell execution remains unexercised",
  });
}

export function openShellStaticDigest(value: unknown): string {
  const request = validateOpenShellPolicyRequest(value);
  return digest(staticSubject(request));
}

export function openShellDynamicDigest(value: unknown): string {
  const request = validateOpenShellPolicyRequest(value);
  return digest(dynamicSubject(request));
}
