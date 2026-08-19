import type {
  CleanupReadback,
  InceptionRuntimeContract,
  SteeringRequest,
} from "./types.ts";

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const WORKSPACE_NAME = /^[A-Za-z0-9._-]{1,128}$/;
const FORBIDDEN_ENTRYPOINTS = new Set([
  "sh",
  "bash",
  "zsh",
  "cmd.exe",
  "powershell",
  "pwsh",
]);

export class InceptionSandboxContractError extends Error {}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new InceptionSandboxContractError(message);
}

function parseAwareTime(value: string, label: string): number {
  assert(/(?:Z|[+-]\d\d:\d\d)$/.test(value), `${label} must include a timezone`);
  const parsed = Date.parse(value);
  assert(Number.isFinite(parsed), `${label} must be a valid timestamp`);
  return parsed;
}

export function validateRuntimeContract(
  contract: InceptionRuntimeContract,
  now: string,
): void {
  assert(
    contract.schemaVersion === "runtime-env/inception-runtime-capability/v1",
    "unsupported runtime contract schema",
  );
  assert(contract.runtimeSubject.repository === "ed3c/runtime-env", "runtime owner drift");
  assert(COMMIT.test(contract.runtimeSubject.commit), "runtime commit must be immutable");
  assert(COMMIT.test(contract.runtimeSubject.tree), "runtime tree must be immutable");

  assert(contract.workload.name === "inception-agent-probe", "unexpected workload");
  assert(DIGEST.test(contract.workload.imageDigest), "image must be digest-pinned");
  assert(contract.workload.argv.length > 0, "argv must not be empty");
  assert(
    !FORBIDDEN_ENTRYPOINTS.has(contract.workload.argv[0] ?? ""),
    "generic shell entrypoint is forbidden",
  );
  assert(
    contract.workload.argv.every((value) => value.length > 0 && !value.includes("\u0000")),
    "argv contains an invalid token",
  );
  assert(
    contract.workload.timeoutSeconds > 0 && contract.workload.timeoutSeconds <= 900,
    "timeout is unbounded",
  );
  for (const [name, value] of Object.entries(contract.workload.resources)) {
    assert(Number.isInteger(value) && value > 0, `resource ${name} must be bounded`);
  }

  assert(DIGEST.test(contract.policy.policyDigest), "policy must be digest-pinned");
  assert(
    contract.policy.network === "NONE" || contract.policy.network === "ALLOWLIST_ONLY",
    "network policy widened",
  );
  assert(contract.policy.privileged === false, "privileged execution is forbidden");
  assert(contract.policy.runAsRoot === false, "root execution is forbidden");
  assert(contract.policy.hostMounts.length === 0, "host mounts are forbidden");

  const environmentNames = [...contract.environmentNames];
  assert(
    new Set(environmentNames).size === environmentNames.length,
    "environment names must be unique",
  );
  for (const name of environmentNames) {
    assert(ENV_NAME.test(name) && !name.includes("="), "environment values are forbidden");
  }

  assert(
    WORKSPACE_NAME.test(contract.workspaceLease.workspaceName) &&
      !contract.workspaceLease.workspaceName.includes(".."),
    "workspace escape is forbidden",
  );
  assert(contract.workspaceLease.leaseId.length > 0, "lease id is required");
  const current = parseAwareTime(now, "evaluation time");
  const expires = parseAwareTime(contract.workspaceLease.expiresAt, "lease expiry");
  assert(expires > current, "workspace lease is stale");

  assert(
    contract.capabilities.hiddenReasoningAccess === "ABSENT",
    "hidden reasoning is not an admitted control surface",
  );
  assert(contract.cleanup.descendantsTerminated === true, "descendant cleanup required");
  assert(contract.cleanup.workspaceRemoved === true, "workspace cleanup required");
  assert(
    contract.cleanup.residueInventoryRequired === true,
    "residue inventory is required",
  );
}

export function validateSteeringRequest(
  contract: InceptionRuntimeContract,
  request: SteeringRequest,
): void {
  assert(
    request.leaseId === contract.workspaceLease.leaseId,
    "steering request uses a stale or foreign lease",
  );
  if (request.action === "NO_ACTION" || request.action === "HUMAN_ESCALATE") return;
  assert(request.safeSyncPointObserved, "steering requires a visible safe synchronization point");
  assert(!request.activeToolTransaction, "active tool transaction cannot be interrupted");

  if (request.action === "CANCEL") {
    assert(contract.capabilities.cancellation === "SUPPORTED", "cancellation is unsupported");
  }
  if (request.action === "CHECKPOINT") {
    assert(
      contract.capabilities.safeTransactionBoundary === "SUPPORTED",
      "checkpoint boundary is unsupported",
    );
  }
  if (request.action === "TOOL_REQUEST") {
    assert(
      contract.capabilities.toolCallTransactions === "SUPPORTED",
      "tool-call transaction semantics are unsupported",
    );
  }
}

export function validateCleanupReadback(readback: CleanupReadback): void {
  for (const [name, count] of Object.entries(readback)) {
    assert(Number.isInteger(count) && count >= 0, `${name} is invalid`);
    assert(count === 0, `${name} remains after cleanup`);
  }
}
