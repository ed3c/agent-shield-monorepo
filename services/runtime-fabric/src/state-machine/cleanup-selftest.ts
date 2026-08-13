import type { RuntimeRequest } from "../../../../packages/contracts/src/runtime/index.ts";
import { runRuntimeProvider } from "../spi/index.ts";
import { FixtureProvider } from "./provider-fixture.ts";
import { ok } from "./test-support.ts";

export async function runtimeCleanupSelftest(valid: RuntimeRequest): Promise<void> {
  const cleanupFailure = new FixtureProvider();
  cleanupFailure.cleanupState = "FAIL";
  const cleanup = await runRuntimeProvider(cleanupFailure, valid);
  ok(
    cleanup.taskOutcome === "COMPLETED" && cleanup.outcome === "FAILED_CLEANUP" && cleanup.state === "FAIL",
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
    residue: ["orphan-process"],
    detail: "false pass",
  });
  ok((await runRuntimeProvider(falseCleanup, valid)).outcome === "FAILED_CLEANUP", "cleanup residue stayed green");
}
