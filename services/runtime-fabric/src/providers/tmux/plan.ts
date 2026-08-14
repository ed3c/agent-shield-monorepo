import { createHash } from "node:crypto";
import { validateTmuxSessionRequest } from "./validation.ts";
import type { TmuxNativePlan, TmuxSessionRequest } from "./types.ts";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("non-JSON tmux plan value");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

export function tmuxSessionRequestDigest(value: unknown): string {
  return createHash("sha256").update(canonical(validateTmuxSessionRequest(value))).digest("hex");
}

export function buildTmuxNativePlan(value: unknown): TmuxNativePlan {
  const request: TmuxSessionRequest = validateTmuxSessionRequest(value);
  const digest = tmuxSessionRequestDigest(request);
  const namespace = request.namespace.slice(0, 16);
  const sessionName = `as-${namespace}-${digest.slice(0, 10)}`;
  const socketName = `as-${digest.slice(10, 24)}`;
  const target = sessionName;
  const paneTarget = `${sessionName}:0.0`;
  const createArgv = [
    "tmux", "-L", socketName,
    "new-session", "-d", "-P", "-F", "#{session_id}:#{pane_id}:#{pane_pid}",
    "-s", sessionName, "-c", "/workspace", "--",
    "/app/bin/agent-shield-task-runner",
    "--task-id", request.taskEnvelope.id,
    "--task-digest", request.taskEnvelope.sha256,
    "--profile-id", request.taskProfile.id,
    "--profile-digest", request.taskProfile.sha256,
  ];
  return {
    socketName,
    sessionName,
    createArgv,
    attachArgv: ["tmux", "-L", socketName, "attach-session", "-t", target],
    detachArgv: ["tmux", "-L", socketName, "detach-client", "-s", target],
    captureArgv: ["tmux", "-L", socketName, "capture-pane", "-p", "-J", "-t", paneTarget, "-S", "-2000"],
    inspectArgv: ["tmux", "-L", socketName, "list-panes", "-t", target, "-F", "#{pane_id}:#{pane_pid}:#{pane_dead}:#{pane_dead_status}"],
    terminateArgv: ["tmux", "-L", socketName, "kill-session", "-t", target],
  };
}

export function tmuxNativePlanDigest(plan: TmuxNativePlan): string {
  return createHash("sha256").update(canonical(plan)).digest("hex");
}

export function assertTmuxNativePlanClosed(plan: TmuxNativePlan): void {
  const argvLists = [plan.createArgv, plan.attachArgv, plan.detachArgv, plan.captureArgv, plan.inspectArgv, plan.terminateArgv];
  for (const argv of argvLists) {
    if (argv[0] !== "tmux") throw new Error("tmux native plan does not start with tmux");
    for (const argument of argv) {
      if (/\r|\n|\u0000/.test(argument)) throw new Error("tmux native plan contains a control character");
    }
  }
  const forbidden = new Set(["sh", "bash", "zsh", "fish", "eval", "exec"]);
  for (const argument of plan.createArgv) {
    if (forbidden.has(argument)) throw new Error("tmux native plan exposed a shell");
  }
  if (!plan.createArgv.includes("/app/bin/agent-shield-task-runner")) {
    throw new Error("tmux native plan does not use the fixed task runner");
  }
}
