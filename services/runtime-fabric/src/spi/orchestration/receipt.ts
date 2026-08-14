import {
  RUNTIME_RECEIPT_SCHEMA,
  runtimeEvidenceForOutcome,
  type RuntimeAdmissionReceipt,
  type RuntimeCleanupReceipt,
  type RuntimeObservedProvider,
  type RuntimeOutcomeState,
  type RuntimeReceipt,
  type RuntimeRequest,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import { RuntimeLifecycle, validateRuntimeLifecycleTrace } from "../../state-machine/index.ts";
import {
  assertRuntimeReceiptMatchesRequest, deepFreeze, emptyExit, runtimeRequestDigest, unexercisedCleanup,
} from "../validation.ts";

export function safeCombinedDetail(parts: readonly string[]): string {
  const combined = parts.filter((entry) => entry.length > 0).join("; ");
  return combined.length <= 1024 ? combined : `${combined.slice(0, 1021)}...`;
}
export function observedProvider(descriptor: {
  id: string; version: string; subject: RuntimeObservedProvider["subject"];
  environment: NonNullable<RuntimeObservedProvider["environmentSubject"]>;
  scope: RuntimeObservedProvider["scope"]; capabilities: string[];
}, request: RuntimeRequest): RuntimeObservedProvider {
  return {
    id: descriptor.id,
    version: descriptor.version,
    subject: descriptor.subject,
    environmentSubject: descriptor.environment,
    scope: descriptor.scope,
    capabilities: [...request.requiredCapabilities],
  };
}
export function finalizeReceipt(request: RuntimeRequest, receipt: RuntimeReceipt): RuntimeReceipt {
  assertRuntimeReceiptMatchesRequest(receipt, request);
  return deepFreeze(receipt);
}
export function earlyReceipt(
  request: RuntimeRequest,
  provider: RuntimeObservedProvider,
  lifecycle: RuntimeLifecycle,
  outcome: RuntimeOutcomeState,
  admission: RuntimeAdmissionReceipt,
  taskStage: "admission" | null,
  detail: string,
): RuntimeReceipt {
  lifecycle.transition(outcome);
  validateRuntimeLifecycleTrace(lifecycle.trace);
  return finalizeReceipt(request, {
    schema: RUNTIME_RECEIPT_SCHEMA,
    requestId: request.requestId,
    requestDigest: runtimeRequestDigest(request),
    provider,
    source: request.source,
    workspaceIdentity: null,
    lifecycle: [...lifecycle.trace],
    taskStage,
    terminalStage: taskStage,
    admission,
    taskOutcome: outcome,
    outcome,
    state: runtimeEvidenceForOutcome(outcome),
    exit: emptyExit(),
    output: { stdoutBytes: 0, stderrBytes: 0 },
    artifacts: [],
    touchedPaths: [],
    cleanup: unexercisedCleanup("no provider workspace was materialized"),
    exclusions: [...request.exclusions],
    detail,
  });
}
export function forceUnsettledFailure(cleanup: RuntimeCleanupReceipt, residueId: string): RuntimeCleanupReceipt {
  return {
    ...cleanup,
    state: "FAIL",
    workspaceDisposition: "UNKNOWN",
    preservationRef: null,
    residue: [...new Set([...cleanup.residue, residueId])].sort(),
    detail: safeCombinedDetail([cleanup.detail, `${residueId} after cancellation grace`]),
  };
}
