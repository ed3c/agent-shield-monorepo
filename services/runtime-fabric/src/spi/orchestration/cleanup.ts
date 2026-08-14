import type { RuntimeCleanupReceipt, RuntimeOutcomeState, RuntimeRequest } from "../../../../../packages/contracts/src/runtime/index.ts";
import type { RuntimeMaterialization, RuntimeProviderSpi } from "../types.ts";
import { failedCleanup, normalizeCleanup } from "../validation.ts";
import { forceUnsettledFailure } from "./receipt.ts";
import { runBoundedStage } from "./stage.ts";

export async function recoveryCleanup(
  provider: RuntimeProviderSpi,
  request: RuntimeRequest,
  taskOutcome: Extract<RuntimeOutcomeState, "FAILED_MATERIALIZATION" | "CANCELLED" | "TIMED_OUT">,
  unsettledMaterialization: boolean,
  now: () => number,
): Promise<RuntimeCleanupReceipt> {
  const result = await runBoundedStage(
    "cleanup", request.cleanup.maxDurationMs, request.limits.cancellationGraceMs, undefined,
    (context) => provider.cleanupFailedMaterialization(request, taskOutcome, context), now,
  );
  let cleanup: RuntimeCleanupReceipt;
  if (result.kind === "RESOLVED") {
    try { cleanup = normalizeCleanup(result.value, request, taskOutcome, "recovery"); }
    catch { cleanup = failedCleanup("provider recovery cleanup returned an invalid receipt", ["recovery-cleanup-invalid"]); }
  } else if (result.kind === "REJECTED") cleanup = failedCleanup("provider recovery cleanup threw", ["recovery-cleanup-exception"]);
  else cleanup = failedCleanup("provider recovery cleanup timed out", ["recovery-cleanup-timeout"]);
  if (unsettledMaterialization) cleanup = forceUnsettledFailure(cleanup, "materialization-operation-unsettled");
  if (result.kind !== "RESOLVED" && result.unsettled) cleanup = forceUnsettledFailure(cleanup, "recovery-cleanup-operation-unsettled");
  return cleanup;
}

export async function materializedCleanup(
  provider: RuntimeProviderSpi,
  materialization: RuntimeMaterialization,
  request: RuntimeRequest,
  taskOutcome: RuntimeOutcomeState,
  unsettledTaskOperation: string | null,
  now: () => number,
): Promise<RuntimeCleanupReceipt> {
  const result = await runBoundedStage(
    "cleanup", request.cleanup.maxDurationMs, request.limits.cancellationGraceMs, undefined,
    (context) => provider.cleanup(materialization, request, taskOutcome, context), now,
  );
  let cleanup: RuntimeCleanupReceipt;
  if (result.kind === "RESOLVED") {
    try { cleanup = normalizeCleanup(result.value, request, taskOutcome, "materialized"); }
    catch { cleanup = failedCleanup("provider cleanup returned an invalid receipt", ["cleanup-invalid"]); }
  } else if (result.kind === "REJECTED") cleanup = failedCleanup("provider cleanup threw", ["cleanup-exception"]);
  else cleanup = failedCleanup("provider cleanup timed out", ["cleanup-timeout"]);
  if (unsettledTaskOperation !== null) cleanup = forceUnsettledFailure(cleanup, unsettledTaskOperation);
  if (result.kind !== "RESOLVED" && result.unsettled) cleanup = forceUnsettledFailure(cleanup, "cleanup-operation-unsettled");
  return cleanup;
}
