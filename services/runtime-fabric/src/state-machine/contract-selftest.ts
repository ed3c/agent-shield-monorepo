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

function noProviderCalls(provider: FixtureProvider): boolean {
  return (
    provider.admitCalled === 0 &&
    provider.materializeCalled === 0 &&
    provider.recoveryCleanupCalled === 0 &&
    provider.executeCalled === 0 &&
    provider.collectCalled === 0 &&
    provider.cleanupCalled === 0
  );
}

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
  const normalizedLegacy = validateRuntimeRequest(legacy);
  ok(
    normalizedLegacy.providerVersion === "legacy-v1-unbound" &&
    normalizedLegacy.exclusions.includes("legacy-runtime-v1-unbound"),
    "legacy envelope was not explicitly unbound",
  );

  const legacyProvider = new FixtureProvider({
    id: normalizedLegacy.providerId,
    version: normalizedLegacy.providerVersion,
    subject: { ...normalizedLegacy.providerSubject },
    environment: { ...normalizedLegacy.environmentSubject },
    scope: normalizedLegacy.scope,
    capabilities: [...normalizedLegacy.requiredCapabilities],
  });
  await redAsync(
    () => dispatchRuntimeRequest(new RuntimeProviderRegistry([legacyProvider]), normalizedLegacy),
    "normalized legacy envelope provider execution",
  );
  ok(noProviderCalls(legacyProvider), "normalized legacy envelope reached provider code");

  const legacyVersionValue = requestValue();
  legacyVersionValue.providerVersion = "legacy-v1-unbound";
  legacyVersionValue.providerSubject = {
    ...(legacyVersionValue.providerSubject as Record<string, unknown>),
    version: "legacy-v1-unbound",
    sha256: "7".repeat(64),
  };
  const legacyVersionRequest = validateRuntimeRequestV2(legacyVersionValue);
  const legacyVersionProvider = new FixtureProvider({
    version: legacyVersionRequest.providerVersion,
    subject: { ...legacyVersionRequest.providerSubject },
  });
  await redAsync(
    () => runRuntimeProvider(legacyVersionProvider, legacyVersionRequest),
    "legacy provider version execution marker",
  );
  ok(noProviderCalls(legacyVersionProvider), "legacy provider version reached provider code");

  const legacyExclusionValue = requestValue();
  legacyExclusionValue.exclusions = [
    ...(legacyExclusionValue.exclusions as string[]),
    "legacy-runtime-v1-unbound",
  ];
  const legacyExclusionRequest = validateRuntimeRequestV2(legacyExclusionValue);
  const legacyExclusionProvider = new FixtureProvider();
  await redAsync(
    () => runRuntimeProvider(legacyExclusionProvider, legacyExclusionRequest),
    "legacy exclusion execution marker",
  );
  ok(noProviderCalls(legacyExclusionProvider), "legacy exclusion reached provider code");

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

  const policyProvider = new FixtureProvider({ availability: "REFUSED_POLICY" });
  const policyReceipt = await runRuntimeProvider(policyProvider, valid);
  ok(policyReceipt.taskStage === null && policyReceipt.outcome === "REFUSED_POLICY", "policy resolution fixture failed");
  const admissionInResolutionTrace = [...policyReceipt.lifecycle];
  admissionInResolutionTrace.splice(admissionInResolutionTrace.length - 1, 0, "ADMISSION_CHECKED");
  red(
    () => assertRuntimeReceiptMatchesRequest({ ...policyReceipt, lifecycle: admissionInResolutionTrace }, valid),
    "resolution receipt with admission trace",
  );

  const materializationProvider = new FixtureProvider();
  materializationProvider.materializationMode = "THROW";
  const materializationReceipt = await runRuntimeProvider(materializationProvider, valid);
  ok(
    materializationReceipt.taskStage === "materialization" &&
    materializationReceipt.taskOutcome === "FAILED_MATERIALIZATION",
    "materialization failure fixture failed",
  );
  const executionInMaterializationTrace = [...materializationReceipt.lifecycle];
  const materializationCleaningIndex = executionInMaterializationTrace.indexOf("CLEANING");
  ok(materializationCleaningIndex > 0, "materialization trace lacks cleanup");
  executionInMaterializationTrace.splice(materializationCleaningIndex, 0, "READY", "RUNNING");
  red(
    () => assertRuntimeReceiptMatchesRequest(
      { ...materializationReceipt, lifecycle: executionInMaterializationTrace },
      valid,
    ),
    "materialization receipt with execution trace",
  );

  const executionProvider = new FixtureProvider();
  executionProvider.executionState = "FAIL";
  const executionReceipt = await runRuntimeProvider(executionProvider, valid);
  ok(
    executionReceipt.taskStage === "execution" &&
    executionReceipt.taskOutcome === "FAILED_EXECUTION",
    "execution failure fixture failed",
  );
  const collectionInExecutionTrace = [...executionReceipt.lifecycle];
  const executionCleaningIndex = collectionInExecutionTrace.indexOf("CLEANING");
  ok(executionCleaningIndex > 0, "execution trace lacks cleanup");
  collectionInExecutionTrace.splice(executionCleaningIndex, 0, "COLLECTING");
  red(
    () => assertRuntimeReceiptMatchesRequest(
      { ...executionReceipt, lifecycle: collectionInExecutionTrace },
      valid,
    ),
    "execution receipt with collection trace",
  );

  const collectionPhaseRemoved = receipt.lifecycle.filter((state) => state !== "COLLECTING");
  red(
    () => assertRuntimeReceiptMatchesRequest({ ...receipt, lifecycle: collectionPhaseRemoved }, valid),
    "collection receipt without collection trace",
  );

  red(() => assertRuntimeReceiptMatchesRequest({ ...receipt, requestDigest: "e".repeat(64) }, valid), "stale receipt");
  red(() => assertRuntimeReceiptMatchesRequest({ ...receipt, exclusions: ["different-exclusion"] }, valid), "tampered exclusions");
  red(() => assertRuntimeReceiptMatchesRequest({ ...receipt, unexpected: true } as RuntimeReceipt, valid), "open receipt schema");
}
