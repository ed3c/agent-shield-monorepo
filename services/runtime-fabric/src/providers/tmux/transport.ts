import type { RuntimeOperationContext } from "../../spi/index.ts";
import type {
  TmuxExitResult,
  TmuxProbeResult,
  TmuxTransport,
  TmuxWorkflowSpec,
} from "./types.ts";

type BunPipe = ReadableStream<Uint8Array>;

interface BunSubprocessLike {
  readonly exited: Promise<number>;
  readonly stdout: BunPipe;
  readonly stderr: BunPipe;
  kill(signal?: number | string): void;
}

interface BunRuntimeLike {
  spawn(
    command: readonly string[],
    options: { stdout: "pipe"; stderr: "pipe"; stdin: "ignore" },
  ): BunSubprocessLike;
}

function bunRuntime(): BunRuntimeLike {
  const runtime = (globalThis as unknown as { Bun?: BunRuntimeLike }).Bun;
  if (!runtime) throw new Error("Bun runtime is absent");
  return runtime;
}

function boundedText(value: string): string {
  return value.length <= 4096 ? value : `${value.slice(0, 4093)}...`;
}

function safeSessionName(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw new Error("tmux session name is invalid");
}

function validateWorkflow(workflow: TmuxWorkflowSpec): void {
  if (!/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(workflow.id)) throw new Error("tmux workflow ID is invalid");
  if (workflow.argv.length === 0 || workflow.argv.length > 64) throw new Error("tmux workflow argv is empty or unbounded");
  for (const [index, entry] of workflow.argv.entries()) {
    if (entry.length === 0 || entry.length > 1024 || /\p{Cc}/u.test(entry)) {
      throw new Error(`tmux workflow argv[${index}] is invalid`);
    }
  }
  if (
    workflow.allowedExitCodes.length === 0 ||
    workflow.allowedExitCodes.some((code) => !Number.isSafeInteger(code) || code < 0 || code > 255)
  ) {
    throw new Error("tmux workflow allowed exit codes are invalid");
  }
  if (!Number.isSafeInteger(workflow.maxCaptureLines) || workflow.maxCaptureLines < 1 || workflow.maxCaptureLines > 10_000) {
    throw new Error("tmux workflow capture bound is invalid");
  }
}

async function readPipe(pipe: BunPipe): Promise<string> {
  return boundedText(await new Response(pipe).text());
}

export class BunTmuxTransport implements TmuxTransport {
  readonly #expectedVersion: string;

  constructor(expectedVersion: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(expectedVersion)) {
      throw new Error("expected tmux version is invalid");
    }
    this.#expectedVersion = expectedVersion;
  }

  async #run(args: readonly string[], context: RuntimeOperationContext): Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }> {
    if (context.signal.aborted) throw new Error(`tmux ${context.stage} operation was cancelled before spawn`);
    const process = bunRuntime().spawn(["tmux", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const onAbort = (): void => process.kill("SIGTERM");
    context.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const [code, stdout, stderr] = await Promise.all([
        process.exited,
        readPipe(process.stdout),
        readPipe(process.stderr),
      ]);
      if (context.signal.aborted) throw new Error(`tmux ${context.stage} operation was cancelled`);
      return { code, stdout, stderr };
    } finally {
      context.signal.removeEventListener("abort", onAbort);
    }
  }

  async probe(context: RuntimeOperationContext): Promise<TmuxProbeResult> {
    try {
      const result = await this.#run(["-V"], context);
      if (result.code !== 0) return { state: "ABSENT", version: null, detail: "tmux probe returned nonzero" };
      const match = /^tmux\s+([^\s]+)\s*$/i.exec(result.stdout.trim());
      if (!match) return { state: "REFUSED_POLICY", version: null, detail: "tmux version output is not recognized" };
      if (match[1] !== this.#expectedVersion) {
        return { state: "REFUSED_POLICY", version: match[1], detail: "tmux version differs from admitted subject" };
      }
      return { state: "AVAILABLE", version: match[1], detail: "tmux executable version matches admitted subject" };
    } catch {
      return { state: "ABSENT", version: null, detail: "tmux executable or Bun process capability is absent" };
    }
  }

  async createSession(
    sessionName: string,
    workflow: TmuxWorkflowSpec,
    context: RuntimeOperationContext,
  ): Promise<void> {
    safeSessionName(sessionName);
    validateWorkflow(workflow);
    const result = await this.#run([
      "new-session",
      "-d",
      "-s",
      sessionName,
      ...workflow.argv,
      ";",
      "set-option",
      "-t",
      sessionName,
      "remain-on-exit",
      "on",
    ], context);
    if (result.code !== 0) throw new Error(`tmux session creation failed: ${boundedText(result.stderr)}`);
  }

  async waitForExit(sessionName: string, context: RuntimeOperationContext): Promise<TmuxExitResult> {
    safeSessionName(sessionName);
    while (true) {
      if (context.signal.aborted) throw new Error("tmux workflow wait was cancelled");
      const result = await this.#run([
        "display-message",
        "-p",
        "-t",
        `${sessionName}:0.0`,
        "#{pane_dead}:#{pane_dead_status}",
      ], context);
      if (result.code !== 0) throw new Error(`tmux pane status failed: ${boundedText(result.stderr)}`);
      const match = /^([01]):([0-9]+)$/.exec(result.stdout.trim());
      if (!match) throw new Error("tmux pane status is not recognized");
      if (match[1] === "1") return { code: Number(match[2]), signal: null };
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async capture(sessionName: string, maxLines: number, context: RuntimeOperationContext): Promise<string> {
    safeSessionName(sessionName);
    if (!Number.isSafeInteger(maxLines) || maxLines < 1 || maxLines > 10_000) {
      throw new Error("tmux capture line bound is invalid");
    }
    const result = await this.#run([
      "capture-pane",
      "-p",
      "-J",
      "-t",
      `${sessionName}:0.0`,
      "-S",
      `-${maxLines}`,
    ], context);
    if (result.code !== 0) throw new Error(`tmux capture failed: ${boundedText(result.stderr)}`);
    return result.stdout;
  }

  async killSession(sessionName: string, context: RuntimeOperationContext): Promise<void> {
    safeSessionName(sessionName);
    const result = await this.#run(["kill-session", "-t", sessionName], context);
    if (result.code !== 0 && !/can't find session/i.test(result.stderr)) {
      throw new Error(`tmux cleanup failed: ${boundedText(result.stderr)}`);
    }
  }

  async sessionExists(sessionName: string, context: RuntimeOperationContext): Promise<boolean> {
    safeSessionName(sessionName);
    const result = await this.#run(["has-session", "-t", sessionName], context);
    return result.code === 0;
  }
}
