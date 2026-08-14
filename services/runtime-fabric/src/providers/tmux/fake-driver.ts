import { createHash } from "node:crypto";
import type {
  TmuxDriver,
  TmuxDriverCapture,
  TmuxDriverCleanup,
  TmuxDriverDescriptor,
  TmuxDriverStatus,
  TmuxDriverTermination,
  TmuxNativePlan,
  TmuxPtyFrame,
  TmuxSessionIdentity,
  TmuxSessionRequest,
} from "./types.ts";

interface FakeSession {
  identity: TmuxSessionIdentity;
  attached: boolean;
  running: boolean;
  exitCode: number | null;
  signal: string | null;
  lastActivityEpochMs: number;
  frames: TmuxPtyFrame[];
  terminated: boolean;
  cleanupFailure: boolean;
  residue: string[];
}

const upstream = {
  repository: "https://github.com/tmux/tmux",
  version: "3.7b",
  tag: "3.7b",
  tagObject: "3423e0dcc6ec1069d575cd104ed1c005e3e3943f",
  commit: "e802909de06012a4df6209d55e86487c56223163",
  archiveSha256: "87f2e99e3b685973f2ca002ffd6ed7e51a5744f7009daae5a15670b6d532db96",
  license: "ISC",
  tagSignature: "UNVERIFIED",
  artifactAdmission: "NOT_EXERCISED",
} as const;

