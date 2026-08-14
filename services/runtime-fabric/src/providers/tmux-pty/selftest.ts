import {
  validateRuntimeRequest,
  type RuntimeCleanupReceipt,
  type RuntimeRequest,
} from "../../../../../packages/contracts/src/runtime/index.ts";
import { runRuntimeProvider } from "../../spi/index.ts";
import {
  TMUX_PTY_ADAPTER_VERSION,
  TMUX_PTY_ADMISSION_SCHEMA,
  TMUX_PTY_PROVIDER_ID,
  TmuxPtyProvider,
  assertTmuxPtyReceipt,
  buildTmuxPtyPlan,
  validateTmuxPtyAdmission,
  validateTmuxPtyWorkload,
  type TmuxPtyBackend,
  type TmuxPtyToolAdmission,
  type TmuxPtyWorkloadDefinition,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`TMUX-PTY ${message}`);
}

function red(action: () => unknown, message: string): void {
  let failed = false;
  try {
    action();
  } catch {
    failed = true;
  }
  ok(failed, `${message} stayed green`);
}

function admission(state: TmuxPtyToolAdmission["state"] = "PASS"): TmuxPtyToolAdmission {
  return {
    schema: TMUX_PTY_ADMISSION_SCHEMA,
    repository: "https://github.com/tmux/tmux",
    commit: "1".repeat(40),
    tree: "2".repeat(40),
    version: "3.5a",
    binarySha256: "3".repeat(64),
    licenseSha256: "4".repeat(64),
    ptyHarnessSha256: "5".repeat(64),
    platform: "linux",
    architecture: "amd64",
    state,
    detail: "deterministic fixture only; no live tmux or PTY receipt",
  };
}

function workload(profileSha256 = "6".repeat(64)): TmuxPtyWorkloadDefinition {
  return {
    id: "fixture.tmux-pty.echo",
    version: "1.0.0",
    profile: {
      profileId: "agent-shield.fixture-terminal",
      profileVersion: "1.0.0",
      profileSha256,
      columns: 120,
      rows: 40,
      terminalType: "xterm-256color",
      reconnect: true,
      maxTranscriptBytes: 4_096,
    },
    entrypointId: "agent-shield.echo",
    allowedInputKeys: ["message"],
    requiredCapabilities: ["artifact-return", "pty", "session-reconnect", "terminal-transcript"],
  };
}

function requestValue(): Record<string, unknown> {
  return {
    schema: "agent-shield/runtime-request/v2",
    requestId: "tmux-pty-fixture",
    providerId: TMUX_PTY_PROVIDER_ID,
    providerVersion: TMUX_PTY_ADAPTER_VERSION,
    providerSubject: {
      kind: "artifact",
      id: TMUX_PTY_PROVIDER_ID,
      version: TMUX_PTY_ADAPTER_VERSION,
      sha256: admission().ptyHarnessSha256,
    },
    environmentSubject: {
      kind: "profile",
      id: workload().profile.profileId,
      version: workload().profile.profileVersion,
      sha256: workload().profile.profileSha256,
    },
    scope: "local",
    requiredCapabilities: ["artifact-return", "pty", "session-reconnect", "terminal-transcript"],
    source: {
      kind: "git",
      repository: "https://github.com/ed3c/agent-shield-monorepo",
      commit: "7".repeat(40),
      tree: "8".repeat(40),
    },
    workload: {
      id: "fixture.tmux-pty.echo",
      version: "1.0.0",
      input: { message: "hello" },
    },
    environment: { allowedVariables: [] },
    network: { mode: "deny-all", allowlist: [] },
    secrets: [],
    limits: {
      timeoutMs: 1_000,
      cancellationGraceMs: 100,
      maxInputBytes: 2_048,
      maxOutputBytes: 4_096,
      maxArtifactBytes: 32_768,
      maxTouchedPaths: 8,
    },
    mutation: {
      writableRoots: ["workspace/output"],
      readOnlyRoots: ["workspace/input"],
    },
    artifacts: [
      {
        kind: "tmux-pty-admission",
        required: true,
        maxBytes: 8_192,
        mediaTypes: ["application/json"],
      },
      {
        kind: "tmux-pty-session-plan",
        required: true,
        maxBytes: 16_384,
        mediaTypes: ["application/json"],
      },
      {
        kind: "terminal-transcript",
        required: true,
        maxBytes: 4_096,
        mediaTypes: ["text/plain"],
      },
    ],
    cleanup: {
      processCleanup: "required",
      workspaceCleanup: "delete",
      sessionCleanup: "required",
      maxDurationMs: 1_000,
    },
    exclusions: ["host-socket", "live-pty", "performance", "production"],
  };
}

