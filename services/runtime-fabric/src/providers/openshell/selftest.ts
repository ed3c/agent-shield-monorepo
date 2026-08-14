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
import { FakeOpenShellTransport } from "./fake-transport.ts";
import {
  OPENSHELL_PROVIDER_ID,
  OPENSHELL_WORKLOAD_ID,
  OpenShellRuntimeProvider,
  type OpenShellProviderConfig,
} from "./provider.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`RT-OS ${message}`);
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
const POLICY_SHA = "2".repeat(64);
const ENVIRONMENT: RuntimeEnvironmentSubject = {
  kind: "profile",
  id: "openshell-fixture-policy",
  version: "1.0.0",
  sha256: POLICY_SHA,
};
const WORKFLOW = {
  id: "fixture.verify",
  executableId: "fixture-verifier",
  argv: ["verify", "--format", "json"] as const,
  policy: {
    id: ENVIRONMENT.id,
    version: ENVIRONMENT.version,
    sha256: ENVIRONMENT.sha256,
  },
  allowedExitCodes: [0] as const,
  network: "deny-all" as const,
  allowedHosts: [] as const,
  writableRoots: ["workspace/output"] as const,
  auditMaxBytes: 2_048,
};

function config(overrides: Partial<OpenShellProviderConfig> = {}): OpenShellProviderConfig {
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
    requestId: "rt-openshell-fixture",
    providerId: OPENSHELL_PROVIDER_ID,
    providerVersion: "1.0.0",
    providerSubject: {
      kind: "source",
      id: OPENSHELL_PROVIDER_ID,
      version: "1.0.0",
      sha256: ADAPTER_SHA,
    },
    environmentSubject: { ...ENVIRONMENT },
    scope: "local",
    requiredCapabilities: [
      "policy-shell.audit",
      "policy-shell.cleanup",
      "policy-shell.fixed-workflow",
    ],
    source: {
      kind: "git",
      repository: "https://github.com/ed3c/agent-shield-monorepo",
      commit: "a".repeat(40),
      tree: "b".repeat(40),
    },
    workload: {
      id: OPENSHELL_WORKLOAD_ID,
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
      maxTouchedPaths: 4,
    },
    mutation: { writableRoots: ["workspace/output"], readOnlyRoots: [] },
    artifacts: [{
      kind: "policy-audit",
      required: true,
      maxBytes: 2_048,
      mediaTypes: ["application/json"],
    }],
    cleanup: {
      processCleanup: "required",
      workspaceCleanup: "delete",
      sessionCleanup: "required",
      maxDurationMs: 250,
    },
    exclusions: ["arbitrary-shell", "live-openshell", "provider-license"],
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}): RuntimeRequest {
  return validateRuntimeRequest(requestValue(overrides));
}

function provider(
  transport: FakeOpenShellTransport,
  overrides: Partial<OpenShellProviderConfig> = {},
): OpenShellRuntimeProvider {
  return new OpenShellRuntimeProvider(config(overrides), transport);
}

