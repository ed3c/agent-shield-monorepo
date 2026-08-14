import {
  runtimeProviderCatalogEvidence,
  validateRuntimeRequest,
  validateRuntimeRequestV2,
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

export async function runtimeContractSelftest(valid: RuntimeRequest, provider: FixtureProvider, receipt: RuntimeReceipt): Promise<void> {
  ok(runtimeProviderCatalogEvidence(provider.descriptor) === "NOT_EXERCISED", "pre-run state collapsed");
  ok(Object.isFrozen(receipt) && Object.isFrozen(receipt.provider) && Object.isFrozen(receipt.cleanup), "receipt is mutable");

  const reordered = requestValue();
  reordered.exclusions = [...(reordered.exclusions as string[])].reverse();
  reordered.requiredCapabilities = [...(reordered.requiredCapabilities as string[])].reverse();
  ok(runtimeRequestDigest(valid) === runtimeRequestDigest(validateRuntimeRequest(reordered)), "digest depends on set order");

  const registry = new RuntimeProviderRegistry([provider]);
  red(() => registry.register(new FixtureProvider()), "duplicate registration");
  const missingRequest = { ...valid, providerId: "missing-provider", providerSubject: { ...valid.providerSubject, id: "missing-provider" } };
  const missing = await dispatchRuntimeRequest(registry, missingRequest);
  ok(missing.outcome === "ABSENT" && missing.state === "ABSENT" && missing.taskStage === null, "unknown provider state collapsed");
  assertRuntimeReceiptMatchesRequest(missing, missingRequest);

  red(() => assertRuntimeTransition("UNRESOLVED", "RUNNING"), "initial transition skip");
  red(() => assertRuntimeTransition("RUNNING", "COMPLETED"), "collection and cleanup skip");

  const legacy = structuredClone(requestValue());
  legacy.schema = "agent-shield/runtime-request/v1";
  delete legacy.providerVersion;
  delete legacy.providerSubject;
  delete legacy.environmentSubject;
  red(() => validateRuntimeRequestV2(legacy), "legacy v1 provider execution request");
  ok(validateRuntimeRequest(legacy).providerVersion === "legacy-v1-unbound", "legacy envelope was not explicitly unbound");

  const missingLimit = structuredClone(requestValue());
  delete (missingLimit.limits as Record<string, unknown>).timeoutMs;
  red(() => validateRuntimeRequest(missingLimit), "missing limit");

  const genericControl = structuredClone(requestValue());
  ((genericControl.workload as Record<string, unknown>).input as Record<string, unknown>).nested = { command: "arbitrary" };
  red(() => validateRuntimeRequest(genericControl), "nested generic control");

  const genericAlias = structuredClone(requestValue());
  ((genericAlias.workload as Record<string, unknown>).input as Record<string, unknown>).nested = { private_flags: ["unsafe"] };
  red(() => validateRuntimeRequest(genericAlias), "generic control alias");

  const inheritedInput = Object.create({ cmd: "arbitrary" }) as Record<string, unknown>;
  inheritedInput.value = "hello";
  const inheritedControl = requestValue();
  (inheritedControl.workload as Record<string, unknown>).input = inheritedInput;
  red(() => validateRuntimeRequest(inheritedControl), "inherited generic control");

  const pollutedRequest = Object.create({ unexpected: true });
  Object.assign(pollutedRequest, requestValue());
  red(() => validateRuntimeRequest(pollutedRequest), "inherited request keys");

  const pathBrokerRef = structuredClone(requestValue());
  pathBrokerRef.secrets = [{ name: "TOKEN", brokerRef: "file:/tmp/token", class: "host-only", delivery: "opaque-handle" }];
  red(() => validateRuntimeRequest(pathBrokerRef), "path-like broker reference");

  const windowsRoot = structuredClone(requestValue());
  (windowsRoot.mutation as Record<string, unknown>).writableRoots = ["C:/workspace/output"];
  red(() => validateRuntimeRequest(windowsRoot), "Windows host mutation root");

  const wrongVersion = new FixtureProvider({ version: "1.0.1", subject: { ...valid.providerSubject, version: "1.0.1" } });
  await redAsync(() => runRuntimeProvider(wrongVersion, valid), "provider version drift");
  const wrongSubject = new FixtureProvider({ subject: { ...valid.providerSubject, sha256: "9".repeat(64) } });
  await redAsync(() => runRuntimeProvider(wrongSubject, valid), "provider subject drift");
  const wrongEnvironment = new FixtureProvider({ environment: { ...valid.environmentSubject, sha256: "8".repeat(64) } });
  await redAsync(() => runRuntimeProvider(wrongEnvironment, valid), "environment subject drift");
  await redAsync(() => runRuntimeProvider(new FixtureProvider({ capabilities: ["other"] }), valid), "missing capability");

  red(() => assertRuntimeReceiptMatchesRequest({ ...receipt, requestDigest: "e".repeat(64) }, valid), "stale receipt");
  red(() => assertRuntimeReceiptMatchesRequest({ ...receipt, exclusions: ["different-exclusion"] }, valid), "tampered exclusions");
  red(() => assertRuntimeReceiptMatchesRequest({ ...receipt, unexpected: true } as RuntimeReceipt, valid), "open receipt schema");
}
