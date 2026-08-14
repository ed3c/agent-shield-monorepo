import { validateRuntimeRequest } from "../../../../../packages/contracts/src/runtime/index.ts";
import {
  OPENSHELL_POLICY_REQUEST_SCHEMA,
  type OpenShellCredentialBinding,
  type OpenShellFilesystemPolicy,
  type OpenShellNetworkEndpoint,
  type OpenShellNetworkPolicy,
  type OpenShellPolicyRequest,
  type OpenShellPreviousPolicy,
  type OpenShellSubjectRef,
  type OpenShellUpstreamSubject,
} from "./types.ts";

const SHA = /^[a-f0-9]{64}$/;
const OID = /^[a-f0-9]{40}$/;
const ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const badObjectKeys = new Set(["__proto__", "prototype", "constructor"]);
const allowedReadWriteRoots = ["/sandbox", "/workspace", "/tmp", "/dev/null"];
const allowedReadOnlyRoots = ["/sandbox", "/workspace", "/usr", "/lib", "/proc", "/app", "/etc", "/var/log", "/dev/urandom"];

function fail(message: string): never { throw new Error(`invalid OpenShell policy contract: ${message}`); }
function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${name} must be a plain object`);
  for (const key of Object.keys(value)) if (badObjectKeys.has(key)) fail(`${name}.${key} is forbidden`);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${name}.${key} is not allowed`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${name}.${key} is required`);
}
function text(value: unknown, name: string, pattern?: RegExp, max = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || /\p{Cc}/u.test(value) || pattern && !pattern.test(value)) {
    fail(`${name} is invalid`);
  }
  return value;
}
function integer(value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail(`${name} is invalid`);
  return value;
}
function bool(value: unknown, name: string): boolean { if (typeof value !== "boolean") fail(`${name} must be boolean`); return value; }
function enumValue<T extends string>(value: unknown, name: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail(`${name} is invalid`);
  return value as T;
}
function stringArray(value: unknown, name: string, max: number, validator: (entry: string, index: number) => void): string[] {
  if (!Array.isArray(value) || value.length > max) fail(`${name} is invalid`);
  const result = value.map((entry, index) => { const item = text(entry, `${name}[${index}]`, undefined, 512); validator(item, index); return item; });
  if (new Set(result).size !== result.length) fail(`${name} contains duplicates`);
  return result.sort();
}
function normalizedAbsoluteSandboxPath(value: string, name: string, allowedRoots: readonly string[]): void {
  if (!value.startsWith("/") || value.includes("\\") || value.includes(":") || value.length > 255) fail(`${name} is not a sandbox path`);
  const segments = value.split("/").slice(1);
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /\p{Cc}/u.test(segment))) fail(`${name} is not normalized`);
  if (["/Users", "/home", "/root", "/run", "/var/run", "/mnt", "/media"].some((root) => value === root || value.startsWith(`${root}/`))) {
    fail(`${name} points at a host/session-sensitive root`);
  }
  if (!allowedRoots.some((root) => value === root || value.startsWith(`${root}/`))) fail(`${name} is outside the admitted sandbox roots`);
}
function overlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
function subject(value: unknown, name: string): OpenShellSubjectRef {
  const object = record(value, name); exact(object, ["id", "sha256"], name);
  return { id: text(object.id, `${name}.id`, ID, 128), sha256: text(object.sha256, `${name}.sha256`, SHA, 64) };
}
function upstream(value: unknown): OpenShellUpstreamSubject {
  const object = record(value, "upstream");
  exact(object, ["repository", "commit", "license", "policySchemaVersion", "channel", "artifactAdmission"], "upstream");
  if (object.repository !== "https://github.com/NVIDIA/OpenShell") fail("upstream.repository is not the canonical OpenShell repository");
  if (object.license !== "Apache-2.0") fail("upstream.license is not admitted");
  if (object.policySchemaVersion !== 1) fail("upstream.policySchemaVersion is unsupported");
  if (object.artifactAdmission !== "NOT_EXERCISED") fail("upstream artifact admission cannot be promoted by this broker");
  return {
    repository: "https://github.com/NVIDIA/OpenShell",
    commit: text(object.commit, "upstream.commit", OID, 40),
    license: "Apache-2.0",
    policySchemaVersion: 1,
    channel: enumValue(object.channel, "upstream.channel", ["source-commit", "dev-prerelease"] as const),
    artifactAdmission: "NOT_EXERCISED",
  };
}
function filesystem(value: unknown): OpenShellFilesystemPolicy {
  const object = record(value, "filesystem");
  exact(object, ["includeWorkdir", "readOnly", "readWrite", "landlockCompatibility"], "filesystem");
  const readOnly = stringArray(object.readOnly, "filesystem.readOnly", 128, (entry, index) => normalizedAbsoluteSandboxPath(entry, `filesystem.readOnly[${index}]`, allowedReadOnlyRoots));
  const readWrite = stringArray(object.readWrite, "filesystem.readWrite", 128, (entry, index) => normalizedAbsoluteSandboxPath(entry, `filesystem.readWrite[${index}]`, allowedReadWriteRoots));
  for (const left of readOnly) for (const right of readWrite) if (overlap(left, right)) fail("filesystem read-only and read-write roots overlap");
  return {
    includeWorkdir: bool(object.includeWorkdir, "filesystem.includeWorkdir"),
    readOnly,
    readWrite,
    landlockCompatibility: enumValue(object.landlockCompatibility, "filesystem.landlockCompatibility", ["best_effort", "required"] as const),
  };
}
function endpoint(value: unknown, name: string): OpenShellNetworkEndpoint {
  const object = record(value, name); exact(object, ["host", "port", "protocol", "enforcement", "access"], name);
  const host = text(object.host, `${name}.host`, HOST, 253);
  if (host.includes("*") || host === "localhost" || /^127\./.test(host) || host === "0.0.0.0") fail(`${name}.host is not an exact external host`);
  return {
    host,
    port: integer(object.port, `${name}.port`, 1, 65535),
    protocol: enumValue(object.protocol, `${name}.protocol`, ["rest"] as const),
    enforcement: enumValue(object.enforcement, `${name}.enforcement`, ["enforce"] as const),
    access: enumValue(object.access, `${name}.access`, ["read-only", "read-write"] as const),
  };
}
function networkPolicy(value: unknown, index: number, filesystemPolicy: OpenShellFilesystemPolicy): OpenShellNetworkPolicy {
  const name = `networkPolicies[${index}]`, object = record(value, name);
  exact(object, ["id", "name", "endpoints", "binaries"], name);
  if (!Array.isArray(object.endpoints) || object.endpoints.length === 0 || object.endpoints.length > 128) fail(`${name}.endpoints is invalid`);
  const endpoints = object.endpoints.map((entry, endpointIndex) => endpoint(entry, `${name}.endpoints[${endpointIndex}]`));
  endpoints.sort((left, right) => `${left.host}:${left.port}:${left.access}`.localeCompare(`${right.host}:${right.port}:${right.access}`));
  const binaries = stringArray(object.binaries, `${name}.binaries`, 128, (entry, binaryIndex) => {
    normalizedAbsoluteSandboxPath(entry, `${name}.binaries[${binaryIndex}]`, allowedReadOnlyRoots);
    if (!filesystemPolicy.readOnly.some((root) => entry === root || entry.startsWith(`${root}/`))) fail(`${name}.binaries[${binaryIndex}] is not covered by a read-only root`);
  });
  return { id: text(object.id, `${name}.id`, ID, 128), name: text(object.name, `${name}.name`, ID, 128), endpoints, binaries };
}
function previous(value: unknown): OpenShellPreviousPolicy | null {
  if (value === null) return null;
  const object = record(value, "previous"); exact(object, ["epoch", "staticDigest", "dynamicDigest"], "previous");
  return { epoch: integer(object.epoch, "previous.epoch", 0), staticDigest: text(object.staticDigest, "previous.staticDigest", SHA, 64), dynamicDigest: text(object.dynamicDigest, "previous.dynamicDigest", SHA, 64) };
}
function credentialBinding(value: unknown, index: number): OpenShellCredentialBinding {
  const name = `credentialBindings[${index}]`, object = record(value, name); exact(object, ["name", "brokerRef"], name);
  const brokerRef = text(object.brokerRef, `${name}.brokerRef`, undefined, 320);
  if (!/^[a-z][a-z0-9.-]{0,63}:[A-Za-z0-9._/-]{1,255}$/.test(brokerRef) || brokerRef.includes("://") || brokerRef.includes("..") || brokerRef.includes("\\") || brokerRef.startsWith("file:")) {
    fail(`${name}.brokerRef is not an opaque logical reference`);
  }
  return { name: text(object.name, `${name}.name`, /^[A-Z_][A-Z0-9_]{0,127}$/, 128), brokerRef };
}
export function validateOpenShellPolicyRequest(value: unknown): OpenShellPolicyRequest {
  const object = record(value, "request");
  exact(object, ["schema", "requestId", "runtimeRequest", "upstream", "policyEpoch", "previous", "workspaceRoot", "filesystem", "processProfile", "networkPolicies", "inferenceProfile", "credentialBindings", "exclusions"], "request");
  if (object.schema !== OPENSHELL_POLICY_REQUEST_SCHEMA) fail("request.schema is unsupported");
  const runtimeRequest = validateRuntimeRequest(object.runtimeRequest);
  const policyEpoch = record(object.policyEpoch, "policyEpoch"); exact(policyEpoch, ["previous", "current"], "policyEpoch");
  const previousEpoch = integer(policyEpoch.previous, "policyEpoch.previous", 0);
  const currentEpoch = integer(policyEpoch.current, "policyEpoch.current", 1);
  const previousPolicy = previous(object.previous);
  if (currentEpoch !== previousEpoch + 1) fail("policy epoch must advance exactly once");
  if (previousPolicy === null && previousEpoch !== 0) fail("initial policy epoch must start from zero");
  const filesystemPolicy = filesystem(object.filesystem);
  const workspaceRoot = text(object.workspaceRoot, "workspaceRoot", undefined, 255);
  normalizedAbsoluteSandboxPath(workspaceRoot, "workspaceRoot", ["/sandbox", "/workspace"]);
  if (!Array.isArray(object.networkPolicies) || object.networkPolicies.length > 128) fail("networkPolicies is invalid");
  const networkPolicies = object.networkPolicies.map((entry, index) => networkPolicy(entry, index, filesystemPolicy));
  if (new Set(networkPolicies.map((entry) => entry.id)).size !== networkPolicies.length) fail("networkPolicies contains duplicate IDs");
  networkPolicies.sort((left, right) => left.id.localeCompare(right.id));
  if (!Array.isArray(object.credentialBindings) || object.credentialBindings.length > 64) fail("credentialBindings is invalid");
  const credentialBindings = object.credentialBindings.map(credentialBinding).sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(credentialBindings.map((entry) => entry.name)).size !== credentialBindings.length) fail("credentialBindings contains duplicate names");
  const exclusions = stringArray(object.exclusions, "exclusions", 64, (entry, index) => { if (!ID.test(entry)) fail(`exclusions[${index}] is invalid`); });
  return {
    schema: OPENSHELL_POLICY_REQUEST_SCHEMA,
    requestId: text(object.requestId, "requestId", ID, 128),
    runtimeRequest,
    upstream: upstream(object.upstream),
    policyEpoch: { previous: previousEpoch, current: currentEpoch },
    previous: previousPolicy,
    workspaceRoot,
    filesystem: filesystemPolicy,
    processProfile: subject(object.processProfile, "processProfile"),
    networkPolicies,
    inferenceProfile: object.inferenceProfile === null ? null : subject(object.inferenceProfile, "inferenceProfile"),
    credentialBindings,
    exclusions,
  };
}
