import type { RuntimeRequest } from "../../../../packages/contracts/src/runtime/index.ts";
import { runRuntimeProvider } from "../spi/index.ts";
import { FixtureProvider } from "./provider-fixture.ts";
import { ok } from "./test-support.ts";

export async function runtimeAvailabilitySelftest(valid: RuntimeRequest): Promise<void> {
  const notImplemented = await runRuntimeProvider(new FixtureProvider({ implementation: "NOT_IMPLEMENTED" }), valid);
  ok(
    notImplemented.state === "NOT_IMPLEMENTED" &&
    notImplemented.admission.state === "NOT_EXERCISED" &&
    notImplemented.cleanup.state === "NOT_EXERCISED",
    "NOT_IMPLEMENTED collapsed",
  );
  const absent = await runRuntimeProvider(new FixtureProvider({ availability: "ABSENT" }), valid);
  ok(absent.state === "ABSENT" && absent.outcome === "ABSENT", "ABSENT collapsed");
  const refused = await runRuntimeProvider(new FixtureProvider({ availability: "REFUSED_POLICY" }), valid);
  ok(refused.outcome === "REFUSED_POLICY" && refused.state === "FAIL", "policy refusal collapsed");

  const admissionFailure = new FixtureProvider();
  admissionFailure.admit = async () => ({ state: "FAIL", detail: "fixture admission denied" });
  const denied = await runRuntimeProvider(admissionFailure, valid);
  ok(denied.outcome === "FAILED_ADMISSION" && denied.cleanup.state === "NOT_EXERCISED", "admission failure collapsed");

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
    materialization.outcome === "FAILED_MATERIALIZATION" && materialization.workspaceIdentity === null,
    "non-portable workspace escaped",
  );
}
