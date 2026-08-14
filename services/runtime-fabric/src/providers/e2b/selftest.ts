import { createHash } from "node:crypto";
import {
  validateRuntimeRequest,
  type RuntimeEnvironmentSubject,
  type RuntimeReceipt,
  type RuntimeRequest,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import {
  assertRuntimeReceiptMatchesRequest,
  runRuntimeProvider,
} from "../../spi/index.ts";
import { FakeE2bTransport } from "./fake-transport.ts";
import {
  E2B_CREDENTIAL_NAME,
  E2B_PROVIDER_ID,
  E2B_WORKLOAD_ID,
  E2bRuntimeProvider,
  type E2bProviderConfig,
} from "./provider.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`RT-E2B ${message}`);
}

function red(action: () => unknown, message: string): void {
  let failed = false;
  try { action(); } catch { failed = true; }
  ok(failed, `${message} stayed green`);
}

async function redAsync(action: () => Promise<unknown>, message: string): Promise<void> {
  let failed = false;
  try { await action(); } catch { failed = true; }
  ok(failed, `${message} stayed green`);
}

const ADAPTER_SHA = "1".repeat(64);
const TEMPLATE_SHA = "2".repeat(64);
const SOURCE_SHA = "3".repeat(64);
const ENVIRONMENT: RuntimeEnvironmentSubject = {
  kind: "template",
  id: "e2b-fixture-template",
  version: "1.0.0",
  sha256: TEMPLATE_SHA,
};
const WORKFLOW = {
  id: "fixture.build",
  templateId: ENVIRONMENT.id,
  templateVersion: ENVIRONMENT.version,
  templateSha256: ENVIRONMENT.sha256,
  allowedExitCodes: [0] as const,
  workloadNetwork: "deny-all" as const,
  allowedHosts: [] as const,
  writableRoots: ["workspace/output"] as const,
  artifactKind: "sandbox-artifact",
  artifactMediaTypes: ["application/octet-stream"] as const,
  maxArtifactBytes: 2_048,
};

function config(overrides: Partial<E2bProviderConfig> = {}): E2bProviderConfig {
  return {
    adapterVersion: "1.0.0",
    adapterSha256: ADAPTER_SHA,
    environment: { ...ENVIRONMENT },
    availability: "AVAILABLE",
    workflows: [WORKFLOW],
    ...overrides,
  };
}

function requestValue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "agent-shield/runtime-request/v2",
    requestId: "rt-e2b-fixture",
    providerId: E2B_PROVIDER_ID,
    providerVersion: "1.0.0",
    providerSubject: {
      kind: "source",
      id: E2B_PROVIDER_ID,
      version: "1.0.0",
      sha256: ADAPTER_SHA,
    },
    environmentSubject: { ...ENVIRONMENT },
    scope: "cloud",
    requiredCapabilities: [
      "sandbox.artifact-return",
      "sandbox.cleanup",
      "sandbox.ephemeral",
    ],
    source: {
      kind: "artifact",
      sha256: SOURCE_SHA,
      mediaType: "application/x-tar",
    },
    workload: {
      id: E2B_WORKLOAD_ID,
      version: "1.0.0",
      input: { workflowId: WORKFLOW.id },
    },
    environment: { allowedVariables: [] },
    network: { mode: "deny-all", allowlist: [] },
    secrets: [{
      name: E2B_CREDENTIAL_NAME,
      brokerRef: "runtime-broker:e2b-fixture",
      class: "broker-only",
      delivery: "opaque-handle",
    }],
    limits: {
      timeoutMs: 250,
      cancellationGraceMs: 20,
      maxInputBytes: 2_048,
      maxOutputBytes: 4_096,
      maxArtifactBytes: 4_096,
      maxTouchedPaths: 4,
    },
    mutation: { writableRoots: ["workspace/output"], readOnlyRoots: [] },
    artifacts: [{
      kind: "sandbox-artifact",
      required: true,
      maxBytes: 2_048,
      mediaTypes: ["application/octet-stream"],
    }],
    cleanup: {
      processCleanup: "required",
      workspaceCleanup: "delete",
      sessionCleanup: "required",
      maxDurationMs: 250,
    },
    exclusions: ["credential-value", "live-e2b", "provider-license"],
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}): RuntimeRequest {
  return validateRuntimeRequest(requestValue(overrides));
}

