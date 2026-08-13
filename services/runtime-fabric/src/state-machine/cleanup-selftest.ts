import {
  assertRuntimeReceiptMatchesRequest,
  runRuntimeProvider,
} from "../spi/index.ts";
import {
  validateRuntimeRequest,
  type RuntimeRequest,
} from "../../../../packages/contracts/src/runtime/index.ts";
import { FixtureProvider } from "./provider-fixture.ts";
import { requestValue } from "./request-fixture.ts";
import { ok, red } from "./test-support.ts";

export async function runtimeCleanupSelftest(
  valid: RuntimeRequest,
): Promise<void> {
  const cleanupFailure = new FixtureProvider();
  cleanupFailure.cleanupState = "FAIL";
  const cleanup = await runRuntimeProvider(cleanupFailure, valid);
  ok(
    cleanup.taskOutcome === "COMPLETED" &&
      cleanup.taskStage === null &&
      cleanup.outcome === "FAILED_CLEANUP" &&
      cleanup.terminalStage === "cleanup" &&
      cleanup.state === "FAIL",
    "cleanup failure hidden",
  );

  const dualFailure = new FixtureProvider();
  dualFailure.executionState = "FAIL";
  dualFailure.cleanupState = "FAIL";
  const dual = await runRuntimeProvider(dualFailure, valid);
  ok(
    dual.taskOutcome === "FAILED_EXECUTION" &&
      dual.taskStage === "execution" &&
      dual.outcome === "FAILED_CLEANUP",
    "pre-cleanup failure lost",
  );

  const falseCleanup = new FixtureProvider();
  falseCleanup.cleanup = async () => ({
    state: "PASS",
    durationMs: 1,
    timedOut: false,
    cancelled: false,
    processesChecked: true,
    workspaceChecked: true,
    sessionsChecked: true,
    workspaceDisposition: "DELETED",
    preservationRef: null,
    residue: ["orphan-process"],
    detail: "false pass",
  });
  ok(
    (await runRuntimeProvider(falseCleanup, valid)).outcome ===
      "FAILED_CLEANUP",
    "cleanup residue stayed green",
  );

  const preserveValue = requestValue();
  (preserveValue.cleanup as Record<string, unknown>).workspaceCleanup =
    "preserve-on-failure";
  const preserveRequest = validateRuntimeRequest(preserveValue);
  const preservedProvider = new FixtureProvider();
  preservedProvider.executionState = "FAIL";
  preservedProvider.preserveWorkspace = true;
  const preserved = await runRuntimeProvider(
    preservedProvider,
    preserveRequest,
  );
  ok(
    preserved.taskOutcome === "FAILED_EXECUTION" &&
      preserved.outcome === "FAILED_EXECUTION" &&
      preserved.cleanup.state === "PASS" &&
      preserved.cleanup.workspaceDisposition === "PRESERVED_BY_POLICY" &&
      preserved.cleanup.preservationRef !== null,
    "authorized failure preservation was lost",
  );
  assertRuntimeReceiptMatchesRequest(preserved, preserveRequest);

  red(
    () =>
      assertRuntimeReceiptMatchesRequest(
        {
          ...preserved,
          cleanup: {
            ...preserved.cleanup,
            workspaceDisposition: "DELETED",
          },
        },
        preserveRequest,
      ),
    "orphan preservation reference",
  );
}
