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
import { FakeTmuxTransport } from "./fake-transport.ts";
import {
  TMUX_PROVIDER_ID,
  TMUX_WORKLOAD_ID,
  TmuxRuntimeProvider,
  type TmuxProviderConfig,
} from "./provider.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`RT-TMUX ${message}`);
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

const BINARY_SHA = "a".repeat(64);
const ENVIRONMENT: RuntimeEnvironmentSubject = {
  kind: "profile",
  id: "tmux-fixture-environment",
  version: "1.0.0",
  sha256: "b".repeat(64),
};
const WORKFLOW = {
  id: "fixture.echo",
  argv: ["bun", "fixture-workflow.ts", "--mode", "safe"] as const,
  allowedExitCodes: [0] as const,
  maxCaptureLines: 200,
};

function config(overrides: Partial<TmuxProviderConfig> = {}): TmuxProviderConfig {
  return {
    tmuxVersion: "3.5a",
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
    requestId: "rt-tmux-fixture",
    providerId: TMUX_PROVIDER_ID,
    providerVersion: "3.5a",
    providerSubject: {
      kind: "binary",
      id: TMUX_PROVIDER_ID,
      version: "3.5a",
      sha256: BINARY_SHA,
    },
    environmentSubject: { ...ENVIRONMENT },
    scope: "local",
    requiredCapabilities: [
      "terminal.fixed-workflow",
      "terminal.session-cleanup",
      "terminal.transcript",
    ],
    source: {
      kind: "git",
      repository: "https://github.com/ed3c/agent-shield-monorepo",
      commit: "c".repeat(40),
      tree: "d".repeat(40),
    },
    workload: {
      id: TMUX_WORKLOAD_ID,
      version: "1.0.0",
      input: { workflowId: WORKFLOW.id, captureLines: 32 },
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
      kind: "terminal-transcript",
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
    exclusions: ["arbitrary-command", "live-tmux", "provider-license"],
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}): RuntimeRequest {
  return validateRuntimeRequest(requestValue(overrides));
}

function provider(transport: FakeTmuxTransport, overrides: Partial<TmuxProviderConfig> = {}): TmuxRuntimeProvider {
  return new TmuxRuntimeProvider(config(overrides), transport);
}

export async function tmuxProviderSelftest(): Promise<void> {
  const positiveTransport = new FakeTmuxTransport();
  const positiveProvider = provider(positiveTransport);
  const positiveRequest = request();
  const positive = await runRuntimeProvider(positiveProvider, positiveRequest);
  const expectedTranscriptDigest = createHash("sha256")
    .update(new TextEncoder().encode(positiveTransport.transcript))
    .digest("hex");
  ok(
    positive.state === "PASS" &&
    positive.taskOutcome === "COMPLETED" &&
    positive.taskStage === "collection" &&
    positive.cleanup.state === "PASS" &&
    positive.cleanup.workspaceDisposition === "DELETED" &&
    positive.artifacts.length === 1 &&
    positive.artifacts[0].kind === "terminal-transcript" &&
    positive.artifacts[0].sha256 === expectedTranscriptDigest &&
    positive.touchedPaths.length === 0 &&
    positiveProvider.descriptor.liveEvidence === "NOT_EXERCISED" &&
    positiveTransport.sessions.size === 0 &&
    Object.isFrozen(positive),
    "positive fixed-workflow lifecycle failed or live evidence was promoted",
  );
  ok(
    positiveTransport.lastWorkflow?.argv.join("\u0000") === WORKFLOW.argv.join("\u0000") &&
    positiveTransport.lastCaptureLines === 32,
    "request changed the host-owned workflow or capture bound",
  );
  assertRuntimeReceiptMatchesRequest(positive, positiveRequest);

  const unknownWorkflow = requestValue();
  ((unknownWorkflow.workload as Record<string, unknown>).input as Record<string, unknown>).workflowId = "missing.workflow";
  const unknown = await runRuntimeProvider(provider(new FakeTmuxTransport()), unknownWorkflow);
  ok(
    unknown.taskOutcome === "FAILED_ADMISSION" && unknown.taskStage === "admission",
    "unknown workflow was not refused at admission",
  );

  const extraInput = requestValue();
  ((extraInput.workload as Record<string, unknown>).input as Record<string, unknown>).extra = "not-admitted";
  ok(
    (await runRuntimeProvider(provider(new FakeTmuxTransport()), extraInput)).taskOutcome === "FAILED_ADMISSION",
    "extra workload input stayed green",
  );

  for (const key of ["command", "cmd", "shell", "cwd", "workingDirectory", "env", "args"]) {
    const generic = requestValue();
    ((generic.workload as Record<string, unknown>).input as Record<string, unknown>)[key] = "caller-control";
    red(() => validateRuntimeRequest(generic), `caller-controlled ${key}`);
  }

  const networked = requestValue();
  networked.network = { mode: "allowlist", allowlist: ["example.com:443"] };
  const networkReceipt = await runRuntimeProvider(provider(new FakeTmuxTransport()), networked);
  ok(networkReceipt.outcome === "REFUSED_POLICY", "networked tmux request stayed green");

  const writable = requestValue();
  writable.mutation = { writableRoots: ["workspace/output"], readOnlyRoots: [] };
  const writableReceipt = await runRuntimeProvider(provider(new FakeTmuxTransport()), writable);
  ok(writableReceipt.outcome === "REFUSED_POLICY", "writable tmux request stayed green");

  const secret = requestValue();
  secret.environment = { allowedVariables: ["TOKEN_REF"] };
  secret.secrets = [{
    name: "TOKEN_REF",
    brokerRef: "openbao:tmux-fixture",
    class: "host-only",
    delivery: "environment",
  }];
  await redAsync(
    () => runRuntimeProvider(provider(new FakeTmuxTransport()), secret),
    "secret reference reached credential-free provider",
  );

  const wrongVersionTransport = new FakeTmuxTransport();
  wrongVersionTransport.version = "3.4";
  const wrongVersion = await runRuntimeProvider(provider(wrongVersionTransport), request());
  ok(wrongVersion.outcome === "REFUSED_POLICY", "tmux executable version drift stayed green");

  const absentTransport = new FakeTmuxTransport();
  const absentProvider = provider(absentTransport, { availability: "ABSENT" });
  const absent = await runRuntimeProvider(absentProvider, request());
  ok(
    absent.outcome === "ABSENT" && absent.state === "ABSENT" && absentTransport.calls.probe === 0,
    "declared absent provider was probed or promoted",
  );

  const subjectDrift = requestValue();
  (subjectDrift.providerSubject as Record<string, unknown>).sha256 = "e".repeat(64);
  await redAsync(
    () => runRuntimeProvider(provider(new FakeTmuxTransport()), subjectDrift),
    "binary subject drift",
  );

  const environmentDrift = requestValue();
  (environmentDrift.environmentSubject as Record<string, unknown>).sha256 = "f".repeat(64);
  await redAsync(
    () => runRuntimeProvider(provider(new FakeTmuxTransport()), environmentDrift),
    "environment subject drift",
  );

  const deniedExitTransport = new FakeTmuxTransport();
  deniedExitTransport.exitCode = 7;
  const deniedExit = await runRuntimeProvider(provider(deniedExitTransport), request());
  ok(
    deniedExit.taskOutcome === "FAILED_EXECUTION" &&
    deniedExit.taskStage === "execution" &&
    deniedExit.cleanup.state === "PASS" &&
    deniedExitTransport.sessions.size === 0,
    "denied workflow exit was hidden or not cleaned",
  );

  const oversizedTransport = new FakeTmuxTransport();
  oversizedTransport.transcript = "x".repeat(2_049);
  const oversized = await runRuntimeProvider(provider(oversizedTransport), request());
  ok(
    oversized.taskOutcome === "FAILED_ARTIFACT" &&
    oversized.taskStage === "collection" &&
    oversized.cleanup.state === "PASS",
    "oversized transcript stayed green",
  );

  const residueTransport = new FakeTmuxTransport();
  residueTransport.killMode = "leave-session";
  const residue = await runRuntimeProvider(provider(residueTransport), request());
  ok(
    residue.taskOutcome === "COMPLETED" &&
    residue.outcome === "FAILED_CLEANUP" &&
    residue.terminalStage === "cleanup" &&
    residue.cleanup.residue.includes("tmux-session-residue") &&
    residueTransport.sessions.size === 1,
    "tmux session residue was hidden",
  );

  const recoveryTransport = new FakeTmuxTransport();
  recoveryTransport.createMode = "throw-after-create";
  const recovery = await runRuntimeProvider(provider(recoveryTransport), request());
  ok(
    recovery.taskOutcome === "FAILED_MATERIALIZATION" &&
    recovery.taskStage === "materialization" &&
    recovery.cleanup.state === "PASS" &&
    recoveryTransport.calls.killSession === 1 &&
    recoveryTransport.sessions.size === 0,
    "partial tmux session recovery cleanup failed",
  );

  const recoveryFailureTransport = new FakeTmuxTransport();
  recoveryFailureTransport.createMode = "throw-after-create";
  recoveryFailureTransport.killMode = "leave-session";
  const recoveryFailure = await runRuntimeProvider(provider(recoveryFailureTransport), request());
  ok(
    recoveryFailure.taskOutcome === "FAILED_MATERIALIZATION" &&
    recoveryFailure.outcome === "FAILED_CLEANUP" &&
    recoveryFailureTransport.sessions.size === 1,
    "partial tmux session residue stayed green",
  );

  const preCancelledTransport = new FakeTmuxTransport();
  const preCancelledController = new AbortController();
  preCancelledController.abort("fixture cancellation");
  const preCancelled = await runRuntimeProvider(
    provider(preCancelledTransport),
    request(),
    { signal: preCancelledController.signal },
  );
  ok(
    preCancelled.taskOutcome === "CANCELLED" &&
    preCancelled.taskStage === "admission" &&
    preCancelledTransport.calls.probe === 0 &&
    preCancelledTransport.calls.createSession === 0,
    "pre-cancelled request created a tmux effect",
  );

  red(
    () => assertRuntimeReceiptMatchesRequest({ ...positive, unexpected: true } as unknown as RuntimeReceipt, positiveRequest),
    "open tmux receipt",
  );
  red(
    () => assertRuntimeReceiptMatchesRequest({
      ...positive,
      provider: { ...positive.provider, subject: { ...positive.provider.subject!, sha256: "0".repeat(64) } },
    }, positiveRequest),
    "tampered tmux binary subject",
  );

  console.log("SELFTEST GREEN: RT-TMUX fixed workflow, transcript, and cleanup controls");
}

await tmuxProviderSelftest();
