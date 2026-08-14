import { createHash } from "node:crypto";
import {
  validateRuntimeProviderDescriptor,
  type RuntimeAdmissionReceipt,
  type RuntimeCleanupReceipt,
  type RuntimeExit,
  type RuntimeOutcomeState,
  type RuntimeProviderDescriptor,
  type RuntimeRequest,
} from "../../../../../packages/contracts/src/runtime/index.ts";

export const OUTCOMES = new Set<RuntimeOutcomeState>([
  "COMPLETED",
  "ABSENT",
  "NOT_IMPLEMENTED",
  "NOT_EXERCISED",
  "REFUSED_POLICY",
  "FAILED_ADMISSION",
  "FAILED_MATERIALIZATION",
  "FAILED_EXECUTION",
  "FAILED_ARTIFACT",
  "FAILED_CLEANUP",
  "CANCELLED",
  "TIMED_OUT",
]);
export const SAFE_WORKSPACE_ID = /^[a-z0-9][a-z0-9._-]{0,63}:sha256:[a-f0-9]{64}$/;
export const SAFE_SIGNAL = /^SIG[A-Z0-9_]{1,28}$/;
export const SAFE_LOGICAL_ID = /^[a-z0-9][a-z0-9._:/-]{0,255}$/;
export const SAFE_MEDIA = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i;
export const RECEIPT_KEYS = [
  "schema",
  "requestId",
  "requestDigest",
  "provider",
  "source",
  "workspaceIdentity",
  "lifecycle",
  "taskStage",
  "terminalStage",
  "admission",
  "taskOutcome",
  "outcome",
  "state",
  "exit",
  "output",
  "artifacts",
  "touchedPaths",
  "cleanup",
  "exclusions",
  "detail",
] as const;

export function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${name} must be a plain own-key object`);
  return value as Record<string, unknown>;
}

export function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) throw new Error(`${name}.${key} is not allowed`);
  for (const key of allowed) if (!Object.hasOwn(value, key)) throw new Error(`${name}.${key} is required`);
}

export function portableDetail(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024 || /\p{Cc}/u.test(value)) {
    throw new Error(`${name} must be printable metadata no longer than 1024 characters`);
  }
  return value;
}

export function nonNegativeInteger(value: unknown, name: string, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`${name} must be an integer between 0 and ${max}`);
  }
  return value;
}

export function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

export function enumValue<T extends string>(value: unknown, name: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${name} is invalid`);
  return value as T;
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  const valueRecord = value as Record<string, unknown>;
  return `{${Object.keys(valueRecord)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(valueRecord[key])}`)
    .join(",")}}`;
}

export function runtimeRequestDigest(request: RuntimeRequest): string {
  return createHash("sha256").update(canonical(request)).digest("hex");
}

export function normalizeDescriptor(value: unknown): RuntimeProviderDescriptor {
  return deepFreeze(validateRuntimeProviderDescriptor(value));
}

export function emptyExit(): RuntimeExit {
  return { code: null, signal: null, timedOut: false, cancelled: false };
}

export function unexercisedAdmission(detail: string): RuntimeAdmissionReceipt {
  return { state: "NOT_EXERCISED", detail };
}

export function unexercisedCleanup(detail: string): RuntimeCleanupReceipt {
  return {
    state: "NOT_EXERCISED",
    durationMs: 0,
    processesChecked: false,
    workspaceChecked: false,
    sessionsChecked: false,
    workspaceDisposition: "ABSENT",
    preservationRef: null,
    residue: [],
    detail,
  };
}

export function failedCleanup(detail: string, residue: string[] = ["cleanup-failed"]): RuntimeCleanupReceipt {
  return {
    state: "FAIL",
    durationMs: 0,
    processesChecked: false,
    workspaceChecked: false,
    sessionsChecked: false,
    workspaceDisposition: "UNKNOWN",
    preservationRef: null,
    residue,
    detail,
  };
}

