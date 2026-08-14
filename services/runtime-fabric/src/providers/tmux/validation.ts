import { validateRuntimeRequest } from "../../../../../packages/contracts/src/runtime/index.ts";
import {
  TMUX_SESSION_REQUEST_SCHEMA,
  type TmuxAuthorizationEnvelope,
  type TmuxControlAction,
  type TmuxDriverDescriptor,
  type TmuxPtyFrame,
  type TmuxSessionIdentity,
  type TmuxSessionOutcome,
  type TmuxSessionRequest,
  type TmuxUpstreamSubject,
} from "./types.ts";

const SHA = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const PANE = /^(?:%[0-9]+|[a-z0-9][a-z0-9._-]{0,127})$/;
const SIGNAL = /^SIG[A-Z0-9_]{1,28}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const actions = ["attach", "capture", "detach", "stop"] as const satisfies readonly TmuxControlAction[];
const badKeys = new Set(["__proto__", "prototype", "constructor"]);
const upstream: TmuxUpstreamSubject = {
  repository: "https://github.com/tmux/tmux",
  version: "3.7b",
  tag: "3.7b",
  tagObject: "3423e0dcc6ec1069d575cd104ed1c005e3e3943f",
  commit: "e802909de06012a4df6209d55e86487c56223163",
  archiveSha256: "87f2e99e3b685973f2ca002ffd6ed7e51a5744f7009daae5a15670b6d532db96",
  license: "ISC",
  tagSignature: "UNVERIFIED",
  artifactAdmission: "NOT_EXERCISED",
};

