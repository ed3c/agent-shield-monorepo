import type {
  RuntimeRequest,
} from "../../../../packages/contracts/src/runtime/index.ts";
import { runRuntimeProvider } from "../spi/index.ts";
import { FixtureProvider } from "./provider-fixture.ts";
import { ok } from "./test-support.ts";

export async function runtimeExecutionSelftest(
  valid: RuntimeRequest,
): Promise<void> {
  const executionFailure = new FixtureProvider();
  executionFailure.executionState = "FAIL";
  const execution = await runRuntimeProvider(executionFailure, valid);
  ok(
    executionFailure.cleanupCalled &&
      execution.taskOutcome === "FAILED_EXECUTION" &&
      execution.taskStage === "execution" &&
      execution.outcome === "FAILED_EXECUTION" &&
      execution.cleanup.state === "PASS",
    "execution and cleanup lanes collapsed",
  );

  const escapedWrite = new FixtureProvider();
  escapedWrite.collect = async () => ({
    state: "PASS",
    artifacts: [
      {
        kind: "log",
        sha256: "d".repeat(64),
        bytes: 5,
        mediaType: "text/plain",
      },
    ],
    touchedPaths: ["workspace/input/forbidden.txt"],
    detail: "escaped write",
  });
  const escaped = await runRuntimeProvider(escapedWrite, valid);
  ok(
    escaped.taskOutcome === "FAILED_ARTIFACT" &&
      escaped.taskStage === "collection" &&
      escaped.cleanup.state === "PASS",
    "mutation scope escaped",
  );

  const missingArtifact = new FixtureProvider();
  missingArtifact.collect = async () => ({
    state: "PASS",
    artifacts: [],
    touchedPaths: [],
    detail: "missing",
  });
  ok(
    (await runRuntimeProvider(missingArtifact, valid)).taskOutcome ===
      "FAILED_ARTIFACT",
    "required artifact missing",
  );

  const oversized = new FixtureProvider();
  oversized.execute = async () => ({
    state: "PASS",
    exit: {
      code: 0,
      signal: null,
      timedOut: false,
      cancelled: false,
    },
    stdoutBytes: valid.limits.maxOutputBytes + 1,
    stderrBytes: 0,
    detail: "oversized",
  });
  const oversizedReceipt = await runRuntimeProvider(oversized, valid);
  ok(
    oversizedReceipt.taskOutcome === "FAILED_EXECUTION" &&
      oversizedReceipt.cleanup.state === "PASS",
    "output limit failed",
  );

  const invalidTimeout = new FixtureProvider();
  invalidTimeout.execute = async () => ({
    state: "TIMED_OUT",
    exit: {
      code: null,
      signal: null,
      timedOut: false,
      cancelled: false,
    },
    stdoutBytes: 0,
    stderrBytes: 0,
    detail: "invalid timeout",
  });
  ok(
    (await runRuntimeProvider(invalidTimeout, valid)).taskOutcome ===
      "FAILED_EXECUTION",
    "timeout evidence mismatch passed",
  );
}
