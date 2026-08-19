import {
  InceptionSandboxContractError,
  validateCleanupReadback,
  validateRuntimeContract,
  validateSteeringRequest,
} from "../../src/providers/inception-sandbox/validate.ts";
import type {
  InceptionRuntimeContract,
  SteeringRequest,
} from "../../src/providers/inception-sandbox/types.ts";

const RUNTIME_COMMIT = "cdfe74ac993cb0b4795fa80df237e8bb542409d2";
const RUNTIME_TREE = "0b2db695cdd812f81924b82689d96e3557b80158";
const NOW = "2026-08-19T12:00:00Z";

function contract(): InceptionRuntimeContract {
  return {
    schemaVersion: "runtime-env/inception-runtime-capability/v1",
    runtimeSubject: {
      repository: "ed3c/runtime-env",
      commit: RUNTIME_COMMIT,
      tree: RUNTIME_TREE,
    },
    workload: {
      name: "inception-agent-probe",
      imageDigest: "sha256:" + "1".repeat(64),
      argv: ["python3", "-m", "runtime_probe"],
      timeoutSeconds: 60,
      resources: {
        cpuMillis: 1000,
        memoryMb: 512,
        pids: 64,
        outputBytes: 1_048_576,
      },
    },
    policy: {
      policyDigest: "sha256:" + "2".repeat(64),
      network: "NONE",
      privileged: false,
      hostMounts: [],
      runAsRoot: false,
    },
    environmentNames: ["TASK_ID", "WORKSPACE_LEASE_ID"],
    workspaceLease: {
      leaseId: "lease:inception-a2:fixture",
      workspaceName: "inception-a2-fixture",
      expiresAt: "2026-08-20T00:00:00Z",
    },
    capabilities: {
      streamingVisibility: "NOT_EXERCISED",
      safeTransactionBoundary: "SUPPORTED",
      cancellation: "UNSUPPORTED",
      resume: "UNKNOWN",
      assistantPrefill: "UNSUPPORTED",
      tokenizerIdentity: "NOT_EXERCISED",
      contextLimit: "NOT_EXERCISED",
      toolCallTransactions: "SUPPORTED",
      hiddenReasoningAccess: "ABSENT",
    },
    cleanup: {
      descendantsTerminated: true,
      workspaceRemoved: true,
      residueInventoryRequired: true,
    },
  };
}

function clone(): InceptionRuntimeContract {
  return structuredClone(contract());
}

function mustRefuse(label: string, operation: () => void, pattern: RegExp): void {
  try {
    operation();
  } catch (error) {
    if (!(error instanceof InceptionSandboxContractError)) {
      throw new Error(`${label}: wrong error type: ${String(error)}`);
    }
    if (!pattern.test(error.message)) {
      throw new Error(`${label}: unexpected message: ${error.message}`);
    }
    return;
  }
  throw new Error(`${label}: mutation was not refused`);
}

validateRuntimeContract(contract(), NOW);

{
  const value = clone();
  value.workload.imageDigest = "runtime:latest";
  mustRefuse("mutable image", () => validateRuntimeContract(value, NOW), /digest-pinned/);
}

{
  const value = clone();
  value.workload.argv = ["bash", "-lc", "echo ok"];
  mustRefuse("generic shell", () => validateRuntimeContract(value, NOW), /shell/);
}

{
  const value = clone();
  value.environmentNames = ["API_KEY=secret"];
  mustRefuse("secret value", () => validateRuntimeContract(value, NOW), /environment values/);
}

{
  const value = clone() as InceptionRuntimeContract & {
    policy: InceptionRuntimeContract["policy"] & { privileged: boolean };
  };
  value.policy.privileged = true;
  mustRefuse("privileged", () => validateRuntimeContract(value, NOW), /privileged/);
}

{
  const value = clone();
  value.workspaceLease.workspaceName = "../escape";
  mustRefuse("workspace escape", () => validateRuntimeContract(value, NOW), /escape/);
}

{
  const value = clone();
  value.workspaceLease.expiresAt = "2026-08-18T00:00:00Z";
  mustRefuse("stale lease", () => validateRuntimeContract(value, NOW), /stale/);
}

{
  const value = clone() as InceptionRuntimeContract & {
    capabilities: InceptionRuntimeContract["capabilities"] & {
      hiddenReasoningAccess: string;
    };
  };
  value.capabilities.hiddenReasoningAccess = "SUPPORTED";
  mustRefuse("hidden reasoning", () => validateRuntimeContract(value, NOW), /hidden reasoning/);
}

const checkpoint: SteeringRequest = {
  action: "CHECKPOINT",
  safeSyncPointObserved: true,
  activeToolTransaction: false,
  leaseId: contract().workspaceLease.leaseId,
};
validateSteeringRequest(contract(), checkpoint);

mustRefuse(
  "active transaction",
  () =>
    validateSteeringRequest(contract(), {
      ...checkpoint,
      activeToolTransaction: true,
    }),
  /active tool transaction/,
);

mustRefuse(
  "unsupported cancellation",
  () =>
    validateSteeringRequest(contract(), {
      ...checkpoint,
      action: "CANCEL",
    }),
  /cancellation is unsupported/,
);

mustRefuse(
  "stale steering lease",
  () =>
    validateSteeringRequest(contract(), {
      ...checkpoint,
      leaseId: "lease:other",
    }),
  /stale or foreign lease/,
);

validateCleanupReadback({
  pathResidue: 0,
  processResidue: 0,
  portResidue: 0,
  indexResidue: 0,
  containerResidue: 0,
  mountResidue: 0,
  artifactResidue: 0,
});

mustRefuse(
  "cleanup residue",
  () =>
    validateCleanupReadback({
      pathResidue: 0,
      processResidue: 1,
      portResidue: 0,
      indexResidue: 0,
      containerResidue: 0,
      mountResidue: 0,
      artifactResidue: 0,
    }),
  /processResidue remains/,
);

console.log("PASS inception-a2 sandbox contract and disagreement controls");
