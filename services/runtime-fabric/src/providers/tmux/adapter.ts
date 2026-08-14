import { createHash } from "node:crypto";
import { assertTmuxNativePlanClosed, buildTmuxNativePlan, tmuxNativePlanDigest, tmuxSessionRequestDigest } from "./plan.ts";
import { TmuxSessionLifecycle, validateTmuxSessionLifecycle } from "./state-machine.ts";
import {
  TMUX_CAPTURE_RECEIPT_SCHEMA,
  TMUX_CONTROL_RECEIPT_SCHEMA,
  TMUX_SESSION_RECEIPT_SCHEMA,
  type TmuxCaptureReceipt,
  type TmuxCleanupReceipt,
  type TmuxControlAction,
  type TmuxControlOutcome,
  type TmuxControlReceipt,
  type TmuxDriver,
  type TmuxDriverCleanup,
  type TmuxDriverStatus,
  type TmuxNativePlan,
  type TmuxPtyFrame,
  type TmuxSessionIdentity,
  type TmuxSessionOutcome,
  type TmuxSessionReceipt,
  type TmuxSessionRequest,
} from "./types.ts";
import {
  decodeTmuxFrame,
  tmuxEvidence,
  validateSignal,
  validateTmuxDriverDescriptor,
  validateTmuxSessionIdentity,
  validateTmuxSessionRequest,
} from "./validation.ts";

export type TmuxCreateResult =
  | { kind: "ready"; controller: TmuxSessionController; receipt: null }
  | { kind: "terminal"; controller: null; receipt: TmuxSessionReceipt };

export interface TmuxCaptureResult {
  capture: TmuxCaptureReceipt;
  terminal: TmuxSessionReceipt | null;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function emptyCleanup(detail: string): TmuxCleanupReceipt {
  return { state: "NOT_EXERCISED", durationMs: 0, processGroupChecked: false, sessionChecked: false, residue: [], detail };
}

function validateCleanup(value: TmuxDriverCleanup, maxDurationMs: number): TmuxCleanupReceipt {
  if (!Number.isSafeInteger(value.durationMs) || value.durationMs < 0 || value.durationMs > maxDurationMs) {
    throw new Error("tmux cleanup duration is invalid");
  }
  if (!Array.isArray(value.residue) || value.residue.length > 128 || value.residue.some((entry) => typeof entry !== "string" || !/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(entry))) {
    throw new Error("tmux cleanup residue is invalid");
  }
  if (new Set(value.residue).size !== value.residue.length) throw new Error("tmux cleanup residue contains duplicates");
  if (value.state === "PASS" && (!value.processGroupChecked || !value.sessionChecked || value.residue.length > 0)) {
    throw new Error("tmux cleanup PASS contains unchecked or residual state");
  }
  return {
    state: value.state,
    durationMs: value.durationMs,
    processGroupChecked: value.processGroupChecked,
    sessionChecked: value.sessionChecked,
    residue: [...value.residue].sort(),
    detail: portableDetail(value.detail),
  };
}

function portableDetail(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024 || /\p{Cc}/u.test(value)) {
    throw new Error("tmux detail is not bounded printable metadata");
  }
  return value;
}

function validateStatus(value: TmuxDriverStatus): TmuxDriverStatus {
  if (typeof value.running !== "boolean" || !Number.isSafeInteger(value.lastActivityEpochMs) || value.lastActivityEpochMs < 0) {
    throw new Error("tmux driver status is invalid");
  }
  if (value.exitCode !== null && (!Number.isSafeInteger(value.exitCode) || value.exitCode < 0 || value.exitCode > 255)) {
    throw new Error("tmux driver exit code is invalid");
  }
  return { running: value.running, exitCode: value.exitCode, signal: validateSignal(value.signal), lastActivityEpochMs: value.lastActivityEpochMs };
}

function controlReceipt(
  request: TmuxSessionRequest,
  sessionName: string | null,
  action: TmuxControlAction,
  outcome: TmuxControlOutcome,
  detail: string,
): TmuxControlReceipt {
  return freeze({
    schema: TMUX_CONTROL_RECEIPT_SCHEMA,
    requestId: request.requestId,
    sessionName,
    action,
    outcome,
    state: outcome === "ATTACHED" || outcome === "DETACHED" || outcome === "AUTHORIZED" ? "PASS" : "FAIL",
    capabilityRef: request.authorization.capabilityRef,
    detail: portableDetail(detail),
  });
}

