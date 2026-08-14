import {
  RUNTIME_RECEIPT_SCHEMA,
  runtimeEvidenceForOutcome,
  validateRuntimeEnvironmentSubject,
  validateRuntimeProviderSubject,
  type RuntimeOutcomeState,
  type RuntimeReceipt,
  type RuntimeRequest,
  type RuntimeStage,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import { validateRuntimeLifecycleTrace } from "../../state-machine/index.ts";
import {
  OUTCOMES, RECEIPT_KEYS, canonical, enumValue, exactKeys, portableDetail, record, runtimeRequestDigest,
} from "./common.ts";
import { validateWorkspaceIdentity } from "./basic.ts";

export interface ReceiptIdentityContext {
  receipt: RuntimeReceipt;
  taskStage: Exclude<RuntimeStage, "cleanup"> | null;
  terminalStage: RuntimeStage | null;
}

function assertOutcome(value: unknown, name: string): asserts value is RuntimeOutcomeState {
  if (typeof value !== "string" || !OUTCOMES.has(value as RuntimeOutcomeState)) throw new Error(`${name} is invalid`);
}
function stageOwnsOutcome(stage: Exclude<RuntimeStage, "cleanup"> | null, outcome: RuntimeOutcomeState): boolean {
  if (stage === null) return ["ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED", "REFUSED_POLICY"].includes(outcome);
  if (stage === "admission") return ["FAILED_ADMISSION", "REFUSED_POLICY", "CANCELLED", "TIMED_OUT"].includes(outcome);
  if (stage === "materialization") return ["FAILED_MATERIALIZATION", "CANCELLED", "TIMED_OUT"].includes(outcome);
  if (stage === "execution") return ["FAILED_EXECUTION", "CANCELLED", "TIMED_OUT"].includes(outcome);
  return ["COMPLETED", "FAILED_ARTIFACT", "CANCELLED", "TIMED_OUT"].includes(outcome);
}

export function validateReceiptIdentity(receiptValue: RuntimeReceipt, request: RuntimeRequest): ReceiptIdentityContext {
  const receipt = record(receiptValue, "runtime receipt") as unknown as RuntimeReceipt;
  exactKeys(receipt as unknown as Record<string, unknown>, RECEIPT_KEYS, "runtime receipt");
  if (receipt.schema !== RUNTIME_RECEIPT_SCHEMA) throw new Error("runtime receipt schema mismatch");
  if (receipt.requestId !== request.requestId || receipt.requestDigest !== runtimeRequestDigest(request)) throw new Error("runtime receipt request mismatch");

  const provider = record(receipt.provider, "runtime receipt provider");
  exactKeys(provider, ["id", "version", "subject", "environmentSubject", "scope", "capabilities"], "runtime receipt provider");
  if (receipt.provider.id !== request.providerId || receipt.provider.scope !== request.scope) throw new Error("runtime receipt provider mismatch");
  if (!Array.isArray(receipt.provider.capabilities) || new Set(receipt.provider.capabilities).size !== receipt.provider.capabilities.length) throw new Error("runtime receipt capabilities invalid");
  if (receipt.provider.capabilities.join("\u0000") !== [...receipt.provider.capabilities].sort().join("\u0000")) throw new Error("runtime receipt capabilities not canonical");
  if (receipt.provider.version === "unresolved") {
    if (receipt.provider.subject !== null || receipt.provider.environmentSubject !== null || receipt.provider.capabilities.length !== 0) throw new Error("unresolved provider contains identity");
  } else {
    if (receipt.provider.version !== request.providerVersion || receipt.provider.subject === null || receipt.provider.environmentSubject === null) throw new Error("runtime receipt exact provider identity missing");
    if (canonical(validateRuntimeProviderSubject(receipt.provider.subject)) !== canonical(request.providerSubject)) throw new Error("runtime receipt provider subject mismatch");
    if (canonical(validateRuntimeEnvironmentSubject(receipt.provider.environmentSubject)) !== canonical(request.environmentSubject)) throw new Error("runtime receipt environment subject mismatch");
    for (const capability of request.requiredCapabilities) if (!receipt.provider.capabilities.includes(capability)) throw new Error(`runtime receipt lacks capability: ${capability}`);
  }
  if (canonical(receipt.source) !== canonical(request.source)) throw new Error("runtime receipt source mismatch");
  if (receipt.workspaceIdentity !== null) validateWorkspaceIdentity(receipt.workspaceIdentity);
  validateRuntimeLifecycleTrace(receipt.lifecycle);

  const taskStage = receipt.taskStage === null ? null : enumValue(receipt.taskStage, "runtime receipt taskStage", ["admission", "materialization", "execution", "collection"] as const);
  const terminalStage = receipt.terminalStage === null ? null : enumValue(receipt.terminalStage, "runtime receipt terminalStage", ["admission", "materialization", "execution", "collection", "cleanup"] as const);
  assertOutcome(receipt.taskOutcome, "runtime receipt taskOutcome");
  assertOutcome(receipt.outcome, "runtime receipt outcome");
  if (!stageOwnsOutcome(taskStage, receipt.taskOutcome)) throw new Error("runtime receipt taskStage does not own taskOutcome");
  if (receipt.outcome !== receipt.lifecycle[receipt.lifecycle.length - 1]) throw new Error("runtime receipt outcome does not match lifecycle");
  if (receipt.outcome === "FAILED_CLEANUP") {
    if (terminalStage !== "cleanup" || receipt.taskOutcome === "FAILED_CLEANUP") throw new Error("cleanup failure lost pre-cleanup outcome");
  } else if (terminalStage !== taskStage || receipt.taskOutcome !== receipt.outcome) {
    throw new Error("runtime receipt stage/outcome mismatch without cleanup failure");
  }
  if (receipt.state !== runtimeEvidenceForOutcome(receipt.outcome)) throw new Error("runtime receipt evidence mismatch");

  const admission = record(receipt.admission, "runtime receipt admission");
  exactKeys(admission, ["state", "detail"], "runtime receipt admission");
  enumValue(admission.state, "runtime receipt admission.state", ["PASS", "FAIL", "NOT_EXERCISED"] as const);
  portableDetail(admission.detail, "runtime receipt admission.detail");
  if (taskStage === null && receipt.taskOutcome !== "REFUSED_POLICY" && receipt.admission.state !== "NOT_EXERCISED") throw new Error("resolution outcome has exercised admission");
  if (taskStage === "admission" && receipt.admission.state !== "FAIL") throw new Error("admission terminal outcome lacks FAIL admission");
  if (["materialization", "execution", "collection"].includes(taskStage ?? "") && receipt.admission.state !== "PASS") throw new Error("post-admission receipt lacks PASS admission");
  return { receipt, taskStage, terminalStage };
}
