import type { RuntimeExit, RuntimeReceipt, RuntimeRequest, RuntimeStage } from "../../../../../packages/contracts/src/runtime/index.ts";
import { exactKeys, nonNegativeInteger, portableDetail, record } from "./common.ts";
import { normalizeCleanup, normalizeCollection } from "./artifacts.ts";
import { normalizeExit } from "./basic.ts";

function assertEmptyExit(exit: RuntimeExit, name: string): void {
  if (exit.code !== null || exit.signal !== null || exit.timedOut || exit.cancelled) throw new Error(`${name} must be empty`);
}

export function validateReceiptEffects(
  receipt: RuntimeReceipt,
  request: RuntimeRequest,
  taskStage: Exclude<RuntimeStage, "cleanup"> | null,
): void {
  const exit = normalizeExit(receipt.exit);
  const output = record(receipt.output, "runtime receipt output");
  exactKeys(output, ["stdoutBytes", "stderrBytes"], "runtime receipt output");
  const stdoutBytes = nonNegativeInteger(receipt.output.stdoutBytes, "runtime receipt output.stdoutBytes", request.limits.maxOutputBytes);
  const stderrBytes = nonNegativeInteger(receipt.output.stderrBytes, "runtime receipt output.stderrBytes", request.limits.maxOutputBytes);
  if (stdoutBytes + stderrBytes > request.limits.maxOutputBytes) throw new Error("runtime receipt output exceeds request limit");

  if (taskStage === null || taskStage === "admission" || taskStage === "materialization") {
    assertEmptyExit(exit, "pre-execution exit");
    if (stdoutBytes !== 0 || stderrBytes !== 0 || receipt.artifacts.length !== 0 || receipt.touchedPaths.length !== 0) throw new Error("pre-execution receipt contains execution evidence");
  } else if (taskStage === "execution") {
    if (receipt.taskOutcome === "TIMED_OUT" && !exit.timedOut) throw new Error("execution timeout lacks evidence");
    if (receipt.taskOutcome === "CANCELLED" && !exit.cancelled) throw new Error("execution cancellation lacks evidence");
    if (receipt.artifacts.length !== 0 || receipt.touchedPaths.length !== 0) throw new Error("execution-stage receipt contains collection evidence");
  } else {
    if (exit.code !== 0 || exit.signal !== null || exit.timedOut || exit.cancelled) throw new Error("collection-stage receipt lacks successful execution exit");
    normalizeCollection({
      state: receipt.taskOutcome === "COMPLETED" ? "PASS" : "FAIL",
      artifacts: receipt.artifacts,
      touchedPaths: receipt.touchedPaths,
      detail: "receipt collection validation",
    }, request);
  }

  const cleanupMode = taskStage === "materialization" ? "recovery" : "materialized";
  const cleanup = normalizeCleanup(receipt.cleanup, request, receipt.taskOutcome, cleanupMode);
  if (taskStage === null || taskStage === "admission") {
    if (receipt.workspaceIdentity !== null || cleanup.state !== "NOT_EXERCISED") throw new Error("pre-materialization receipt contains cleanup evidence");
  } else if (taskStage === "materialization") {
    if (receipt.workspaceIdentity !== null || cleanup.state === "NOT_EXERCISED") throw new Error("materialization outcome lacks recovery cleanup");
  } else if (receipt.workspaceIdentity === null || cleanup.state === "NOT_EXERCISED") {
    throw new Error("materialized receipt lacks workspace or cleanup evidence");
  }
  if (receipt.outcome === "FAILED_CLEANUP" && cleanup.state !== "FAIL") throw new Error("FAILED_CLEANUP lacks failed cleanup");
  if (receipt.outcome !== "FAILED_CLEANUP" && taskStage !== null && taskStage !== "admission" && cleanup.state !== "PASS") throw new Error("non-cleanup-failure lacks PASS cleanup");
  if (receipt.exclusions.join("\u0000") !== request.exclusions.join("\u0000")) throw new Error("runtime receipt exclusions mismatch");
  portableDetail(receipt.detail, "runtime receipt detail");
}
