import { createHash } from "node:crypto";
import {
  validateRuntimeRequest,
  type RuntimeEnvironmentSubject,
  type RuntimeRequest,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import {
  assertRuntimeReceiptMatchesRequest,
  runRuntimeProvider,
} from "../../spi/index.ts";
import { FakeAppleContainerTransport } from "./fake-transport.ts";
import {
  APPLE_CONTAINER_PROVIDER_ID,
  APPLE_CONTAINER_WORKLOAD_ID,
  AppleContainerRuntimeProvider,
  type AppleContainerProviderConfig,
} from "./provider.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`RT-APPLE ${message}`);
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

const BINARY_SHA = "1".repeat(64);
const IMAGE_SHA = "2".repeat(64);
const SOURCE_SHA = "3".repeat(64);
const ENVIRONMENT: RuntimeEnvironmentSubject = {
  kind: "profile",
  id: "apple-container-fixture-environment",
  version: "1.0.0",
  sha256: "4".repeat(64),
};
const WORKFLOW = {
  id: "fixture.echo",
  image: {
    reference: `ghcr.io/example/agent-shield-fixture@sha256:${IMAGE_SHA}`,
    digest: `sha256:${IMAGE_SHA}`,
  },
  argv: ["/bin/echo", "hello-agent-shield"] as const,
  allowedExitCodes: [0] as const,
  maxLogBytes: 2_048,
  network: "deny-all" as const,
};

function config(overrides: Partial<AppleContainerProviderConfig> = {}): AppleContainerProviderConfig {
  return {
    containerVersion: "0.9.0",
    binarySha256: BINARY_SHA,
    environment: { ...ENVIRONMENT },
    availability: "AVAILABLE",
    workflows: [WORKFLOW],
    ...overrides,
  };
}

function requestValue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "agent-shield/runtime-request/v2",
    requestId: "rt-apple-fixture",
    providerId: APPLE_CONTAINER_PROVIDER_ID,
    providerVersion: "0.9.0",
    providerSubject: {
      kind: "binary",
      id: APPLE_CONTAINER_PROVIDER_ID,
      version: "0.9.0",
      sha256: BINARY_SHA,
    },
    environmentSubject: { ...ENVIRONMENT },
    scope: "local",
    requiredCapabilities: [
      "container.cleanup",
      "container.ephemeral",
      "container.log-artifact",
    ],
    source: {
      kind: "artifact",
      sha256: SOURCE_SHA,
      mediaType: "application/x-tar",
    },
    workload: {
      id: APPLE_CONTAINER_WORKLOAD_ID,
      version: "1.0.0",
      input: { workflowId: WORKFLOW.id },
    },
    environment: { allowedVariables: [] },
    network: { mode: "deny-all", allowlist: [] },
    secrets: [],
    limits: {
      timeoutMs: 250,
      cancellationGraceMs: 20,
      maxInputBytes: 2_048,
      maxOutputBytes: 4_096,
      maxArtifactBytes: 4_096,
      maxTouchedPaths: 1,
    },
    mutation: { writableRoots: [], readOnlyRoots: [] },
    artifacts: [{
      kind: "container-log",
      required: true,
      maxBytes: 2_048,
      mediaTypes: ["text/plain"],
    }],
    cleanup: {
      processCleanup: "required",
      workspaceCleanup: "delete",
      sessionCleanup: "required",
      maxDurationMs: 250,
    },
    exclusions: ["host-mount", "live-apple-container", "provider-license"],
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}): RuntimeRequest {
  return validateRuntimeRequest(requestValue(overrides));
}

function provider(
  transport: FakeAppleContainerTransport,
  overrides: Partial<AppleContainerProviderConfig> = {},
): AppleContainerRuntimeProvider {
  return new AppleContainerRuntimeProvider(config(overrides), transport);
}