export async function openShellProviderSelftest(): Promise<void> {
  const positiveTransport = new FakeOpenShellTransport();
  const positiveProvider = provider(positiveTransport);
  const positiveRequest = request();
  const positive = await runRuntimeProvider(positiveProvider, positiveRequest);
  const expectedAuditDigest = createHash("sha256").update(positiveTransport.auditBytes).digest("hex");
  ok(
    positive.state === "PASS" &&
    positive.taskOutcome === "COMPLETED" &&
    positive.taskStage === "collection" &&
    positive.cleanup.state === "PASS" &&
    positive.cleanup.workspaceDisposition === "DELETED" &&
    positive.artifacts.length === 1 &&
    positive.artifacts[0].kind === "policy-audit" &&
    positive.artifacts[0].sha256 === expectedAuditDigest &&
    positive.touchedPaths.join("\u0000") === "workspace/output/result.json" &&
    positiveProvider.descriptor.liveEvidence === "NOT_EXERCISED" &&
    positiveTransport.sessions.size === 0 &&
    positiveTransport.calls.evaluatePolicy === 2 &&
    Object.isFrozen(positive),
    "positive OpenShell lifecycle failed or live evidence was promoted",
  );
  ok(
    positiveTransport.lastCreateSpec?.executableId === WORKFLOW.executableId &&
    positiveTransport.lastCreateSpec?.argv.join("\u0000") === WORKFLOW.argv.join("\u0000") &&
    positiveTransport.lastCreateSpec?.policy.sha256 === POLICY_SHA &&
    positiveTransport.lastCreateSpec?.network === "deny-all" &&
    positiveTransport.lastAuditLimit === 2_048,
    "request changed host-owned executable, argv, policy, network, or audit bound",
  );
  assertRuntimeReceiptMatchesRequest(positive, positiveRequest);

  red(
    () => provider(new FakeOpenShellTransport(), { environment: { ...ENVIRONMENT, kind: "template" } }),
    "non-profile OpenShell environment",
  );
  red(
    () => provider(new FakeOpenShellTransport(), {
      workflows: [{ ...WORKFLOW, policy: { ...WORKFLOW.policy, sha256: "9".repeat(64) } }],
    }),
    "workflow policy subject drift",
  );

  const unknownWorkflow = requestValue();
  ((unknownWorkflow.workload as Record<string, unknown>).input as Record<string, unknown>).workflowId = "missing.workflow";
  ok(
    (await runRuntimeProvider(provider(new FakeOpenShellTransport()), unknownWorkflow)).taskOutcome === "FAILED_ADMISSION",
    "unknown OpenShell workflow was admitted",
  );

  const callerExecutable = requestValue();
  ((callerExecutable.workload as Record<string, unknown>).input as Record<string, unknown>).executableId = "caller-executable";
  ok(
    (await runRuntimeProvider(provider(new FakeOpenShellTransport()), callerExecutable)).taskOutcome === "FAILED_ADMISSION",
    "caller-controlled OpenShell executable stayed green",
  );

  for (const key of ["command", "cmd", "shell", "cwd", "workingDirectory", "env", "args"]) {
    const generic = requestValue();
    ((generic.workload as Record<string, unknown>).input as Record<string, unknown>)[key] = "caller-control";
    red(() => validateRuntimeRequest(generic), `caller-controlled ${key}`);
  }

  const secret = requestValue();
  secret.environment = { allowedVariables: ["TOKEN_REF"] };
  secret.secrets = [{
    name: "TOKEN_REF",
    brokerRef: "runtime-broker:openshell-fixture",
    class: "host-only",
    delivery: "environment",
  }];
  await redAsync(
    () => runRuntimeProvider(provider(new FakeOpenShellTransport()), secret),
    "secret reference reached credential-free OpenShell provider",
  );

  const wrongNetwork = requestValue();
  wrongNetwork.network = { mode: "allowlist", allowlist: ["example.com:443"] };
  ok(
    (await runRuntimeProvider(provider(new FakeOpenShellTransport()), wrongNetwork)).outcome === "REFUSED_POLICY",
    "OpenShell network drift stayed green",
  );

  const wrongMutation = requestValue();
  wrongMutation.mutation = { writableRoots: ["workspace/other"], readOnlyRoots: [] };
  ok(
    (await runRuntimeProvider(provider(new FakeOpenShellTransport()), wrongMutation)).outcome === "REFUSED_POLICY",
    "OpenShell writable-root drift stayed green",
  );

  const policyDeniedTransport = new FakeOpenShellTransport();
  policyDeniedTransport.decisionState = "DENY";
  const policyDenied = await runRuntimeProvider(provider(policyDeniedTransport), request());
  ok(
    policyDenied.outcome === "REFUSED_POLICY" &&
    policyDenied.taskStage === "admission" &&
    policyDeniedTransport.calls.createSession === 0,
    "OpenShell policy deny created a session",
  );

  const policyDriftTransport = new FakeOpenShellTransport();
  policyDriftTransport.decisionPolicyOverride = { ...WORKFLOW.policy, sha256: "8".repeat(64) };
  ok(
    (await runRuntimeProvider(provider(policyDriftTransport), request())).taskOutcome === "FAILED_ADMISSION",
    "OpenShell policy decision subject drift stayed green",
  );

  const materializationPolicyChange = new FakeOpenShellTransport();
  let decisions = 0;
  materializationPolicyChange.evaluatePolicy = async (workflow) => {
    decisions += 1;
    return decisions === 1
      ? { state: "ALLOW", policy: { ...workflow.policy }, reasonCodes: ["fixed-workflow"], detail: "initial allow" }
      : { state: "DENY", policy: { ...workflow.policy }, reasonCodes: ["policy-changed"], detail: "changed deny" };
  };
  const changedPolicy = await runRuntimeProvider(provider(materializationPolicyChange), request());
  ok(
    changedPolicy.taskOutcome === "FAILED_MATERIALIZATION" &&
    changedPolicy.cleanup.state === "PASS" &&
    materializationPolicyChange.calls.createSession === 0,
    "OpenShell policy TOCTOU change created a session or skipped recovery cleanup",
  );

  const wrongVersionTransport = new FakeOpenShellTransport();
  wrongVersionTransport.adapterVersion = "0.9.0";
  ok(
    (await runRuntimeProvider(provider(wrongVersionTransport), request())).outcome === "REFUSED_POLICY",
    "OpenShell adapter version drift stayed green",
  );

  const absentTransport = new FakeOpenShellTransport();
  const absent = await runRuntimeProvider(provider(absentTransport, { availability: "ABSENT" }), request());
  ok(
    absent.outcome === "ABSENT" && absent.state === "ABSENT" && absentTransport.calls.probe === 0,
    "declared absent OpenShell provider was probed or promoted",
  );

  const subjectDrift = requestValue();
  (subjectDrift.providerSubject as Record<string, unknown>).sha256 = "4".repeat(64);
  await redAsync(
    () => runRuntimeProvider(provider(new FakeOpenShellTransport()), subjectDrift),
    "OpenShell adapter subject drift",
  );

  const policyEnvironmentDrift = requestValue();
  (policyEnvironmentDrift.environmentSubject as Record<string, unknown>).sha256 = "5".repeat(64);
  await redAsync(
    () => runRuntimeProvider(provider(new FakeOpenShellTransport()), policyEnvironmentDrift),
    "OpenShell policy environment drift",
  );

  const deniedExitTransport = new FakeOpenShellTransport();
  deniedExitTransport.exitCode = 17;
  const deniedExit = await runRuntimeProvider(provider(deniedExitTransport), request());
  ok(
    deniedExit.taskOutcome === "FAILED_EXECUTION" &&
    deniedExit.cleanup.state === "PASS" &&
    deniedExitTransport.sessions.size === 0,
    "denied OpenShell exit was hidden or not cleaned",
  );

  const oversizedAuditTransport = new FakeOpenShellTransport();
  oversizedAuditTransport.auditBytes = new Uint8Array(2_049);
  const oversizedAudit = await runRuntimeProvider(provider(oversizedAuditTransport), request());
  ok(
    oversizedAudit.taskOutcome === "FAILED_ARTIFACT" &&
    oversizedAudit.taskStage === "collection" &&
    oversizedAudit.cleanup.state === "PASS",
    "oversized OpenShell audit stayed green",
  );

  const auditPolicyDriftTransport = new FakeOpenShellTransport();
  auditPolicyDriftTransport.auditPolicyOverride = { ...WORKFLOW.policy, sha256: "6".repeat(64) };
  const auditPolicyDrift = await runRuntimeProvider(provider(auditPolicyDriftTransport), request());
  ok(
    auditPolicyDrift.taskOutcome === "FAILED_ARTIFACT" && auditPolicyDrift.cleanup.state === "PASS",
    "OpenShell audit policy subject drift stayed green",
  );

  const pathEscapeTransport = new FakeOpenShellTransport();
  pathEscapeTransport.auditTouchedPaths = ["workspace/private/result.json"];
  const pathEscape = await runRuntimeProvider(provider(pathEscapeTransport), request());
  ok(
    pathEscape.taskOutcome === "FAILED_ARTIFACT" && pathEscape.cleanup.state === "PASS",
    "OpenShell touched-path escape stayed green",
  );

  const residueTransport = new FakeOpenShellTransport();
  residueTransport.terminateMode = "leave-session";
  const residue = await runRuntimeProvider(provider(residueTransport), request());
  ok(
    residue.taskOutcome === "COMPLETED" &&
    residue.outcome === "FAILED_CLEANUP" &&
    residue.cleanup.residue.includes("openshell-session-residue") &&
    residueTransport.sessions.size === 1,
    "OpenShell session residue was hidden",
  );

  const recoveryTransport = new FakeOpenShellTransport();
  recoveryTransport.createMode = "throw-after-create";
  const recovery = await runRuntimeProvider(provider(recoveryTransport), request());
  ok(
    recovery.taskOutcome === "FAILED_MATERIALIZATION" &&
    recovery.taskStage === "materialization" &&
    recovery.cleanup.state === "PASS" &&
    recoveryTransport.calls.terminateByName === 1 &&
    recoveryTransport.sessions.size === 0,
    "partial OpenShell session recovery cleanup failed",
  );

  const recoveryFailureTransport = new FakeOpenShellTransport();
  recoveryFailureTransport.createMode = "throw-after-create";
  recoveryFailureTransport.terminateMode = "leave-session";
  const recoveryFailure = await runRuntimeProvider(provider(recoveryFailureTransport), request());
  ok(
    recoveryFailure.taskOutcome === "FAILED_MATERIALIZATION" &&
    recoveryFailure.outcome === "FAILED_CLEANUP" &&
    recoveryFailureTransport.sessions.size === 1,
    "partial OpenShell session residue stayed green",
  );

  const preCancelledTransport = new FakeOpenShellTransport();
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
    preCancelledTransport.calls.createSession === 0,
    "pre-cancelled OpenShell request created a provider effect",
  );

  red(
    () => assertRuntimeReceiptMatchesRequest({ ...positive, unexpected: true } as unknown as RuntimeReceipt, positiveRequest),
    "open OpenShell receipt",
  );
  red(
    () => assertRuntimeReceiptMatchesRequest({
      ...positive,
      provider: { ...positive.provider, subject: { ...positive.provider.subject!, sha256: "0".repeat(64) } },
    }, positiveRequest),
    "tampered OpenShell adapter subject",
  );

  console.log("SELFTEST GREEN: RT-OS policy, fixed workflow, audit, and cleanup controls");
}

await openShellProviderSelftest();
