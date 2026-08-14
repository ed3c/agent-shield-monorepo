import type { RuntimeRequest } from "../../../../packages/contracts/src/runtime/index.ts";
import { assertRuntimeReceiptMatchesRequest, runRuntimeProvider } from "../spi/index.ts";
import { FixtureProvider } from "./provider-fixture.ts";
import { ok } from "./test-support.ts";

export async function runtimeCleanupSelftest(valid: RuntimeRequest): Promise<void> {
  const cleanupFailure = new FixtureProvider();
  cleanupFailure.cleanupState = "FAIL";
  const cleanup = await runRuntimeProvider(cleanupFailure, valid);
  ok(
    cleanup.taskOutcome === "COMPLETED" && cleanup.outcome === "FAILED_CLEANUP" &&
    cleanup.terminalStage === "CLEANUP" && cleanup.state === "FAIL",
    "cleanup failure hidden",
  );

  const dualFailure = new FixtureProvider();
  dualFailure.executionState = "FAIL";
  dualFailure.cleanupState = "FAIL";
  const dual = await runRuntimeProvider(dualFailure, valid);
  ok(dual.taskOutcome === "FAILED_EXECUTION" && dual.outcome === "FAILED_CLEANUP", "pre-cleanup failure lost");

  const falseCleanup = new FixtureProvider();
  falseCleanup.cleanup = async () => ({
    state: "PASS",
    durationMs: 1,
    processesChecked: true,
    workspaceChecked: true,
    sessionsChecked: true,
    workspaceDisposition: "DELETED",
    preservationRef: null,
    residue: ["orphan-process"],
    detail: "false pass",
  });
  ok((await runRuntimeProvider(falseCleanup, valid)).outcome === "FAILED_CLEANUP", "cleanup residue stayed green");

  const preservedSuccess = new FixtureProvider();
  preservedSuccess.cleanup = async () => ({
    state: "PASS",
    durationMs: 1,
    processesChecked: true,
    workspaceChecked: true,
    sessionsChecked: true,
    workspaceDisposition: "PRESERVED_BY_POLICY",
    preservationRef: {
      kind: "workspace-preservation",
      sha256: "f".repeat(64),
      bytes: 10,
      mediaType: "application/x-tar",
    },
    residue: [],
    detail: "incorrectly preserved successful workspace",
  });
  const preserveRequest = { ...valid, cleanup: { ...valid.cleanup, workspaceCleanup: "preserve-on-failure" as const } };
  ok((await runRuntimeProvider(preservedSuccess, preserveRequest)).outcome === "FAILED_CLEANUP", "successful workspace preservation stayed green");

  const orphanPreservation = new FixtureProvider();
  orphanPreservation.cleanup = async () => ({
    state: "PASS",
    durationMs: 1,
    processesChecked: true,
    workspaceChecked: true,
    sessionsChecked: true,
    workspaceDisposition: "PRESERVED_BY_POLICY",
    preservationRef: null,
    residue: [],
    detail: "missing preservation artifact",
  });
  ok((await runRuntimeProvider(orphanPreservation, preserveRequest)).outcome === "FAILED_CLEANUP", "orphan preservation stayed green");

  const preserveFailure = new FixtureProvider();
  preserveFailure.executionState = "FAIL";
  const preserved = await runRuntimeProvider(preserveFailure, preserveRequest);
  ok(
    preserved.taskOutcome === "FAILED_EXECUTION" && preserved.outcome === "FAILED_EXECUTION" &&
    preserved.cleanup.state === "PASS" && preserved.cleanup.workspaceDisposition === "PRESERVED_BY_POLICY" &&
    preserved.cleanup.preservationRef !== null,
    "authorized failure preservation did not pass",
  );
  assertRuntimeReceiptMatchesRequest(preserved, preserveRequest);
}