export async function appleContainerProviderSelftest(): Promise<void> {
  const positiveTransport = new FakeAppleContainerTransport();
  const positiveProvider = provider(positiveTransport);
  const positiveRequest = request();
  const positive = await runRuntimeProvider(positiveProvider, positiveRequest);
  const expectedLogDigest = createHash("sha256").update(positiveTransport.log).digest("hex");
  ok(
    positive.state === "PASS" &&
    positive.taskOutcome === "COMPLETED" &&
    positive.taskStage === "collection" &&
    positive.cleanup.state === "PASS" &&
    positive.cleanup.workspaceDisposition === "DELETED" &&
    positive.artifacts.length === 1 &&
    positive.artifacts[0].kind === "container-log" &&
    positive.artifacts[0].sha256 === expectedLogDigest &&
    positive.touchedPaths.length === 0 &&
    positiveProvider.descriptor.liveEvidence === "NOT_EXERCISED" &&
    positiveTransport.containers.size === 0 &&
    Object.isFrozen(positive),
    "positive Apple Container lifecycle failed or live evidence was promoted",
  );
  ok(
    positiveTransport.lastCreateSpec?.image.reference === WORKFLOW.image.reference &&
    positiveTransport.lastCreateSpec?.argv.join("\u0000") === WORKFLOW.argv.join("\u0000") &&
    positiveTransport.lastCreateSpec?.network === "deny-all" &&
    positiveTransport.lastCreateSpec?.source.kind === "artifact" &&
    positiveTransport.lastLogLimit === 2_048,
    "request changed host-owned image/argv/network/source or artifact bounds",
  );
  assertRuntimeReceiptMatchesRequest(positive, positiveRequest);

  const mutableImage = {
    ...WORKFLOW,
    image: { reference: "ghcr.io/example/agent-shield-fixture:latest", digest: `sha256:${IMAGE_SHA}` },
  };
  red(
    () => provider(new FakeAppleContainerTransport(), { workflows: [mutableImage] }),
    "mutable image reference",
  );

  const unknownWorkflow = requestValue();
  ((unknownWorkflow.workload as Record<string, unknown>).input as Record<string, unknown>).workflowId = "missing.workflow";
  const unknown = await runRuntimeProvider(provider(new FakeAppleContainerTransport()), unknownWorkflow);
  ok(unknown.taskOutcome === "FAILED_ADMISSION", "unknown Apple Container workflow was admitted");

  const callerImage = requestValue();
  ((callerImage.workload as Record<string, unknown>).input as Record<string, unknown>).image = "caller/image:latest";
  ok(
    (await runRuntimeProvider(provider(new FakeAppleContainerTransport()), callerImage)).taskOutcome === "FAILED_ADMISSION",
    "caller-controlled image stayed green",
  );

  for (const key of ["command", "cmd", "shell", "cwd", "workingDirectory", "env", "args"]) {
    const generic = requestValue();
    ((generic.workload as Record<string, unknown>).input as Record<string, unknown>)[key] = "caller-control";
    red(() => validateRuntimeRequest(generic), `caller-controlled ${key}`);
  }

  const networked = requestValue();
  networked.network = { mode: "allowlist", allowlist: ["example.com:443"] };
  ok(
    (await runRuntimeProvider(provider(new FakeAppleContainerTransport()), networked)).outcome === "REFUSED_POLICY",
    "networked Apple Container request stayed green",
  );

  const writable = requestValue();
  writable.mutation = { writableRoots: ["workspace/output"], readOnlyRoots: [] };
  ok(
    (await runRuntimeProvider(provider(new FakeAppleContainerTransport()), writable)).outcome === "REFUSED_POLICY",
    "host-writable Apple Container request stayed green",
  );

  const secret = requestValue();
  secret.environment = { allowedVariables: ["TOKEN_REF"] };
  secret.secrets = [{
    name: "TOKEN_REF",
    brokerRef: "openbao:apple-fixture",
    class: "host-only",
    delivery: "environment",
  }];
  await redAsync(
    () => runRuntimeProvider(provider(new FakeAppleContainerTransport()), secret),
    "secret reference reached credential-free Apple Container provider",
  );

  const wrongVersionTransport = new FakeAppleContainerTransport();
  wrongVersionTransport.version = "0.8.0";
  ok(
    (await runRuntimeProvider(provider(wrongVersionTransport), request())).outcome === "REFUSED_POLICY",
    "Apple Container executable version drift stayed green",
  );

  const absentTransport = new FakeAppleContainerTransport();
  const absent = await runRuntimeProvider(provider(absentTransport, { availability: "ABSENT" }), request());
  ok(
    absent.outcome === "ABSENT" && absent.state === "ABSENT" && absentTransport.calls.probe === 0,
    "declared absent Apple Container provider was probed or promoted",
  );

  const subjectDrift = requestValue();
  (subjectDrift.providerSubject as Record<string, unknown>).sha256 = "5".repeat(64);
  await redAsync(
    () => runRuntimeProvider(provider(new FakeAppleContainerTransport()), subjectDrift),
    "Apple Container binary subject drift",
  );

  const environmentDrift = requestValue();
  (environmentDrift.environmentSubject as Record<string, unknown>).sha256 = "6".repeat(64);
  await redAsync(
    () => runRuntimeProvider(provider(new FakeAppleContainerTransport()), environmentDrift),
    "Apple Container environment subject drift",
  );

  const deniedExitTransport = new FakeAppleContainerTransport();
  deniedExitTransport.exitCode = 9;
  const deniedExit = await runRuntimeProvider(provider(deniedExitTransport), request());
  ok(
    deniedExit.taskOutcome === "FAILED_EXECUTION" &&
    deniedExit.cleanup.state === "PASS" &&
    deniedExitTransport.containers.size === 0,
    "denied Apple Container exit was hidden or not cleaned",
  );

  const oversizedTransport = new FakeAppleContainerTransport();
  oversizedTransport.log = new TextEncoder().encode("x".repeat(2_049));
  const oversized = await runRuntimeProvider(provider(oversizedTransport), request());
  ok(
    oversized.taskOutcome === "FAILED_ARTIFACT" &&
    oversized.taskStage === "collection" &&
    oversized.cleanup.state === "PASS",
    "oversized Apple Container log stayed green",
  );

  const residueTransport = new FakeAppleContainerTransport();
  residueTransport.deleteMode = "leave-container";
  const residue = await runRuntimeProvider(provider(residueTransport), request());
  ok(
    residue.taskOutcome === "COMPLETED" &&
    residue.outcome === "FAILED_CLEANUP" &&
    residue.cleanup.residue.includes("apple-container-residue") &&
    residueTransport.containers.size === 1,
    "Apple Container residue was hidden",
  );

  const recoveryTransport = new FakeAppleContainerTransport();
  recoveryTransport.createMode = "throw-after-create";
  const recovery = await runRuntimeProvider(provider(recoveryTransport), request());
  ok(
    recovery.taskOutcome === "FAILED_MATERIALIZATION" &&
    recovery.taskStage === "materialization" &&
    recovery.cleanup.state === "PASS" &&
    recoveryTransport.calls.removeByName === 1 &&
    recoveryTransport.containers.size === 0,
    "partial Apple Container recovery cleanup failed",
  );

  const recoveryFailureTransport = new FakeAppleContainerTransport();
  recoveryFailureTransport.createMode = "throw-after-create";
  recoveryFailureTransport.deleteMode = "leave-container";
  const recoveryFailure = await runRuntimeProvider(provider(recoveryFailureTransport), request());
  ok(
    recoveryFailure.taskOutcome === "FAILED_MATERIALIZATION" &&
    recoveryFailure.outcome === "FAILED_CLEANUP" &&
    recoveryFailureTransport.containers.size === 1,
    "partial Apple Container residue stayed green",
  );

  const preCancelledTransport = new FakeAppleContainerTransport();
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
    preCancelledTransport.calls.create === 0,
    "pre-cancelled Apple Container request created a provider effect",
  );

  red(
    () => assertRuntimeReceiptMatchesRequest({ ...positive, unexpected: true }, positiveRequest),
    "open Apple Container receipt",
  );
  red(
    () => assertRuntimeReceiptMatchesRequest({
      ...positive,
      provider: { ...positive.provider, subject: { ...positive.provider.subject, sha256: "0".repeat(64) } },
    }, positiveRequest),
    "tampered Apple Container binary subject",
  );

  console.log("SELFTEST GREEN: RT-APPLE immutable image, fixed workflow, log, and cleanup controls");
}

await appleContainerProviderSelftest();