function request(): RuntimeRequest {
  return validateRuntimeRequest(requestValue());
}

interface BackendOptions {
  cleanupState?: RuntimeCleanupReceipt["state"];
  reservedArtifact?: boolean;
  transcriptBytes?: number;
  workspaceIdentity?: string;
}

function fixtureBackend(options: BackendOptions = {}): TmuxPtyBackend {
  return {
    async materialize() {
      return {
        workspaceIdentity: options.workspaceIdentity ?? `tmux-session-workspace:sha256:${"9".repeat(64)}`,
        handle: { logicalSession: "fixture" },
      };
    },
    async execute() {
      return {
        state: "PASS",
        exit: { code: 0, signal: null, timedOut: false, cancelled: false },
        stdoutBytes: 5,
        stderrBytes: 0,
        detail: "fixture PTY execution completed",
      };
    },
    async collect() {
      const reserved = options.reservedArtifact ?? false;
      return {
        state: "PASS",
        artifacts: [
          {
            kind: reserved ? "tmux-pty-session-plan" : "terminal-transcript",
            sha256: "a".repeat(64),
            bytes: options.transcriptBytes ?? 5,
            mediaType: reserved ? "application/json" : "text/plain",
          },
        ],
        touchedPaths: ["workspace/output/transcript.txt"],
        detail: "fixture transcript collected",
      };
    },
    async cleanup() {
      const state = options.cleanupState ?? "PASS";
      const exercised = state !== "NOT_EXERCISED";
      return {
        state,
        durationMs: exercised ? 1 : 0,
        processesChecked: exercised,
        workspaceChecked: exercised,
        sessionsChecked: exercised,
        workspaceDisposition: state === "PASS" ? "DELETED" : "UNKNOWN",
        preservationRef: null,
        residue: state === "FAIL" ? ["tmux-session-residue"] : [],
        detail: `fixture cleanup ${state}`,
      };
    },
    async cleanupFailedMaterialization() {
      return {
        state: "PASS",
        durationMs: 1,
        processesChecked: true,
        workspaceChecked: true,
        sessionsChecked: true,
        workspaceDisposition: "ABSENT",
        preservationRef: null,
        residue: [],
        detail: "fixture verified no partial tmux-PTY session survived materialization failure",
      };
    },
  };
}

