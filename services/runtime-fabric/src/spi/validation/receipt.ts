import {
  RUNTIME_RECEIPT_SCHEMA,
  runtimeEvidenceForOutcome,
  validateRuntimeEnvironmentSubject,
  validateRuntimeProviderSubject,
  validateRuntimeRequest,
  type RuntimeExit,
  type RuntimeOutcomeState,
  type RuntimeReceipt,
  type RuntimeStage,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import { validateRuntimeLifecycleTrace } from "../../state-machine/index.ts";
import {
  OUTCOMES,
  RECEIPT_KEYS,
  canonical,
  enumValue,
  exactKeys,
  nonNegativeInteger,
  portableDetail,
  record,
  runtimeRequestDigest,
} from "./common.ts";
import { normalizeCleanup, normalizeCollection, normalizeExit, validateWorkspaceIdentity } from "./results.ts";

function assertOutcome(value: unknown, name: string): asserts value is RuntimeOutcomeState {
  if (typeof value !== "string" || !OUTCOMES.has(value as RuntimeOutcomeState)) throw new Error(`${name} is invalid`);
}

function assertEmptyExit(exit: RuntimeExit, name: string): void {
  if (exit.code !== null || exit.signal !== null || exit.timedOut || exit.cancelled) throw new Error(`${name} must be empty`);
}

function allowedTaskOutcome(stage: RuntimeStage, outcome: RuntimeOutcomeState): boolean {
  switch (stage) {
    case "RESOLUTION": return ["ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED", "REFUSED_POLICY"].includes(outcome);
    case "ADMISSION": return ["FAILED_ADMISSION", "REFUSED_POLICY", "CANCELLED", "TIMED_OUT"].includes(outcome);
    case "MATERIALIZATION": return ["FAILED_MATERIALIZATION", "CANCELLED", "TIMED_OUT"].includes(outcome);
    case "EXECUTION": return ["FAILED_EXECUTION", "CANCELLED", "TIMED_OUT"].includes(outcome);
    case "COLLECTION": return ["COMPLETED", "FAILED_ARTIFACT", "CANCELLED", "TIMED_OUT"].includes(outcome);
    case "CLEANUP": return false;
  }
}

function lifecycleContainsStage(lifecycle: readonly string[], stage: RuntimeStage): boolean {
  switch (stage) {
    case "RESOLUTION": return lifecycle.includes("RESOLVED");
    case "ADMISSION": return lifecycle.includes("ADMISSION_CHECKED");
    case "MATERIALIZATION": return lifecycle.includes("MATERIALIZING") && lifecycle.includes("CLEANING");
    case "EXECUTION": return lifecycle.includes("RUNNING") && lifecycle.includes("CLEANING");
    case "COLLECTION": return lifecycle.includes("COLLECTING") && lifecycle.includes("CLEANING");
    case "CLEANUP": return lifecycle.includes("CLEANING");
  }
}

export function assertRuntimeReceiptMatchesRequest(receiptValue: RuntimeReceipt, value: unknown): void {
  const request = validateRuntimeRequest(value);
  const receipt = record(receiptValue, "runtime receipt") as unknown as RuntimeReceipt;
  exactKeys(receipt as unknown as Record<string, unknown>, RECEIPT_KEYS, "runtime receipt");
  if (receipt.schema !== RUNTIME_RECEIPT_SCHEMA) throw new Error("runtime receipt schema mismatch");
  if (receipt.requestId !== request.requestId) throw new Error("runtime receipt requestId mismatch");
  if (receipt.requestDigest !== runtimeRequestDigest(request)) throw new Error("runtime receipt request digest mismatch");

  const provider = record(receipt.provider, "runtime receipt provider");
  exactKeys(provider, ["id", "version", "scope", "capabilities", "subject", "environmentSubject"], "runtime receipt provider");
  if (receipt.provider.id !== request.providerId || receipt.provider.scope !== request.scope) throw new Error("runtime receipt provider mismatch");
  if (!Array.isArray(receipt.provider.capabilities) || new Set(receipt.provider.capabilities).size !== receipt.provider.capabilities.length) {
    throw new Error("runtime receipt provider capabilities are invalid");
  }
  if (receipt.provider.capabilities.join("\u0000") !== [...receipt.provider.capabilities].sort().join("\u0000")) {
    throw new Error("runtime receipt provider capabilities are not canonical");
  }
  if (receipt.provider.version === "unresolved") {
    if (receipt.provider.subject !== null || receipt.provider.environmentSubject !== null || receipt.provider.capabilities.length !== 0) {
      throw new Error("unresolved provider contains observed identity");
    }
  } else {
    if (receipt.provider.version !== request.providerVersion) throw new Error("runtime receipt provider version mismatch");
    if (receipt.provider.subject === null || receipt.provider.environmentSubject === null) throw new Error("runtime receipt lacks exact provider subjects");
    const subject = validateRuntimeProviderSubject(receipt.provider.subject, "runtime receipt provider.subject");
    const environmentSubject = validateRuntimeEnvironmentSubject(
      receipt.provider.environmentSubject,
      "runtime receipt provider.environmentSubject",
    );
    if (canonical(subject) !== canonical(request.providerSubject)) throw new Error("runtime receipt provider subject mismatch");
    if (canonical(environmentSubject) !== canonical(request.environmentSubject)) throw new Error("runtime receipt environment subject mismatch");
    for (const capability of request.requiredCapabilities) {
      if (!receipt.provider.capabilities.includes(capability)) throw new Error(`runtime receipt provider lacks required capability: ${capability}`);
    }
  }

  if (canonical(receipt.source) !== canonical(request.source)) throw new Error("runtime receipt source mismatch");
  if (receipt.workspaceIdentity !== null) validateWorkspaceIdentity(receipt.workspaceIdentity);
  validateRuntimeLifecycleTrace(receipt.lifecycle);
  const taskStage = enumValue(receipt.taskStage, "runtime receipt taskStage", [
    "RESOLUTION", "ADMISSION", "MATERIALIZATION", "EXECUTION", "COLLECTION", "CLEANUP",
  ] as const);
  const terminalStage = enumValue(receipt.terminalStage, "runtime receipt terminalStage", [
    "RESOLUTION", "ADMISSION", "MATERIALIZATION", "EXECUTION", "COLLECTION", "CLEANUP",
  ] as const);
  assertOutcome(receipt.taskOutcome, "runtime receipt taskOutcome");
  assertOutcome(receipt.outcome, "runtime receipt outcome");
  if (!allowedTaskOutcome(taskStage, receipt.taskOutcome)) throw new Error("runtime receipt taskStage does not own taskOutcome");
  if (!lifecycleContainsStage(receipt.lifecycle, taskStage)) throw new Error("runtime receipt lifecycle does not contain taskStage");
  if (receipt.outcome !== receipt.lifecycle[receipt.lifecycle.length - 1]) throw new Error("runtime receipt outcome does not match lifecycle terminal state");
  if (receipt.outcome === "FAILED_CLEANUP") {
    if (terminalStage !== "CLEANUP" || receipt.taskOutcome === "FAILED_CLEANUP") throw new Error("cleanup failure lost its pre-cleanup result");
  } else {
    if (terminalStage !== taskStage || receipt.taskOutcome !== receipt.outcome) {
      throw new Error("runtime receipt terminal stage or outcome disagrees without cleanup failure");
    }
  }
  if (receipt.state !== runtimeEvidenceForOutcome(receipt.outcome)) throw new Error("runtime receipt evidence state does not match outcome");

  const admission = record(receipt.admission, "runtime receipt admission");
  exactKeys(admission, ["state", "detail"], "runtime receipt admission");
  enumValue(admission.state, "runtime receipt admission.state", ["PASS", "FAIL", "NOT_EXERCISED"] as const);
  portableDetail(admission.detail, "runtime receipt admission.detail");
  if (taskStage === "RESOLUTION" && receipt.taskOutcome !== "REFUSED_POLICY" && receipt.admission.state !== "NOT_EXERCISED") {
    throw new Error("resolution receipt has exercised admission state");
  }
  if (taskStage === "ADMISSION" && receipt.admission.state !== "FAIL") throw new Error("admission terminal receipt must contain FAIL admission");
  if (["MATERIALIZATION", "EXECUTION", "COLLECTION"].includes(taskStage) && receipt.admission.state !== "PASS") {
    throw new Error("post-admission receipt lacks PASS admission");
  }

  const exit = normalizeExit(receipt.exit);
  const output = record(receipt.output, "runtime receipt output");
  exactKeys(output, ["stdoutBytes", "stderrBytes"], "runtime receipt output");
  const stdoutBytes = nonNegativeInteger(receipt.output.stdoutBytes, "runtime receipt output.stdoutBytes", request.limits.maxOutputBytes);
  const stderrBytes = nonNegativeInteger(receipt.output.stderrBytes, "runtime receipt output.stderrBytes", request.limits.maxOutputBytes);
  if (stdoutBytes + stderrBytes > request.limits.maxOutputBytes) throw new Error("runtime receipt output exceeds request limit");

  if (["RESOLUTION", "ADMISSION", "MATERIALIZATION"].includes(taskStage)) {
    assertEmptyExit(exit, "pre-execution runtime receipt exit");
    if (stdoutBytes !== 0 || stderrBytes !== 0 || receipt.artifacts.length !== 0 || receipt.touchedPaths.length !== 0) {
      throw new Error("pre-execution receipt contains execution or collection evidence");
    }
  }
  if (taskStage === "EXECUTION") {
    if (receipt.taskOutcome === "TIMED_OUT" && !exit.timedOut) throw new Error("execution timeout lacks timeout exit evidence");
    if (receipt.taskOutcome === "CANCELLED" && !exit.cancelled) throw new Error("execution cancellation lacks cancellation exit evidence");
    if (receipt.artifacts.length !== 0 || receipt.touchedPaths.length !== 0) throw new Error("execution-stage receipt contains collection evidence");
  }
  if (taskStage === "COLLECTION") {
    if (exit.code !== 0 || exit.signal !== null || exit.timedOut || exit.cancelled) throw new Error("collection-stage receipt lacks successful execution exit");
    normalizeCollection(
      {
        state: receipt.taskOutcome === "COMPLETED" ? "PASS" : "FAIL",
        artifacts: receipt.artifacts,
        touchedPaths: receipt.touchedPaths,
        detail: "receipt collection validation",
      },
      request,
    );
  }

  const cleanupMode = taskStage === "MATERIALIZATION" ? "recovery" : "materialized";
  const cleanup = normalizeCleanup(receipt.cleanup, request, receipt.taskOutcome, cleanupMode);
  if (["RESOLUTION", "ADMISSION"].includes(taskStage)) {
    if (receipt.workspaceIdentity !== null || cleanup.state !== "NOT_EXERCISED") throw new Error("pre-materialization receipt contains workspace cleanup evidence");
  } else if (taskStage === "MATERIALIZATION") {
    if (receipt.workspaceIdentity !== null || cleanup.state === "NOT_EXERCISED") throw new Error("materialization failure lacks recovery cleanup evidence");
  } else {
    if (receipt.workspaceIdentity === null || cleanup.state === "NOT_EXERCISED") throw new Error("materialized receipt lacks workspace or cleanup evidence");
  }
  if (receipt.outcome === "FAILED_CLEANUP" && cleanup.state !== "FAIL") throw new Error("FAILED_CLEANUP receipt lacks failed cleanup");
  if (receipt.outcome !== "FAILED_CLEANUP" && !["RESOLUTION", "ADMISSION"].includes(taskStage) && cleanup.state !== "PASS") {
    throw new Error("non-cleanup-failure receipt lacks PASS cleanup");
  }

  if (receipt.exclusions.join("\u0000") !== request.exclusions.join("\u0000")) throw new Error("runtime receipt exclusions mismatch");
  portableDetail(receipt.detail, "runtime receipt detail");
}
