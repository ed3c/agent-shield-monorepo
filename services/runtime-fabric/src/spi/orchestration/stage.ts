import type { RuntimeStage } from "../../../../../packages/contracts/src/runtime/index.ts";
import type { RuntimeOperationContext } from "../types.ts";

export type StageRun<T> =
  | { kind: "RESOLVED"; value: T; unsettled: false }
  | { kind: "REJECTED"; unsettled: false }
  | { kind: "TIMED_OUT" | "CANCELLED"; unsettled: boolean };

export async function runBoundedStage<T>(
  stage: RuntimeStage,
  timeoutMs: number,
  cancellationGraceMs: number,
  externalSignal: AbortSignal | undefined,
  invoke: (context: RuntimeOperationContext) => Promise<T>,
): Promise<StageRun<T>> {
  if (externalSignal?.aborted) return { kind: "CANCELLED", unsettled: false };
  if (timeoutMs <= 0) return { kind: "TIMED_OUT", unsettled: false };
  const controller = new AbortController();
  let abortKind: "TIMED_OUT" | "CANCELLED" | null = null;
  let abortResolve: ((kind: "TIMED_OUT" | "CANCELLED") => void) | null = null;
  const abortPromise = new Promise<"TIMED_OUT" | "CANCELLED">((resolve) => { abortResolve = resolve; });
  const abort = (kind: "TIMED_OUT" | "CANCELLED"): void => {
    if (abortKind !== null) return;
    abortKind = kind;
    controller.abort(kind);
    abortResolve?.(kind);
  };
  const timeoutHandle = setTimeout(() => abort("TIMED_OUT"), timeoutMs);
  const externalAbort = (): void => abort("CANCELLED");
  externalSignal?.addEventListener("abort", externalAbort, { once: true });
  const context: RuntimeOperationContext = {
    stage,
    signal: controller.signal,
    deadlineEpochMs: Date.now() + timeoutMs,
    cancellationGraceMs,
  };
  const settled = Promise.resolve().then(() => invoke(context)).then(
    (value) => ({ kind: "RESOLVED" as const, value }),
    () => ({ kind: "REJECTED" as const }),
  );
  const first = await Promise.race([settled, abortPromise.then((kind) => ({ kind } as const))]);
  clearTimeout(timeoutHandle);
  externalSignal?.removeEventListener("abort", externalAbort);
  if (first.kind === "RESOLVED") return { kind: "RESOLVED", value: first.value, unsettled: false };
  if (first.kind === "REJECTED") return { kind: "REJECTED", unsettled: false };
  let graceHandle: ReturnType<typeof setTimeout> | null = null;
  const graceExpired = new Promise<"GRACE_EXPIRED">((resolve) => { graceHandle = setTimeout(() => resolve("GRACE_EXPIRED"), cancellationGraceMs); });
  const afterAbort = await Promise.race([settled, graceExpired]);
  if (graceHandle !== null) clearTimeout(graceHandle);
  return { kind: first.kind, unsettled: afterAbort === "GRACE_EXPIRED" };
}

export function taskBudget(deadlineMonotonicMs: number): number {
  return Math.max(0, Math.ceil(deadlineMonotonicMs - globalThis.performance.now()));
}
