import {
  RUNTIME_RECEIPT_SCHEMA,
  runtimeEvidenceForOutcome,
  type RuntimeAdmissionReceipt,
  type RuntimeCleanupReceipt,
  type RuntimeObservedProvider,
  type RuntimeOutcomeState,
  type RuntimeProviderDescriptor,
  type RuntimeReceipt,
  type RuntimeRequest,
  type RuntimeStage,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import { RuntimeLifecycle, validateRuntimeLifecycleTrace } from "../../state-machine/index.ts";
import {
  assertRuntimeReceiptMatchesRequest,
  deepFreeze,
  emptyExit,
  runtimeRequestDigest,
  unexercisedCleanup,
} from "../validation.ts";

export function safeCombinedDetail(parts: readonly string[]): string {
  const combined = parts.filter((entry) => entry.length > 0).join("; ");
  return combined.length <= 1024 ? combined : `${combined.slice(0, 1021)}...`;
}

export function observedProvider(descriptor: RuntimeProviderDescriptor): RuntimeObservedProvider {
  return {
    id: descriptor.id,
    version: descriptor.version,
    scope: descriptor.scope,
    capabilities: [...descriptor.capabilities],
    subject: descriptor.subject,
    environmentSubject: descriptor.environmentSubject,
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
  taskStage: Extract<RuntimeStage, "RESOLUTION" | "ADMISSION">,
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

export function forceUnsettledFailure(
  cleanup: RuntimeCleanupReceipt,
  residueId: string,
): RuntimeCleanupReceipt {
  const residue = [...new Set([...cleanup.residue, residueId])].sort();
  return {
    ...cleanup,
    state: "FAIL",
    workspaceDisposition: "UNKNOWN",
    preservationRef: null,
    residue,
    detail: safeCombinedDetail([cleanup.detail, `${residueId} after cancellation grace`]),
  };
}
