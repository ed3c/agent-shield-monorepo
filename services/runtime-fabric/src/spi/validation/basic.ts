import type { RuntimeExit, RuntimeRequest } from "../../../../../packages/contracts/src/runtime/index.ts";
import type { RuntimeAdmissionResult, RuntimeExecutionResult, RuntimeMaterialization } from "../types.ts";
import {
  SAFE_SIGNAL, SAFE_WORKSPACE_ID, boolean, enumValue, exactKeys, nonNegativeInteger, portableDetail, record,
} from "./common.ts";

export function normalizeAdmission(value: unknown): RuntimeAdmissionResult {
  const admission = record(value, "runtime admission result");
  exactKeys(admission, ["state", "detail"], "runtime admission result");
  return {
    state: enumValue(admission.state, "runtime admission result.state", ["PASS", "FAIL", "REFUSED_POLICY"] as const),
    detail: portableDetail(admission.detail, "runtime admission result.detail"),
  };
}
export function validateWorkspaceIdentity(value: unknown): string {
  if (typeof value !== "string" || !SAFE_WORKSPACE_ID.test(value)) throw new Error("provider returned a non-portable content-addressed workspace identity");
  return value;
}
export function normalizeMaterialization(value: unknown): RuntimeMaterialization {
  const materialization = record(value, "runtime materialization");
  exactKeys(materialization, ["workspaceIdentity", "handle"], "runtime materialization");
  if (materialization.handle === undefined) throw new Error("runtime materialization.handle is required");
  return { workspaceIdentity: validateWorkspaceIdentity(materialization.workspaceIdentity), handle: materialization.handle };
}
export function normalizeExit(value: unknown): RuntimeExit {
  const exit = record(value, "runtime exit");
  exactKeys(exit, ["code", "signal", "timedOut", "cancelled"], "runtime exit");
  const code = exit.code === null ? null : nonNegativeInteger(exit.code, "runtime exit.code", 255);
  const signal = exit.signal === null ? null : enumSignal(exit.signal);
  const timedOut = boolean(exit.timedOut, "runtime exit.timedOut");
  const cancelled = boolean(exit.cancelled, "runtime exit.cancelled");
  if (timedOut && cancelled) throw new Error("runtime exit cannot be both timed out and cancelled");
  return { code, signal, timedOut, cancelled };
}
function enumSignal(value: unknown): string {
  if (typeof value !== "string" || !SAFE_SIGNAL.test(value)) throw new Error("runtime exit.signal is invalid");
  return value;
}
export function normalizeExecution(value: unknown, request: RuntimeRequest): RuntimeExecutionResult {
  const execution = record(value, "runtime execution result");
  exactKeys(execution, ["state", "exit", "stdoutBytes", "stderrBytes", "detail"], "runtime execution result");
  const state = enumValue(execution.state, "runtime execution result.state", ["PASS", "FAIL", "CANCELLED", "TIMED_OUT"] as const);
  const exit = normalizeExit(execution.exit);
  const stdoutBytes = nonNegativeInteger(execution.stdoutBytes, "runtime execution result.stdoutBytes", request.limits.maxOutputBytes);
  const stderrBytes = nonNegativeInteger(execution.stderrBytes, "runtime execution result.stderrBytes", request.limits.maxOutputBytes);
  if (stdoutBytes + stderrBytes > request.limits.maxOutputBytes) throw new Error("provider output exceeds maxOutputBytes");
  if (state === "PASS" && (exit.code !== 0 || exit.signal !== null || exit.timedOut || exit.cancelled)) throw new Error("PASS execution has inconsistent exit state");
  if (state === "TIMED_OUT" && !exit.timedOut) throw new Error("TIMED_OUT execution lacks timeout evidence");
  if (state === "CANCELLED" && !exit.cancelled) throw new Error("CANCELLED execution lacks cancellation evidence");
  return { state, exit, stdoutBytes, stderrBytes, detail: portableDetail(execution.detail, "runtime execution result.detail") };
}
