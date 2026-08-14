import type { ProductActorKind } from "../../../packages/contracts/src/product/index.ts";

export const TERMINAL_ATTACH_SCHEMA = "agent-shield/terminal-attach/v1" as const;
export const TERMINAL_PROJECTION_SCHEMA = "agent-shield/terminal-projection/v1" as const;

export type TerminalState =
  | "UNBOUND"
  | "SUBJECT_RESOLVED"
  | "AUTHENTICATED"
  | "CONNECTING"
  | "ATTACHED"
  | "DISCONNECTED"
  | "DRAINING"
  | "CLOSED"
  | "ABSENT_SESSION"
  | "STALE_SUBJECT"
  | "AUTH_REFUSED"
  | "CONNECT_FAILED"
  | "RATE_LIMITED"
  | "STREAM_LIMIT"
  | "TASK_FAILED"
  | "SESSION_TERMINATED"
  | "CLEANUP_FAILED";

export type TerminalOutcome = Extract<TerminalState,
  | "CLOSED"
  | "DISCONNECTED"
  | "ABSENT_SESSION"
  | "STALE_SUBJECT"
  | "AUTH_REFUSED"
  | "CONNECT_FAILED"
  | "RATE_LIMITED"
  | "STREAM_LIMIT"
  | "TASK_FAILED"
  | "SESSION_TERMINATED"
  | "CLEANUP_FAILED">;

// UX-TERM-001. A session is named by an immutable four-part identity. There is no "attach by
// name" field anywhere in this contract, because a name is what lets a caller land on a
// different, newer session and be told nothing.
export interface TerminalSessionSubject {
  taskId: string;
  sessionId: string;
  commit: string;
  workspaceIdentity: string;
}

// UX-TERM-002. Reading and controlling are separate capabilities, so a read-only operator
// cannot escalate by sending a control frame.
export type TerminalScope = "terminal.read" | "terminal.control";

export interface TerminalOperator {
  actorKind: ProductActorKind;
  actorId: string;
  scopes: TerminalScope[];
}

// UX-TERM-003. The only things a caller may send. There is no command, argv, cwd, environment,
// signal or private-flag field, so a generic shell cannot be expressed in this type at all.
export const TERMINAL_CONTROL_ACTIONS = ["resize", "scroll", "detach", "request-stop"] as const;
export type TerminalControlAction = (typeof TERMINAL_CONTROL_ACTIONS)[number];

export interface TerminalControlFrame {
  action: TerminalControlAction;
  columns: number | null;
  rows: number | null;
  scrollbackLines: number | null;
}

export interface TerminalAttachRequest {
  schema: typeof TERMINAL_ATTACH_SCHEMA;
  subject: TerminalSessionSubject;
  operator: TerminalOperator;
  requestedScopes: TerminalScope[];
}

// UX-TERM-004. Truncation is a field, not a silent behaviour: a projection that dropped bytes
// must say so.
export interface TerminalOutputFrame {
  sequence: number;
  emittedAtEpochMs: number;
  bytes: number;
  truncatedBytes: number;
  sha256: string;
}

export interface TerminalBounds {
  maxFrameBytes: number;
  maxTotalBytes: number;
  maxFrames: number;
  maxFramesPerSecond: number;
  maxSessionMs: number;
  maxScrollbackLines: number;
}

export const DEFAULT_TERMINAL_BOUNDS: TerminalBounds = {
  maxFrameBytes: 65_536,
  maxTotalBytes: 4_194_304,
  maxFrames: 4_096,
  maxFramesPerSecond: 60,
  maxSessionMs: 3_600_000,
  maxScrollbackLines: 10_000,
};

export type TerminalTaskState = "RUNNING" | "COMPLETED" | "FAILED" | "TERMINATED";

export interface TerminalProjection {
  schema: typeof TERMINAL_PROJECTION_SCHEMA;
  subject: TerminalSessionSubject;
  lifecycle: TerminalState[];
  outcome: TerminalOutcome;
  taskState: TerminalTaskState;
  attached: boolean;
  frames: number;
  bytes: number;
  truncatedBytes: number;
  grantedScopes: TerminalScope[];
  detail: string;
}