function earlyReceipt(
  request: TmuxSessionRequest,
  driver: TmuxDriver,
  lifecycle: TmuxSessionLifecycle,
  outcome: Extract<TmuxSessionOutcome, "ABSENT_TMUX" | "FAILED_CREATE">,
  plan: TmuxNativePlan | null,
  detail: string,
  cleanup = emptyCleanup("no admitted tmux session identity existed"),
): TmuxSessionReceipt {
  lifecycle.transition(outcome);
  validateTmuxSessionLifecycle(lifecycle.trace);
  return freeze({
    schema: TMUX_SESSION_RECEIPT_SCHEMA,
    requestId: request.requestId,
    requestDigest: tmuxSessionRequestDigest(request),
    upstream: { ...request.upstream },
    externalTmuxState: validateTmuxDriverDescriptor(driver.descriptor).externalState,
    lifecycle: [...lifecycle.trace],
    outcome,
    state: tmuxEvidence(outcome),
    session: null,
    nativePlanDigest: plan ? tmuxNativePlanDigest(plan) : null,
    attachCount: 0,
    detachCount: 0,
    authRefusalCount: 0,
    capturedFrames: 0,
    capturedBytes: 0,
    lastSequence: 0,
    streamTruncated: false,
    exit: { code: null, signal: null },
    cleanup,
    exclusions: [...request.exclusions],
    detail: portableDetail(detail),
  });
}

export async function createTmuxSession(driver: TmuxDriver, value: unknown, nowEpochMs: number): Promise<TmuxCreateResult> {
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) throw new Error("nowEpochMs is invalid");
  const request = freeze(validateTmuxSessionRequest(value));
  const descriptor = freeze(validateTmuxDriverDescriptor(driver.descriptor));
  if (!same(descriptor.upstream, request.upstream)) throw new Error("tmux driver source subject does not match request upstream");
  const lifecycle = new TmuxSessionLifecycle();
  const host = await driver.checkHost();
  if (host.state === "ABSENT") {
    return { kind: "terminal", controller: null, receipt: earlyReceipt(request, driver, lifecycle, "ABSENT_TMUX", null, host.detail) };
  }
  lifecycle.transition("HOST_CHECKED");
  lifecycle.transition("SESSION_CREATING");
  const plan = buildTmuxNativePlan(request);
  assertTmuxNativePlanClosed(plan);
  let identity: TmuxSessionIdentity;
  try {
    identity = freeze(validateTmuxSessionIdentity(await driver.create(plan, request)));
    if (identity.sessionName !== plan.sessionName || identity.socketName !== plan.socketName || !same(identity.workspace, request.workspace)) {
      throw new Error("tmux driver returned an identity outside the deterministic plan");
    }
  } catch {
    return {
      kind: "terminal",
      controller: null,
      receipt: earlyReceipt(request, driver, lifecycle, "FAILED_CREATE", plan, "tmux session creation failed before an admitted identity was returned"),
    };
  }
  lifecycle.transition("SESSION_READY");
  lifecycle.transition("DETACHED");
  return {
    kind: "ready",
    controller: new TmuxSessionController(driver, request, lifecycle, plan, identity, nowEpochMs),
    receipt: null,
  };
}

export class TmuxSessionController {
  readonly #driver: TmuxDriver;
  readonly #request: TmuxSessionRequest;
  readonly #lifecycle: TmuxSessionLifecycle;
  readonly #plan: TmuxNativePlan;
  readonly #identity: TmuxSessionIdentity;
  readonly #startedAtEpochMs: number;
  #lastActivityEpochMs: number;
  #attachCount = 0;
  #detachCount = 0;
  #authRefusalCount = 0;
  #capturedFrames = 0;
  #capturedBytes = 0;
  #lastSequence = 0;
  #streamTruncated = false;
  #terminal: TmuxSessionReceipt | null = null;
  #lastStatus: TmuxDriverStatus = { running: true, exitCode: null, signal: null, lastActivityEpochMs: 0 };