function provider(transport: FakeE2bTransport, overrides: Partial<E2bProviderConfig> = {}): E2bRuntimeProvider {
  return new E2bRuntimeProvider(config(overrides), transport);
}

export async function e2bProviderSelftest(): Promise<void> {
  const positiveTransport = new FakeE2bTransport();
  const positiveProvider = provider(positiveTransport);
  const positiveRequest = request();
  const positive = await runRuntimeProvider(positiveProvider, positiveRequest);
  const expectedArtifactDigest = createHash("sha256").update(positiveTransport.artifactBytes).digest("hex");
  ok(
    positive.state === "PASS" &&
    positive.taskOutcome === "COMPLETED" &&
    positive.taskStage === "collection" &&
    positive.cleanup.state === "PASS" &&
    positive.cleanup.workspaceDisposition === "DELETED" &&
    positive.artifacts.length === 1 &&
    positive.artifacts[0].kind === "sandbox-artifact" &&
    positive.artifacts[0].sha256 === expectedArtifactDigest &&
    positive.touchedPaths.join("\u0000") === "workspace/output/result.bin" &&
    positiveProvider.descriptor.liveEvidence === "NOT_EXERCISED" &&
    positiveTransport.sandboxes.size === 0 &&
    Object.isFrozen(positive),
    "positive E2B lifecycle failed or live evidence was promoted",
  );
  ok(
    positiveTransport.lastCreateSpec?.templateId === ENVIRONMENT.id &&
    positiveTransport.lastCreateSpec?.templateVersion === ENVIRONMENT.version &&
    positiveTransport.lastCreateSpec?.templateSha256 === ENVIRONMENT.sha256 &&
    positiveTransport.lastCreateSpec?.credentialRef === "runtime-broker:e2b-fixture" &&
    positiveTransport.lastCreateSpec?.workloadNetwork === "deny-all" &&
    positiveTransport.lastCreateSpec?.source.kind === "artifact" &&
    positiveTransport.lastArtifactLimit === 2_048,
    "request changed host-owned template, broker ref, network, source, or artifact bound",
  );
  assertRuntimeReceiptMatchesRequest(positive, positiveRequest);

  red(
    () => provider(new FakeE2bTransport(), {
      environment: { ...ENVIRONMENT, kind: "profile" },
    }),
    "non-template E2B environment",
  );
  red(
    () => provider(new FakeE2bTransport(), {
      workflows: [{ ...WORKFLOW, templateSha256: "9".repeat(64) }],
    }),
    "workflow template subject drift",
  );

  const unknownWorkflow = requestValue();
  ((unknownWorkflow.workload as Record<string, unknown>).input as Record<string, unknown>).workflowId = "missing.workflow";
  ok(
    (await runRuntimeProvider(provider(new FakeE2bTransport()), unknownWorkflow)).taskOutcome === "FAILED_ADMISSION",
    "unknown E2B workflow was admitted",
  );

  const extraInput = requestValue();
  ((extraInput.workload as Record<string, unknown>).input as Record<string, unknown>).templateId = "caller-template";
  ok(
    (await runRuntimeProvider(provider(new FakeE2bTransport()), extraInput)).taskOutcome === "FAILED_ADMISSION",
    "caller-controlled E2B template stayed green",
  );

  for (const key of ["command", "cmd", "shell", "cwd", "workingDirectory", "env", "args"]) {
    const generic = requestValue();
    ((generic.workload as Record<string, unknown>).input as Record<string, unknown>)[key] = "caller-control";
    red(() => validateRuntimeRequest(generic), `caller-controlled ${key}`);
  }

  const missingCredential = requestValue();
  missingCredential.secrets = [];
  ok(
    (await runRuntimeProvider(provider(new FakeE2bTransport()), missingCredential)).taskOutcome === "FAILED_ADMISSION",
    "missing E2B broker reference stayed green",
  );

  const wrongCredentialClass = requestValue();
  wrongCredentialClass.secrets = [{
    name: E2B_CREDENTIAL_NAME,
    brokerRef: "runtime-broker:e2b-fixture",
    class: "host-only",
    delivery: "opaque-handle",
  }];
  await redAsync(
    () => runRuntimeProvider(provider(new FakeE2bTransport()), wrongCredentialClass),
    "host-only credential reached broker-only provider",
  );

  const environmentDelivery = requestValue();
  environmentDelivery.environment = { allowedVariables: [E2B_CREDENTIAL_NAME] };
  environmentDelivery.secrets = [{
    name: E2B_CREDENTIAL_NAME,
    brokerRef: "runtime-broker:e2b-fixture",
    class: "broker-only",
    delivery: "environment",
  }];
  ok(
    (await runRuntimeProvider(provider(new FakeE2bTransport()), environmentDelivery)).taskOutcome === "FAILED_ADMISSION",
    "environment-delivered E2B credential stayed green",
  );

  const extraCredential = requestValue();
  extraCredential.secrets = [
    ...(extraCredential.secrets as unknown[]),
    {
      name: "EXTRA_CREDENTIAL_REF",
      brokerRef: "runtime-broker:extra",
      class: "broker-only",
      delivery: "opaque-handle",
    },
  ];
  ok(
    (await runRuntimeProvider(provider(new FakeE2bTransport()), extraCredential)).taskOutcome === "FAILED_ADMISSION",
    "extra E2B credential stayed green",
  );

  const wrongNetwork = requestValue();
  wrongNetwork.network = { mode: "allowlist", allowlist: ["example.com:443"] };
  ok(
    (await runRuntimeProvider(provider(new FakeE2bTransport()), wrongNetwork)).outcome === "REFUSED_POLICY",
    "E2B workload network drift stayed green",
  );

  const wrongMutation = requestValue();
  wrongMutation.mutation = { writableRoots: ["workspace/other"], readOnlyRoots: [] };
  ok(
    (await runRuntimeProvider(provider(new FakeE2bTransport()), wrongMutation)).outcome === "REFUSED_POLICY",
    "E2B writable-root drift stayed green",
  );

  const pathEscapeTransport = new FakeE2bTransport();
  pathEscapeTransport.artifactTouchedPaths = ["workspace/private/escape.bin"];
  const pathEscape = await runRuntimeProvider(provider(pathEscapeTransport), request());
  ok(
    pathEscape.taskOutcome === "FAILED_ARTIFACT" && pathEscape.cleanup.state === "PASS",
    "E2B touched-path escape stayed green",
  );

  const wrongVersionTransport = new FakeE2bTransport();
  wrongVersionTransport.adapterVersion = "0.9.0";
  ok(
    (await runRuntimeProvider(provider(wrongVersionTransport), request())).outcome === "REFUSED_POLICY",
    "E2B adapter version drift stayed green",
  );

  const absentTransport = new FakeE2bTransport();
  const absent = await runRuntimeProvider(provider(absentTransport, { availability: "ABSENT" }), request());
  ok(
    absent.outcome === "ABSENT" && absent.state === "ABSENT" && absentTransport.calls.probe === 0,
    "declared absent E2B provider was probed or promoted",
  );

  const subjectDrift = requestValue();
  (subjectDrift.providerSubject as Record<string, unknown>).sha256 = "4".repeat(64);
  await redAsync(
    () => runRuntimeProvider(provider(new FakeE2bTransport()), subjectDrift),
    "E2B adapter subject drift",
  );

  const templateDrift = requestValue();
  (templateDrift.environmentSubject as Record<string, unknown>).sha256 = "5".repeat(64);
  await redAsync(
    () => runRuntimeProvider(provider(new FakeE2bTransport()), templateDrift),
    "E2B template subject drift",
  );

  const deniedExitTransport = new FakeE2bTransport();
  deniedExitTransport.exitCode = 23;
  const deniedExit = await runRuntimeProvider(provider(deniedExitTransport), request());
  ok(
    deniedExit.taskOutcome === "FAILED_EXECUTION" &&
    deniedExit.cleanup.state === "PASS" &&
    deniedExitTransport.sandboxes.size === 0,
    "denied E2B exit was hidden or not cleaned",
  );

  const oversizedTransport = new FakeE2bTransport();
  oversizedTransport.artifactBytes = new Uint8Array(2_049);
  const oversized = await runRuntimeProvider(provider(oversizedTransport), request());
  ok(
    oversized.taskOutcome === "FAILED_ARTIFACT" &&
    oversized.taskStage === "collection" &&
    oversized.cleanup.state === "PASS",
    "oversized E2B artifact stayed green",
  );

  const residueTransport = new FakeE2bTransport();
  residueTransport.killMode = "leave-sandbox";
  const residue = await runRuntimeProvider(provider(residueTransport), request());
  ok(
    residue.taskOutcome === "COMPLETED" &&
    residue.outcome === "FAILED_CLEANUP" &&
    residue.cleanup.residue.includes("e2b-sandbox-residue") &&
    residueTransport.sandboxes.size === 1,
    "E2B sandbox residue was hidden",
  );

  const recoveryTransport = new FakeE2bTransport();
  recoveryTransport.createMode = "throw-after-create";
  const recovery = await runRuntimeProvider(provider(recoveryTransport), request());
  ok(
    recovery.taskOutcome === "FAILED_MATERIALIZATION" &&
    recovery.taskStage === "materialization" &&
    recovery.cleanup.state === "PASS" &&
    recoveryTransport.calls.killByName === 1 &&
    recoveryTransport.sandboxes.size === 0,
    "partial E2B sandbox recovery cleanup failed",
  );

  const recoveryFailureTransport = new FakeE2bTransport();
  recoveryFailureTransport.createMode = "throw-after-create";
  recoveryFailureTransport.killMode = "leave-sandbox";
  const recoveryFailure = await runRuntimeProvider(provider(recoveryFailureTransport), request());
  ok(
    recoveryFailure.taskOutcome === "FAILED_MATERIALIZATION" &&
    recoveryFailure.outcome === "FAILED_CLEANUP" &&
    recoveryFailureTransport.sandboxes.size === 1,
    "partial E2B sandbox residue stayed green",
  );

  const preCancelledTransport = new FakeE2bTransport();
  const controller = new AbortController();
  controller.abort("fixture cancellation");
  const preCancelled = await runRuntimeProvider(
    provider(preCancelledTransport),
    request(),
    { signal: controller.signal },
  );
  ok(
    preCancelled.taskOutcome === "CANCELLED" &&
    preCancelled.taskStage === "admission" &&
    preCancelledTransport.calls.probe === 0 &&
    preCancelledTransport.calls.createSandbox === 0,
    "pre-cancelled E2B request created a provider effect",
  );

  red(
    () => assertRuntimeReceiptMatchesRequest({ ...positive, unexpected: true } as unknown as RuntimeReceipt, positiveRequest),
    "open E2B receipt",
  );
  red(
    () => assertRuntimeReceiptMatchesRequest({
      ...positive,
      provider: { ...positive.provider, subject: { ...positive.provider.subject!, sha256: "0".repeat(64) } },
    }, positiveRequest),
    "tampered E2B adapter subject",
  );

  console.log("SELFTEST GREEN: RT-E2B template, broker, artifact, and cleanup controls");
}

await e2bProviderSelftest();
