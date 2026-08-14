import type { RuntimeRequest } from "../../../../packages/contracts/src/runtime/index.ts";
import { runRuntimeProvider } from "../spi/index.ts";
import { FixtureProvider } from "./provider-fixture.ts";
import { ok } from "./test-support.ts";

export async function runtimeAvailabilitySelftest(valid: RuntimeRequest): Promise<void> {
  const notImplemented = await runRuntimeProvider(new FixtureProvider({ implementation: "NOT_IMPLEMENTED" }), valid);
  ok(
    notImplemented.state === "NOT_IMPLEMENTED" &&
    notImplemented.taskStage === "RESOLUTION" &&
    notImplemented.admission.state === "NOT_EXERCISED" &&
    notImplemented.cleanup.state === "NOT_EXERCISED",
    "NOT_IMPLEMENTED collapsed",
  );
  const absent = await runRuntimeProvider(new FixtureProvider({ availability: "ABSENT" }), valid);
  ok(absent.state === "ABSENT" && absent.outcome === "ABSENT" && absent.taskStage === "RESOLUTION", "ABSENT collapsed");
  const refused = await runRuntimeProvider(new FixtureProvider({ availability: "REFUSED_POLICY" }), valid);
  ok(refused.outcome === "REFUSED_POLICY" && refused.state === "FAIL" && refused.taskStage === "RESOLUTION", "policy refusal collapsed");

  const admissionFailure = new FixtureProvider();
  admissionFailure.admit = async () => ({ state: "FAIL", detail: "fixture admission denied" });
  const denied = await runRuntimeProvider(admissionFailure, valid);
  ok(
    denied.outcome === "FAILED_ADMISSION" && denied.taskStage === "ADMISSION" &&
    denied.cleanup.state === "NOT_EXERCISED" && denied.workspaceIdentity === null,
    "admission failure collapsed",
  );

  const requestMutation = new FixtureProvider();
  requestMutation.admit = async (immutableRequest) => {
    (immutableRequest.workload.input as Record<string, unknown>).value = "mutated";
    return { state: "PASS", detail: "unexpected mutation" };
  };
  ok((await runRuntimeProvider(requestMutation, valid)).outcome === "FAILED_ADMISSION", "request was mutable");

  const badWorkspace = new FixtureProvider();
  badWorkspace.materialize = async () => ({ workspaceIdentity: "/private/workspace", handle: {} });
  const materialization = await runRuntimeProvider(badWorkspace, valid);
  ok(
    materialization.outcome === "FAILED_MATERIALIZATION" &&
    materialization.taskStage === "MATERIALIZATION" &&
    materialization.workspaceIdentity === null &&
    badWorkspace.recoveryCleanupCalled === 1 &&
    materialization.cleanup.state === "PASS" &&
    materialization.cleanup.workspaceDisposition === "ABSENT",
    "non-portable workspace escaped or recovery cleanup skipped",
  );

  const windowsWorkspace = new FixtureProvider();
  windowsWorkspace.materialize = async () => ({ workspaceIdentity: "C:/private/workspace", handle: {} });
  ok((await runRuntimeProvider(windowsWorkspace, valid)).outcome === "FAILED_MATERIALIZATION", "Windows host path escaped");

  const failedRecovery = new FixtureProvider();
  failedRecovery.materialize = async () => { throw new Error("partial materialization"); };
  failedRecovery.recoveryCleanupState = "FAIL";
  const recovery = await runRuntimeProvider(failedRecovery, valid);
  ok(
    recovery.taskOutcome === "FAILED_MATERIALIZATION" && recovery.outcome === "FAILED_CLEANUP" &&
    recovery.terminalStage === "CLEANUP" && recovery.cleanup.state === "FAIL",
    "materialization recovery failure stayed green",
  );
}
