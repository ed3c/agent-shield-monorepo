import type { JsonObject, JsonValue } from "../types.ts";

export const SHA_256 = /^[a-f0-9]{64}$/;
export const GIT_OID = /^[a-f0-9]{40}$/;
export const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
export const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
export const SAFE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::(?:[1-9][0-9]{0,4}))?$/;
export const SAFE_MEDIA = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i;
export const SAFE_ENVIRONMENT_VARIABLE = /^[A-Z_][A-Z0-9_]{0,127}$/;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const FORBIDDEN_WORKLOAD_KEYS = new Set([
  "args",
  "arguments",
  "argv",
  "cmd",
  "command",
  "cwd",
  "entrypoint",
  "env",
  "environment",
  "executable",
  "hostpath",
  "privateflags",
  "program",
  "script",
  "shell",
  "workdir",
  "workingdirectory",
]);
export const MAX_RUNTIME_TIMEOUT_MS = 86_400_000;
export const MAX_RUNTIME_BYTES = 1_073_741_824;
export const MAX_TOUCHED_PATHS = 100_000;
export const MAX_JSON_DEPTH = 32;
export const MAX_JSON_ENTRIES = 4096;
export const MAX_JSON_KEY_LENGTH = 256;

export function fail(message: string): never {
  throw new Error(`invalid runtime contract: ${message}`);
}

function assertSafeKey(key: string, name: string): void {
  if (key.length === 0 || key.length > MAX_JSON_KEY_LENGTH || /\p{Cc}/u.test(key) || FORBIDDEN_OBJECT_KEYS.has(key)) {
    fail(`${name} contains an unsafe object key`);
  }
}

export function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${name} must be a plain own-key object`);
  for (const key of Object.keys(value)) assertSafeKey(key, name);
  return value as Record<string, unknown>;
}

export function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) fail(`${name}.${key} is not allowed`);
  for (const key of allowed) if (!Object.hasOwn(value, key)) fail(`${name}.${key} is required`);
}

export function requiredString(value: unknown, name: string, pattern?: RegExp, maxLength = 1024): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    fail(`${name} must be a non-empty bounded string`);
  }
  if (/\p{Cc}/u.test(value)) fail(`${name} contains control characters`);
  if (pattern && !pattern.test(value)) fail(`${name} has an invalid format`);
  return value;
}

export function requiredBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") fail(`${name} must be a boolean`);
  return value;
}

export function positiveInteger(value: unknown, name: string, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > max) {
    fail(`${name} must be an integer between 1 and ${max}`);
  }
  return value;
}

export function enumValue<T extends string>(value: unknown, name: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail(`${name} is invalid`);
  return value as T;
}

export function boundedStringArray(
  value: unknown,
  name: string,
  maxItems: number,
  validator: (entry: string, index: number) => void,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(`${name} must be an array with at most ${maxItems} items`);
  const result = value.map((entry, index) => {
    const item = requiredString(entry, `${name}[${index}]`, undefined, 512);
    validator(item, index);
    return item;
  });
  if (new Set(result).size !== result.length) fail(`${name} contains duplicates`);
  return result;
}

export function relativePath(value: string, name: string): void {
  if (
    value.startsWith("/") ||
    value.startsWith("~") ||
    /^[A-Za-z]:/.test(value) ||
    value.includes("\\") ||
    value.length > 255
  ) {
    fail(`${name} must be a bounded workspace-relative path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === ".." || /\p{Cc}/u.test(segment))) {
    fail(`${name} must be normalized and traversal-free`);
  }
}

export function portableRepository(value: string, name: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} must be an absolute repository URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.port) {
    fail(`${name} must be a credential-free immutable HTTPS identity`);
  }
  if (!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(parsed.pathname)) {
    fail(`${name} must identify one portable repository`);
  }
}

export function rejectGenericControls(value: unknown, name: string, depth = 0): void {
  if (depth > MAX_JSON_DEPTH) fail(`${name} exceeds maximum nesting depth`);
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ENTRIES) fail(`${name} contains too many entries`);
    for (let index = 0; index < value.length; index += 1) rejectGenericControls(value[index], `${name}[${index}]`, depth + 1);
    return;
  }
  const valueRecord = record(value, name);
  const entries = Object.entries(valueRecord);
  if (entries.length > MAX_JSON_ENTRIES) fail(`${name} contains too many entries`);
  for (const [key, entry] of entries) {
    if (FORBIDDEN_WORKLOAD_KEYS.has(key.toLowerCase().replace(/[_-]/g, ""))) {
      fail(`${name}.${key} would expose a generic runtime control`);
    }
    rejectGenericControls(entry, `${name}.${key}`, depth + 1);
  }
}

export function json(value: unknown, name: string, depth = 0): JsonValue {
  if (depth > MAX_JSON_DEPTH) fail(`${name} exceeds maximum nesting depth`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${name} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ENTRIES) fail(`${name} contains too many entries`);
    return value.map((entry, index) => json(entry, `${name}[${index}]`, depth + 1));
  }
  const valueRecord = record(value, name);
  const entries = Object.entries(valueRecord);
  if (entries.length > MAX_JSON_ENTRIES) fail(`${name} contains too many entries`);
  const result: JsonObject = {};
  for (const [key, entry] of entries) result[key] = json(entry, `${name}.${key}`, depth + 1);
  return result;
}

