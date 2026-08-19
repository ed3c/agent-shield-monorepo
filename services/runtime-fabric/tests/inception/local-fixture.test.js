import {
  InceptionSandboxContractError,
} from "../../src/providers/inception-sandbox/validate.ts";
import {
  runReversibleLocalFixture,
  validateLocalFixtureReceipt,
} from "./local-fixture.js";

const NOW = "2026-08-19T12:00:00Z";

function contract() {
  return {
    schemaVersion: "runtime-env/inception-runtime-capability/v1",
    runtimeSubject: {
      repository: "ed3c/runtime-env",
      commit: "cdfe74ac993cb0b4795fa80df237e8bb542409d2",
      tree: "0b2db695cdd812f81924b82689d96e3557b80158",
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
      leaseId: "lease:inception-a2:local-fixture",
      workspaceName: "inception-a2-local-fixture",
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

function mustRefuse(label, operation, pattern) {
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

const receipt = runReversibleLocalFixture(contract(), NOW);
if (receipt.evidence.localExecution !== "PASS") {
  throw new Error("local execution did not produce a local PASS receipt");
}
if (receipt.evidence.providerObservation !== "NOT_EXERCISED") {
  throw new Error("local fixture incorrectly promoted provider evidence");
}
if (receipt.evidence.networkIsolation !== "NOT_EXERCISED") {
  throw new Error("local fixture incorrectly promoted network-isolation evidence");
}
if (Object.values(receipt.cleanup).some((value) => value !== 0)) {
  throw new Error(`terminal residue remains: ${JSON.stringify(receipt.cleanup)}`);
}
if (receipt.environmentNames.join(",") !== "TASK_ID,WORKSPACE_LEASE_ID") {
  throw new Error("receipt did not preserve environment names only");
}

{
  const promoted = structuredClone(receipt);
  promoted.evidence.providerObservation = "PASS";
  mustRefuse(
    "provider promotion",
    () => validateLocalFixtureReceipt(promoted),
    /provider observation/,
  );
}

{
  const dirty = structuredClone(receipt);
  dirty.cleanup.pathResidue = 1;
  mustRefuse(
    "dirty cleanup",
    () => validateLocalFixtureReceipt(dirty),
    /pathResidue remains/,
  );
}

{
  const widened = structuredClone(contract());
  widened.policy.network = "ALLOWLIST_ONLY";
  mustRefuse(
    "network widening",
    () => runReversibleLocalFixture(widened, NOW),
    /strict NONE/,
  );
}

console.log(
  "PASS inception-a2 reversible local process fixture, terminal residue and evidence-lane controls",
);