  constructor(
    driver: TmuxDriver,
    request: TmuxSessionRequest,
    lifecycle: TmuxSessionLifecycle,
    plan: TmuxNativePlan,
    identity: TmuxSessionIdentity,
    nowEpochMs: number,
  ) {
    this.#driver = driver;
    this.#request = request;
    this.#lifecycle = lifecycle;
    this.#plan = plan;
    this.#identity = identity;
    this.#startedAtEpochMs = nowEpochMs;
    this.#lastActivityEpochMs = nowEpochMs;
    this.#lastStatus = { running: true, exitCode: null, signal: null, lastActivityEpochMs: nowEpochMs };
  }

  get identity(): TmuxSessionIdentity { return freeze({ ...this.#identity, workspace: { ...this.#identity.workspace }, process: { ...this.#identity.process } }); }
  get currentState() { return this.#lifecycle.current; }
  get terminalReceipt(): TmuxSessionReceipt | null { return this.#terminal; }

  #authorized(action: TmuxControlAction, capabilityRef: string, nowEpochMs: number): boolean {
    const authorization = this.#request.authorization;
    return capabilityRef === authorization.capabilityRef && nowEpochMs < authorization.expiresAtEpochMs && authorization.actions.includes(action);
  }

  #refused(action: TmuxControlAction, detail: string): TmuxControlReceipt {
    this.#authRefusalCount += 1;
    return controlReceipt(this.#request, this.#identity.sessionName, action, "AUTH_REFUSED", detail);
  }

  async attach(capabilityRef: string, nowEpochMs: number): Promise<TmuxControlReceipt> {
    if (!this.#authorized("attach", capabilityRef, nowEpochMs)) return this.#refused("attach", "attach capability is absent, expired, or mismatched");
    if (this.#terminal) return controlReceipt(this.#request, this.#identity.sessionName, "attach", "FAILED_ATTACH", "session is terminal");
    if (this.#lifecycle.current === "ATTACHED") return controlReceipt(this.#request, this.#identity.sessionName, "attach", "ATTACHED", "session was already attached");
    const result = await this.#driver.attach(this.#identity);
    if (result.state !== "PASS") return controlReceipt(this.#request, this.#identity.sessionName, "attach", "FAILED_ATTACH", result.detail);
    this.#lifecycle.transition("ATTACHED");
    this.#attachCount += 1;
    return controlReceipt(this.#request, this.#identity.sessionName, "attach", "ATTACHED", result.detail);
  }

  async detach(capabilityRef: string, nowEpochMs: number): Promise<TmuxControlReceipt> {
    if (!this.#authorized("detach", capabilityRef, nowEpochMs)) return this.#refused("detach", "detach capability is absent, expired, or mismatched");
    if (this.#terminal) return controlReceipt(this.#request, this.#identity.sessionName, "detach", "FAILED_ATTACH", "session is terminal");
    if (this.#lifecycle.current === "DETACHED") return controlReceipt(this.#request, this.#identity.sessionName, "detach", "DETACHED", "session was already detached");
    const result = await this.#driver.detach(this.#identity);
    if (result.state !== "PASS") return controlReceipt(this.#request, this.#identity.sessionName, "detach", "FAILED_ATTACH", result.detail);
    this.#lifecycle.transition("DETACHED");
    this.#detachCount += 1;
    return controlReceipt(this.#request, this.#identity.sessionName, "detach", "DETACHED", result.detail);
  }

  async capture(capabilityRef: string, nowEpochMs: number): Promise<TmuxCaptureResult> {
    if (!this.#authorized("capture", capabilityRef, nowEpochMs)) {
      this.#authRefusalCount += 1;
      return {
        capture: freeze({
          schema: TMUX_CAPTURE_RECEIPT_SCHEMA,
          requestId: this.#request.requestId,
          sessionName: this.#identity.sessionName,
          state: "FAIL",
          frames: [],
          firstSequence: null,
          lastSequence: null,
          frameCount: 0,
          totalBytes: 0,
          truncated: false,
          taskRunning: !this.#terminal,
          detail: "capture capability is absent, expired, or mismatched",
        }),
        terminal: this.#terminal,
      };
    }
    if (this.#terminal) return { capture: this.#captureReceipt([], false, false, "session is terminal"), terminal: this.#terminal };
    const timed = await this.#checkTime(nowEpochMs);
    if (timed) return { capture: this.#captureReceipt([], false, false, "session reached a configured time limit"), terminal: timed };
    const batch = await this.#driver.capture(this.#identity, this.#lastSequence, Math.max(1, this.#request.stream.maxFrames - this.#capturedFrames));
    const status = validateStatus(batch.status);
    this.#lastStatus = status;
    const accepted: TmuxPtyFrame[] = [];
    let batchBytes = 0;
    try {
      for (const candidate of batch.frames) {
        const { frame, bytes } = decodeTmuxFrame(candidate, this.#request.stream.maxFrameBytes);
        if (frame.sequence <= this.#lastSequence) throw new Error("tmux frame sequence is stale or duplicated");
        const observedDigest = createHash("sha256").update(bytes).digest("hex");
        if (observedDigest !== frame.sha256) throw new Error("tmux frame digest mismatch");
        if (this.#capturedFrames + accepted.length + 1 > this.#request.stream.maxFrames || this.#capturedBytes + batchBytes + frame.bytes > this.#request.stream.maxTotalBytes) {
          this.#streamTruncated = true;
          const terminal = await this.#finalize("STREAM_LIMIT", nowEpochMs, status, "bounded PTY stream limit reached");
          return { capture: this.#captureReceipt(accepted, true, status.running, "PTY stream stopped at the declared bound"), terminal };
        }
        accepted.push(frame);
        batchBytes += frame.bytes;
        this.#lastSequence = frame.sequence;
      }
    } catch {
      this.#streamTruncated = true;
      const terminal = await this.#finalize("STREAM_LIMIT", nowEpochMs, status, "invalid or unbounded PTY frame was refused");
      return { capture: this.#captureReceipt(accepted, true, status.running, "invalid PTY frame turned the stream red"), terminal };
    }
    this.#capturedFrames += accepted.length;
    this.#capturedBytes += batchBytes;
    if (accepted.length > 0) this.#lastActivityEpochMs = Math.max(nowEpochMs, status.lastActivityEpochMs);
    if (!status.running) {
      const outcome: TmuxSessionOutcome = status.exitCode === 0 ? "TERMINATED" : "PROCESS_FAILED";
      const terminal = await this.#finalize(outcome, nowEpochMs, status, outcome === "TERMINATED" ? "task process completed" : "task process exited with failure");
      return { capture: this.#captureReceipt(accepted, false, false, "final PTY frames collected"), terminal };
    }
    if (nowEpochMs - Math.max(this.#lastActivityEpochMs, status.lastActivityEpochMs) >= this.#request.stream.maxIdleMs) {
      const terminal = await this.#finalize("TIMED_OUT", nowEpochMs, status, "PTY session exceeded the idle bound");
      return { capture: this.#captureReceipt(accepted, false, false, "idle timeout reached after bounded capture"), terminal };
    }
    return { capture: this.#captureReceipt(accepted, false, true, "bounded PTY frames captured"), terminal: null };
  }

  async stop(capabilityRef: string, nowEpochMs: number): Promise<TmuxSessionReceipt | TmuxControlReceipt> {
    if (!this.#authorized("stop", capabilityRef, nowEpochMs)) return this.#refused("stop", "stop capability is absent, expired, or mismatched");
    return this.#finalize("CANCELLED", nowEpochMs, await this.#driver.status(this.#identity), "authorized stop requested");
  }

  async poll(nowEpochMs: number): Promise<TmuxSessionReceipt | null> {
    if (this.#terminal) return this.#terminal;
    const timed = await this.#checkTime(nowEpochMs);
    if (timed) return timed;
    const status = validateStatus(await this.#driver.status(this.#identity));
    this.#lastStatus = status;
    if (!status.running) return this.#finalize(status.exitCode === 0 ? "TERMINATED" : "PROCESS_FAILED", nowEpochMs, status, "task process reached a terminal state");
    if (nowEpochMs - Math.max(this.#lastActivityEpochMs, status.lastActivityEpochMs) >= this.#request.stream.maxIdleMs) {
      return this.#finalize("TIMED_OUT", nowEpochMs, status, "PTY session exceeded the idle bound");
    }
    return null;
  }

  async #checkTime(nowEpochMs: number): Promise<TmuxSessionReceipt | null> {
    if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < this.#startedAtEpochMs) throw new Error("nowEpochMs is invalid");
    if (nowEpochMs - this.#startedAtEpochMs >= this.#request.stream.maxTaskMs) {
      return this.#finalize("TIMED_OUT", nowEpochMs, await this.#driver.status(this.#identity), "task exceeded the maximum duration");
    }
    return null;
  }

  #captureReceipt(frames: TmuxPtyFrame[], truncated: boolean, running: boolean, detail: string): TmuxCaptureReceipt {
    return freeze({
      schema: TMUX_CAPTURE_RECEIPT_SCHEMA,
      requestId: this.#request.requestId,
      sessionName: this.#identity.sessionName,
      state: truncated ? "FAIL" : "PASS",
      frames: frames.map((frame) => ({ ...frame })),
      firstSequence: frames[0]?.sequence ?? null,
      lastSequence: frames.at(-1)?.sequence ?? null,
      frameCount: frames.length,
      totalBytes: frames.reduce((sum, frame) => sum + frame.bytes, 0),
      truncated,
      taskRunning: running,
      detail: portableDetail(detail),
    });
  }

  async #finalize(
    desired: TmuxSessionOutcome,
    nowEpochMs: number,
    rawStatus: TmuxDriverStatus,
    detail: string,
  ): Promise<TmuxSessionReceipt> {
    if (this.#terminal) return this.#terminal;
    const status = validateStatus(rawStatus);
    this.#lastStatus = status;
    if (this.#lifecycle.current !== "STOPPING" && this.#lifecycle.current !== "COLLECTING") this.#lifecycle.transition("STOPPING");
    const termination = await this.#driver.terminate(this.#identity, this.#identity.process.generationToken);
    if (termination.state !== "PASS" || termination.observedGenerationToken !== this.#identity.process.generationToken) {
      this.#lifecycle.transition("FAILED_TERMINATE");
      this.#terminal = this.#sessionReceipt("FAILED_TERMINATE", status, {
        state: "FAIL",
        durationMs: 0,
        processGroupChecked: false,
        sessionChecked: false,
        residue: [termination.state === "IDENTITY_MISMATCH" ? "stale-process-identity" : "termination-failed"],
        detail: termination.detail,
      }, `${detail}; termination refused or failed`);
      return this.#terminal;
    }
    this.#lifecycle.transition("COLLECTING");
    let cleanup: TmuxCleanupReceipt;
    try {
      cleanup = validateCleanup(await this.#driver.cleanup(this.#identity, this.#identity.process.generationToken), this.#request.cleanup.maxDurationMs);
    } catch {
      cleanup = { state: "FAIL", durationMs: 0, processGroupChecked: false, sessionChecked: false, residue: ["cleanup-invalid"], detail: "tmux cleanup receipt was invalid" };
    }
    const outcome = cleanup.state === "PASS" ? desired : "FAILED_CLEANUP";
    this.#lifecycle.transition(outcome);
    this.#terminal = this.#sessionReceipt(outcome, status, cleanup, detail);
    return this.#terminal;
  }

  #sessionReceipt(outcome: TmuxSessionOutcome, status: TmuxDriverStatus, cleanup: TmuxCleanupReceipt, detail: string): TmuxSessionReceipt {
    validateTmuxSessionLifecycle(this.#lifecycle.trace);
    return freeze({
      schema: TMUX_SESSION_RECEIPT_SCHEMA,
      requestId: this.#request.requestId,
      requestDigest: tmuxSessionRequestDigest(this.#request),
      upstream: { ...this.#request.upstream },
      externalTmuxState: validateTmuxDriverDescriptor(this.#driver.descriptor).externalState,
      lifecycle: [...this.#lifecycle.trace],
      outcome,
      state: tmuxEvidence(outcome),
      session: { ...this.#identity, workspace: { ...this.#identity.workspace }, process: { ...this.#identity.process } },
      nativePlanDigest: tmuxNativePlanDigest(this.#plan),
      attachCount: this.#attachCount,
      detachCount: this.#detachCount,
      authRefusalCount: this.#authRefusalCount,
      capturedFrames: this.#capturedFrames,
      capturedBytes: this.#capturedBytes,
      lastSequence: this.#lastSequence,
      streamTruncated: this.#streamTruncated,
      exit: { code: status.exitCode, signal: status.signal },
      cleanup,
      exclusions: [...this.#request.exclusions],
      detail: portableDetail(detail),
    });
  }
}
