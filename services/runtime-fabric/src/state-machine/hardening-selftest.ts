import {
  validateRuntimeRequest,
  type RuntimeArtifactRef,
  type RuntimeReceipt,
  type RuntimeRequest,
} from "../../../../packages/contracts/src/runtime/index.ts";
import {
  assertRuntimeReceiptMatchesRequest,
  dispatchRuntimeRequest,
  runRuntimeProvider,
  RuntimeProviderRegistry,
} from "../spi/index.ts";
import { FixtureProvider } from "./provider-fixture.ts";
import { requestValue } from "./request-fixture.ts";
import { ok, red } from "./test-support.ts";

const WORKSPACE_SNAPSHOT: RuntimeArtifactRef = {
  kind: "workspace-snapshot",
  sha256: "f".repeat(64),
  bytes: 64,
  mediaType: "application/octet-stream",
};

function failedPreservationReceipt(detail: string) {
  return {
    state: "FAIL" as const,
    durationMs: 1,
    processesChecked: true,
    workspaceChecked: true,
    sessionsChecked: true,
    workspaceDisposition: "PRESERVED_BY_POLICY" as const,
    preservationRef: WORKSPACE_SNAPSHOT,
    residue: ["workspace-preservation-conflict"],
    detail,
  };
}

function withCleanupFailure(receipt: RuntimeReceipt, detail: string): RuntimeReceipt {
  return {
    ...receipt,
    lifecycle: [...receipt.lifecycle.slice(0, -1), "FAILED_CLEANUP"],
    terminalStage: "cleanup",
    outcome: "FAILED_CLEANUP",
    state: "FAIL",
    cleanup: failedPreservationReceipt(detail),
  };
}

export async function runtimeHardeningSelftest(
  valid: RuntimeRequest,
  positive: RuntimeReceipt,
): Promise<void> {
  const missingRequest = validateRuntimeRequest({
    ...valid,
    providerId: "missing-provider",
    providerSubject: { ...valid.providerSubject, id: "missing-provider" },
  });
  const missing = await dispatchRuntimeRequest(
    new RuntimeProviderRegistry([new FixtureProvider()]),
    missingRequest,
  );
  ok(
    missing.provider.version === "unresolved" &&
    missing.lifecycle.join("\u0000") === ["UNRESOLVED", "RESOLVED", "ABSENT"].join("\u0000"),
    "unresolved provider fixture drifted",
  );

  red(
    () => assertRuntimeReceiptMatchesRequest({
      ...missing,
      lifecycle: ["UNRESOLVED", "RESOLVED", "NOT_IMPLEMENTED"],
      taskOutcome: "NOT_IMPLEMENTED",
      outcome: "NOT_IMPLEMENTED",
      state: "NOT_IMPLEMENTED",
    }, missingRequest),
    "unresolved provider claimed NOT_IMPLEMENTED",
  );
  red(
    () => assertRuntimeReceiptMatchesRequest({
      ...missing,
      lifecycle: ["UNRESOLVED", "ABSENT"],
    }, missingRequest),
    "unresolved provider skipped registry resolution",
  );

  const aggregateJson = requestValue();
  const input: Record<string, unknown> = {};
  for (let group = 0; group < 200; group += 1) {
    input[`group-${group}`] = Array.from({ length: 100 }, (_, index) => index);
  }
  (aggregateJson.workload as Record<string, unknown>).input = input;
  aggregateJson.limits = {
    ...(aggregateJson.limits as Record<string, unknown>),
    maxInputBytes: 1_000_000,
  };
  red(
    () => validateRuntimeRequest(aggregateJson),
    "aggregate JSON node budget",
  );

  for (const sensitivePath of [
    "workspace/.env",
    "workspace/.env.production",
    "workspace/.git/config",
    "workspace/.ssh/id_ed25519",
    "workspace/browser-profile/state.json",
    "workspace/keys/signing.pem",
  ]) {
    const sensitiveRequest = requestValue();
    (sensitiveRequest.mutation as Record<string, unknown>).writableRoots = [sensitivePath];
    red(
      () => validateRuntimeRequest(sensitiveRequest),
      `sensitive mutation root ${sensitivePath}`,
    );
  }

  const sensitiveWrite = new FixtureProvider();
  sensitiveWrite.collect = async () => ({
    state: "PASS",
    artifacts: [{ kind: "log", sha256: "d".repeat(64), bytes: 5, mediaType: "text/plain" }],
    touchedPaths: ["workspace/output/.env"],
    detail: "attempted sensitive write",
  });
  const sensitiveWriteReceipt = await runRuntimeProvider(sensitiveWrite, valid);
  ok(
    sensitiveWriteReceipt.taskStage === "collection" &&
    sensitiveWriteReceipt.taskOutcome === "FAILED_ARTIFACT" &&
    sensitiveWriteReceipt.cleanup.state === "PASS",
    "sensitive touched path stayed green",
  );

  const preserveOnFailureRequest = validateRuntimeRequest({
    ...valid,
    cleanup: { ...valid.cleanup, workspaceCleanup: "preserve-on-failure" },
  });
  const successfulPreservePolicy = await runRuntimeProvider(
    new FixtureProvider(),
    preserveOnFailureRequest,
  );
  ok(successfulPreservePolicy.taskOutcome === "COMPLETED", "successful preservation fixture failed");
  red(
    () => assertRuntimeReceiptMatchesRequest(
      withCleanupFailure(successfulPreservePolicy, "preserved successful task"),
      preserveOnFailureRequest,
    ),
    "successful task preservation under preserve-on-failure",
  );

  const failedDeleteProvider = new FixtureProvider();
  failedDeleteProvider.executionState = "FAIL";
  const failedDelete = await runRuntimeProvider(failedDeleteProvider, valid);
  ok(failedDelete.taskOutcome === "FAILED_EXECUTION", "failed delete-policy fixture failed");
  red(
    () => assertRuntimeReceiptMatchesRequest(
      withCleanupFailure(failedDelete, "preserved under delete policy"),
      valid,
    ),
    "failed task preservation under delete policy",
  );

  assertRuntimeReceiptMatchesRequest(positive, valid);
}
