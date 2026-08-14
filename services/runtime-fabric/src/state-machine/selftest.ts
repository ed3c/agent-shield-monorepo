import { assertRuntimeReceiptMatchesRequest, runRuntimeProvider } from "../spi/index.ts";
import { runtimeAvailabilitySelftest } from "./availability-selftest.ts";
import { runtimeCleanupSelftest } from "./cleanup-selftest.ts";
import { runtimeContractSelftest } from "./contract-selftest.ts";
import { runtimeExecutionSelftest } from "./execution-selftest.ts";
import { runtimeHardeningSelftest } from "./hardening-selftest.ts";
import { FixtureProvider } from "./provider-fixture.ts";
import { request } from "./request-fixture.ts";
import { runtimeStageSelftest } from "./stage-selftest.ts";
import { ok } from "./test-support.ts";

export async function runtimeFoundationSelftest(): Promise<void> {
  const valid = request();
  const provider = new FixtureProvider();
  const receipt = await runRuntimeProvider(provider, valid);
  ok(
    receipt.outcome === "COMPLETED" && receipt.taskOutcome === "COMPLETED" &&
    receipt.taskStage === "collection" && receipt.terminalStage === "collection" &&
    receipt.state === "PASS" && receipt.admission.state === "PASS" &&
    receipt.cleanup.state === "PASS" && receipt.cleanup.workspaceDisposition === "DELETED" &&
    receipt.output.stdoutBytes === 5,
    "positive lifecycle failed",
  );
  assertRuntimeReceiptMatchesRequest(receipt, valid);
  await runtimeContractSelftest(valid, provider, receipt);
  await runtimeAvailabilitySelftest(valid);
  await runtimeExecutionSelftest(valid);
  await runtimeCleanupSelftest(valid);
  await runtimeStageSelftest();
  await runtimeHardeningSelftest(valid, receipt);
}