function fail(message: string): never { throw new Error(`invalid tmux contract: ${message}`); }
function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${name} must be a plain object`);
  for (const key of Object.keys(value)) if (badKeys.has(key)) fail(`${name}.${key} is forbidden`);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${name}.${key} is not allowed`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${name}.${key} is required`);
}
function text(value: unknown, name: string, pattern?: RegExp, max = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || /\p{Cc}/u.test(value) || pattern && !pattern.test(value)) fail(`${name} is invalid`);
  return value;
}
function integer(value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail(`${name} is invalid`);
  return value;
}
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
function logicalRef(value: unknown, name: string): { id: string; sha256: string } {
  const object = record(value, name); exact(object, ["id", "sha256"], name);
  return { id: text(object.id, `${name}.id`, ID, 128), sha256: text(object.sha256, `${name}.sha256`, SHA, 64) };
}
function brokerRef(value: unknown, name: string): string {
  const result = text(value, name, undefined, 320);
  if (!/^[a-z][a-z0-9.-]{0,63}:[A-Za-z0-9._/-]{1,255}$/.test(result) || result.includes("://") || result.includes("..") || result.includes("\\") || result.startsWith("file:")) {
    fail(`${name} is not an opaque logical broker reference`);
  }
  return result;
}
function validateUpstream(value: unknown): TmuxUpstreamSubject {
  const object = record(value, "upstream");
  exact(object, ["repository", "version", "tag", "tagObject", "commit", "archiveSha256", "license", "tagSignature", "artifactAdmission"], "upstream");
  for (const [key, expected] of Object.entries(upstream)) if (object[key] !== expected) fail(`upstream.${key} does not match the admitted source subject`);
  return { ...upstream };
}
function authorization(value: unknown): TmuxAuthorizationEnvelope {
  const object = record(value, "authorization"); exact(object, ["capabilityRef", "audience", "expiresAtEpochMs", "actions"], "authorization");
  if (object.audience !== "tmux-control") fail("authorization.audience is unsupported");
  const selected = stringArray(object.actions, "authorization.actions", actions.length, (entry, index) => {
    if (!actions.includes(entry as TmuxControlAction)) fail(`authorization.actions[${index}] is invalid`);
  }) as TmuxControlAction[];
  if (selected.length === 0) fail("authorization.actions is empty");
  return {
    capabilityRef: brokerRef(object.capabilityRef, "authorization.capabilityRef"),
    audience: "tmux-control",
    expiresAtEpochMs: integer(object.expiresAtEpochMs, "authorization.expiresAtEpochMs", 1),
    actions: selected,
  };
}
export function validateTmuxSessionRequest(value: unknown): TmuxSessionRequest {
  const object = record(value, "request");
  exact(object, ["schema", "requestId", "namespace", "runtimeRequest", "workspace", "taskProfile", "taskEnvelope", "authorization", "stream", "cleanup", "policyEnvelope", "upstream", "exclusions"], "request");
  if (object.schema !== TMUX_SESSION_REQUEST_SCHEMA) fail("request.schema is unsupported");
  const stream = record(object.stream, "stream"); exact(stream, ["maxFrameBytes", "maxTotalBytes", "maxFrames", "maxIdleMs", "maxTaskMs"], "stream");
  const maxFrameBytes = integer(stream.maxFrameBytes, "stream.maxFrameBytes", 1, 1_048_576);
  const maxTotalBytes = integer(stream.maxTotalBytes, "stream.maxTotalBytes", maxFrameBytes, 67_108_864);
  const maxFrames = integer(stream.maxFrames, "stream.maxFrames", 1, 100_000);
  const maxIdleMs = integer(stream.maxIdleMs, "stream.maxIdleMs", 1, 86_400_000);
  const maxTaskMs = integer(stream.maxTaskMs, "stream.maxTaskMs", maxIdleMs, 86_400_000);
  const cleanup = record(object.cleanup, "cleanup"); exact(cleanup, ["sessionRetention", "maxDurationMs"], "cleanup");
  if (cleanup.sessionRetention !== "terminate") fail("cleanup.sessionRetention must remain terminate");
  const policyEnvelope = object.policyEnvelope === null ? null : (() => {
    const policy = record(object.policyEnvelope, "policyEnvelope"); exact(policy, ["schema", "sha256"], "policyEnvelope");
    if (policy.schema !== "agent-shield/openshell-policy-envelope/v1") fail("policyEnvelope.schema is unsupported");
    return { schema: "agent-shield/openshell-policy-envelope/v1" as const, sha256: text(policy.sha256, "policyEnvelope.sha256", SHA, 64) };
  })();
  const exclusions = stringArray(object.exclusions, "exclusions", 64, (entry, index) => { if (!ID.test(entry)) fail(`exclusions[${index}] is invalid`); });
  return {
    schema: TMUX_SESSION_REQUEST_SCHEMA,
    requestId: text(object.requestId, "requestId", ID, 128),
    namespace: text(object.namespace, "namespace", NAME, 32),
    runtimeRequest: validateRuntimeRequest(object.runtimeRequest),
    workspace: logicalRef(object.workspace, "workspace"),
    taskProfile: logicalRef(object.taskProfile, "taskProfile"),
    taskEnvelope: logicalRef(object.taskEnvelope, "taskEnvelope"),
    authorization: authorization(object.authorization),
    stream: { maxFrameBytes, maxTotalBytes, maxFrames, maxIdleMs, maxTaskMs },
    cleanup: { sessionRetention: "terminate", maxDurationMs: integer(cleanup.maxDurationMs, "cleanup.maxDurationMs", 1, 300_000) },
    policyEnvelope,
    upstream: validateUpstream(object.upstream),
    exclusions,
  };
}
export function validateTmuxDriverDescriptor(value: unknown): TmuxDriverDescriptor {
  const object = record(value, "driverDescriptor"); exact(object, ["upstream", "externalState"], "driverDescriptor");
  return { upstream: validateUpstream(object.upstream), externalState: enumValue(object.externalState, "driverDescriptor.externalState", ["PASS", "NOT_EXERCISED", "ABSENT"] as const) };
}
export function validateTmuxSessionIdentity(value: unknown): TmuxSessionIdentity {
  const object = record(value, "sessionIdentity"); exact(object, ["socketName", "sessionName", "paneId", "workspace", "process"], "sessionIdentity");
  const process = record(object.process, "sessionIdentity.process"); exact(process, ["groupId", "generationToken"], "sessionIdentity.process");
  return {
    socketName: text(object.socketName, "sessionIdentity.socketName", NAME, 32),
    sessionName: text(object.sessionName, "sessionIdentity.sessionName", NAME, 32),
    paneId: text(object.paneId, "sessionIdentity.paneId", PANE, 128),
    workspace: logicalRef(object.workspace, "sessionIdentity.workspace"),
    process: { groupId: text(process.groupId, "sessionIdentity.process.groupId", ID, 128), generationToken: text(process.generationToken, "sessionIdentity.process.generationToken", SHA, 64) },
  };
}
export function decodeTmuxFrame(value: unknown, maxFrameBytes: number): { frame: TmuxPtyFrame; bytes: Uint8Array } {
  const object = record(value, "frame"); exact(object, ["sequence", "dataBase64", "bytes", "sha256", "eof"], "frame");
  const dataBase64 = text(object.dataBase64, "frame.dataBase64", BASE64, Math.ceil(maxFrameBytes / 3) * 4 + 4);
  let decoded: string;
  try { decoded = atob(dataBase64); } catch { fail("frame.dataBase64 is invalid"); }
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  const declaredBytes = integer(object.bytes, "frame.bytes", 0, maxFrameBytes);
  if (bytes.byteLength !== declaredBytes) fail("frame byte count mismatch");
  return {
    frame: {
      sequence: integer(object.sequence, "frame.sequence", 1),
      dataBase64,
      bytes: declaredBytes,
      sha256: text(object.sha256, "frame.sha256", SHA, 64),
      eof: typeof object.eof === "boolean" ? object.eof : fail("frame.eof must be boolean"),
    },
    bytes,
  };
}
export function tmuxEvidence(outcome: TmuxSessionOutcome): EvidenceState {
  if (outcome === "TERMINATED") return "PASS";
  if (outcome === "ABSENT_TMUX") return "ABSENT";
  return "FAIL";
}
export function validateSignal(value: unknown): string | null {
  if (value === null) return null;
  return text(value, "signal", SIGNAL, 32);
}