function digest(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function frame(text: string, sequence: number, eof = false): TmuxPtyFrame {
  const bytes = new TextEncoder().encode(text);
  const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join("");
  return { sequence, dataBase64: btoa(binary), bytes: bytes.byteLength, sha256: digest(bytes), eof };
}

export class FakeTmuxDriver implements TmuxDriver {
  readonly descriptor: TmuxDriverDescriptor = { upstream: { ...upstream }, externalState: "NOT_EXERCISED" };
  readonly #sessions = new Map<string, FakeSession>();
  hostAvailable = true;
  attachFailure = false;
  detachFailure = false;
  createFailure = false;
  terminationFailure = false;
  terminateCalls = 0;
  attachCalls = 0;
  detachCalls = 0;
  identityMismatchSignals = 0;

  async checkHost() { return this.hostAvailable ? { state: "AVAILABLE" as const, detail: "deterministic tmux driver host available" } : { state: "ABSENT" as const, detail: "tmux executable is absent" }; }

  async create(plan: TmuxNativePlan, request: TmuxSessionRequest): Promise<TmuxSessionIdentity> {
    if (this.createFailure) throw new Error("fixture create failure");
    if (this.#sessions.has(plan.sessionName)) throw new Error("fixture duplicate session");
    const token = digest(`${plan.socketName}:${plan.sessionName}:${request.workspace.sha256}`);
    const identity: TmuxSessionIdentity = {
      socketName: plan.socketName,
      sessionName: plan.sessionName,
      paneId: `%${this.#sessions.size + 1}`,
      workspace: { ...request.workspace },
      process: { groupId: `pg-${token.slice(0, 20)}`, generationToken: token },
    };
    this.#sessions.set(plan.sessionName, {
      identity: { ...identity, workspace: { ...identity.workspace }, process: { ...identity.process } },
      attached: false,
      running: true,
      exitCode: null,
      signal: null,
      lastActivityEpochMs: 0,
      frames: [],
      terminated: false,
      cleanupFailure: false,
      residue: [],
    });
    return identity;
  }

  async attach(identity: TmuxSessionIdentity) {
    this.attachCalls += 1;
    const session = this.#session(identity);
    if (this.attachFailure) return { state: "FAIL" as const, detail: "fixture attach failure" };
    session.attached = true;
    return { state: "PASS" as const, detail: "fixture attached" };
  }

  async detach(identity: TmuxSessionIdentity) {
    this.detachCalls += 1;
    const session = this.#session(identity);
    if (this.detachFailure) return { state: "FAIL" as const, detail: "fixture detach failure" };
    session.attached = false;
    return { state: "PASS" as const, detail: "fixture detached while task continued" };
  }

  async capture(identity: TmuxSessionIdentity, afterSequence: number, maxFrames: number): Promise<TmuxDriverCapture> {
    const session = this.#session(identity);
    return {
      frames: session.frames.filter((candidate) => candidate.sequence > afterSequence).slice(0, maxFrames).map((candidate) => ({ ...candidate })),
      status: this.#status(session),
    };
  }

  async status(identity: TmuxSessionIdentity): Promise<TmuxDriverStatus> { return this.#status(this.#session(identity)); }

  async terminate(identity: TmuxSessionIdentity, expectedGenerationToken: string): Promise<TmuxDriverTermination> {
    this.terminateCalls += 1;
    const session = this.#session(identity);
    if (session.identity.process.generationToken !== expectedGenerationToken) {
      this.identityMismatchSignals += 1;
      return { state: "IDENTITY_MISMATCH", observedGenerationToken: session.identity.process.generationToken, detail: "fixture process generation changed; no signal sent" };
    }
    if (this.terminationFailure) return { state: "FAIL", observedGenerationToken: expectedGenerationToken, detail: "fixture termination failure" };
    session.running = false;
    session.terminated = true;
    if (session.exitCode === null) session.exitCode = 0;
    return { state: "PASS", observedGenerationToken: expectedGenerationToken, detail: "fixture process group and session terminated" };
  }

  async cleanup(identity: TmuxSessionIdentity, expectedGenerationToken: string): Promise<TmuxDriverCleanup> {
    const session = this.#session(identity);
    if (session.identity.process.generationToken !== expectedGenerationToken) {
      return { state: "FAIL", durationMs: 0, processGroupChecked: false, sessionChecked: false, residue: ["stale-process-identity"], detail: "fixture cleanup refused a reused process identity" };
    }
    if (session.cleanupFailure || !session.terminated || session.residue.length > 0) {
      return { state: "FAIL", durationMs: 1, processGroupChecked: true, sessionChecked: true, residue: session.residue.length ? [...session.residue] : ["session-residue"], detail: "fixture cleanup found residue" };
    }
    return { state: "PASS", durationMs: 1, processGroupChecked: true, sessionChecked: true, residue: [], detail: "fixture process group and session cleanup passed" };
  }

  append(sessionName: string, text: string, nowEpochMs: number, eof = false): TmuxPtyFrame {
    const session = this.#named(sessionName);
    const next = (session.frames.at(-1)?.sequence ?? 0) + 1;
    const value = frame(text, next, eof);
    session.frames.push(value);
    session.lastActivityEpochMs = nowEpochMs;
    return { ...value };
  }

  appendFrame(sessionName: string, value: TmuxPtyFrame, nowEpochMs: number): void {
    const session = this.#named(sessionName);
    session.frames.push({ ...value });
    session.lastActivityEpochMs = nowEpochMs;
  }

  complete(sessionName: string, exitCode: number, nowEpochMs: number, signal: string | null = null): void {
    const session = this.#named(sessionName);
    session.running = false;
    session.exitCode = exitCode;
    session.signal = signal;
    session.lastActivityEpochMs = nowEpochMs;
  }

  setCleanupFailure(sessionName: string, residue = ["orphan-descendant"]): void {
    const session = this.#named(sessionName);
    session.cleanupFailure = true;
    session.residue = [...residue];
  }

  rotateProcessIdentity(sessionName: string): void {
    const session = this.#named(sessionName);
    session.identity.process.generationToken = digest(`${session.identity.process.generationToken}:reused`);
  }

  isRunning(sessionName: string): boolean { return this.#named(sessionName).running; }
  isAttached(sessionName: string): boolean { return this.#named(sessionName).attached; }
  sessionCount(): number { return this.#sessions.size; }

  #status(session: FakeSession): TmuxDriverStatus {
    return { running: session.running, exitCode: session.exitCode, signal: session.signal, lastActivityEpochMs: session.lastActivityEpochMs };
  }

  #session(identity: TmuxSessionIdentity): FakeSession {
    const session = this.#named(identity.sessionName);
    if (session.identity.socketName !== identity.socketName) throw new Error("fixture socket identity mismatch");
    return session;
  }

  #named(sessionName: string): FakeSession {
    const session = this.#sessions.get(sessionName);
    if (!session) throw new Error(`fixture session missing: ${sessionName}`);
    return session;
  }
}

export { frame as fakeTmuxFrame, upstream as fakeTmuxUpstream };
