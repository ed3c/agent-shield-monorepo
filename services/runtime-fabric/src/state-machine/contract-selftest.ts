import {
  runtimeProviderCatalogEvidence,
  validateRuntimeRequest,
  type RuntimeReceipt,
  type RuntimeRequest,
} from "../../../../packages/contracts/src/runtime/index.ts";
import {
  assertRuntimeReceiptMatchesRequest,
  dispatchRuntimeRequest,
  runRuntimeProvider,
  runtimeRequestDigest,
  RuntimeProviderRegistry,
} from "../spi/index.ts";
import { assertRuntimeTransition } from "./index.ts";
import { FixtureProvider } from "./provider-fixture.ts";
import { requestValue } from "./request-fixture.ts";
import { ok, red, redAsync } from "./test-support.ts";

export async function runtimeContractSelftest(
  valid: RuntimeRequest,
  provider: FixtureProvider,
  receipt: RuntimeReceipt,
): Promise<void> {
  ok(runtimeProviderCatalogEvidence(provider.descriptor) === "NOT_EXERCISED", "pre-run state collapsed");
  const reordered = requestValue();
  reordered.exclusions = [...(reordered.exclusions as string[])].reverse();
  ok(runtimeRequestDigest(valid) === runtimeRequestDigest(validateRuntimeRequest(reordered)), "digest depends on set order");

  const registry = new RuntimeProviderRegistry([provider]);
  red(() => registry.register(new FixtureProvider()), "duplicate registration");
  const missingRequest = { ...valid, providerId: "missing-provider" };
  const missing = await dispatchRuntimeRequest(registry, missingRequest);
  ok(missing.outcome === "ABSENT" && missing.state === "ABSENT", "unknown provider state collapsed");
  assertRuntimeReceiptMatchesRequest(missing, missingRequest);

  red(() => assertRuntimeTransition("UNRESOLVED", "RUNNING"), "initial transition skip");
  red(() => assertRuntimeTransition("RUNNING", "COMPLETED"), "collection and cleanup skip");

  const missingLimit = structuredClone(requestValue());
  delete (missingLimit.limits as Record<string, unknown>).timeoutMs;
  red(() => validateRuntimeRequest(missingLimit), "missing limit");

  const genericControl = structuredClone(requestValue());
  ((genericControl.workload as Record<string, unknown>).input as Record<string, unknown>).nested = { command: "arbitrary" };
  red(() => validateRuntimeRequest(genericControl), "nested generic control");

  const undeclaredBrokerRef = structuredClone(requestValue());
  undeclaredBrokerRef.secrets = [{
    name: "BROKER_SETTING",
    brokerRef: "openbao:agent/item",
    class: "broker-only",
    delivery: "environment",
  }];
  red(() => validateRuntimeRequest(undeclaredBrokerRef), "undeclared broker environment");

  await redAsync(() => runRuntimeProvider(new FixtureProvider({ capabilities: ["other"] }), valid), "missing capability");
  red(() => assertRuntimeReceiptMatchesRequest({ ...receipt, requestDigest: "e".repeat(64) }, valid), "stale receipt");
  red(() => assertRuntimeReceiptMatchesRequest({
    ...receipt,
    output: { ...receipt.output, stdoutBytes: valid.limits.maxOutputBytes + 1 },
  }, valid), "tampered output");
  red(() => assertRuntimeReceiptMatchesRequest({ ...receipt, exclusions: ["different-exclusion"] }, valid), "tampered exclusions");
}