export async function tmuxPtySelftest(): Promise<void> {
  const admitted = admission();
  const definition = workload();
  const valid = request();
  const provider = new TmuxPtyProvider({
    admission: admitted,
    workload: definition,
    backend: fixtureBackend(),
  });

  const receipt = await runRuntimeProvider(provider, valid);
  ok(
    receipt.outcome === "COMPLETED" &&
      receipt.artifacts.length === 3 &&
      receipt.cleanup.state === "PASS",
    "positive lifecycle failed",
  );
  assertTmuxPtyReceipt(receipt, valid, admitted, definition);
  ok(provider.descriptor.liveEvidence === "NOT_EXERCISED", "fixture promoted live tmux evidence");

  const unavailable = new TmuxPtyProvider({
    admission: admission("NOT_EXERCISED"),
    workload: definition,
    backend: fixtureBackend(),
  });
  ok((await runRuntimeProvider(unavailable, valid)).outcome === "ABSENT", "unexercised tool became available");

  red(
    () => validateTmuxPtyAdmission({ ...admitted, repository: "https://github.com/example/tmux" }),
    "unofficial tmux source",
  );
  red(
    () => validateTmuxPtyWorkload({ ...definition, allowedInputKeys: ["socketPath"] }),
    "host socket control",
  );
  red(
    () => validateTmuxPtyWorkload({ ...definition, allowedInputKeys: ["argv"] }),
    "generic argv control",
  );

  const unadmittedInput = requestValue();
  ((unadmittedInput.workload as Record<string, unknown>).input as Record<string, unknown>).other = "value";
  ok((await runRuntimeProvider(provider, unadmittedInput)).outcome === "FAILED_ADMISSION", "unknown workload input escaped");

  const environment = requestValue();
  environment.environment = { allowedVariables: ["TERM"] };
  ok((await runRuntimeProvider(provider, environment)).outcome === "FAILED_ADMISSION", "raw environment delivery escaped");

  const network = requestValue();
  network.network = { mode: "allowlist", allowlist: ["example.com"] };
  ok((await runRuntimeProvider(provider, network)).outcome === "FAILED_ADMISSION", "network access escaped");

  const oversizedContract = requestValue();
  const artifacts = oversizedContract.artifacts as Array<Record<string, unknown>>;
  artifacts.find((entry) => entry.kind === "terminal-transcript")!.maxBytes = 8_192;
  ok((await runRuntimeProvider(provider, oversizedContract)).outcome === "FAILED_ADMISSION", "profile transcript limit escaped");

  const oversizedTranscript = await runRuntimeProvider(
    new TmuxPtyProvider({
      admission: admitted,
      workload: definition,
      backend: fixtureBackend({ transcriptBytes: 4_097 }),
    }),
    valid,
  );
  ok(oversizedTranscript.taskOutcome === "FAILED_ARTIFACT", "oversized transcript stayed green");

  const reserved = await runRuntimeProvider(
    new TmuxPtyProvider({
      admission: admitted,
      workload: definition,
      backend: fixtureBackend({ reservedArtifact: true }),
    }),
    valid,
  );
  ok(
    reserved.taskOutcome === "FAILED_ARTIFACT" && reserved.cleanup.state === "PASS",
    "reserved artifact replacement stayed green",
  );

  const hostIdentity = await runRuntimeProvider(
    new TmuxPtyProvider({
      admission: admitted,
      workload: definition,
      backend: fixtureBackend({ workspaceIdentity: "/private/tmp/tmux.sock" }),
    }),
    valid,
  );
  ok(hostIdentity.outcome === "FAILED_MATERIALIZATION", "host socket path became portable identity");

  const cleanup = await runRuntimeProvider(
    new TmuxPtyProvider({
      admission: admitted,
      workload: definition,
      backend: fixtureBackend({ cleanupState: "FAIL" }),
    }),
    valid,
  );
  ok(
    cleanup.taskOutcome === "COMPLETED" && cleanup.outcome === "FAILED_CLEANUP",
    "session cleanup failure hid task outcome",
  );

  const tampered = structuredClone(receipt);
  const sessionPlan = tampered.artifacts.find((entry) => entry.kind === "tmux-pty-session-plan");
  ok(sessionPlan, "session plan missing before mutation");
  sessionPlan.sha256 = "b".repeat(64);
  red(() => assertTmuxPtyReceipt(tampered, valid, admitted, definition), "tampered session plan");

  ok(
    buildTmuxPtyPlan(valid, admitted, definition).planArtifact.sha256 !==
      buildTmuxPtyPlan(valid, admitted, workload("c".repeat(64))).planArtifact.sha256,
    "terminal profile mutation did not change plan subject",
  );
}

await tmuxPtySelftest();
console.log("TMUX-PTY SELFTEST GREEN: deterministic adapter contracts");
