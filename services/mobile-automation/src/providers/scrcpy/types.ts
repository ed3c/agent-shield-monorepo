import type { AccessibilityTarget } from "../../../../../packages/contracts/src/product/index.ts";

export const SCRCPY_RECEIPT_SCHEMA = "agent-shield/scrcpy-projection-receipt/v1" as const;

export type ScrcpyState =
  | "UNRESOLVED"
  | "ADB_HOST_CHECKED"
  | "TOOL_ADMITTED"
  | "TARGET_LEASED"
  | "STARTING"
  | "READY"
  | "STREAMING"
  | "ACTING"
  | "STOPPING"
  | "RELEASED"
  | "ABSENT_ADB"
  | "ABSENT_TARGET"
  | "TOOL_REFUSED"
  | "LEASE_REFUSED"
  | "START_FAILED"
  | "AUTH_REFUSED"
  | "STREAM_FAILED"
  | "ACTION_FAILED"
  | "TIMED_OUT"
  | "FAILED_CLEANUP";

export type ScrcpyOutcome = Extract<ScrcpyState,
  | "RELEASED"
  | "ABSENT_ADB"
  | "ABSENT_TARGET"
  | "TOOL_REFUSED"
  | "LEASE_REFUSED"
  | "START_FAILED"
  | "AUTH_REFUSED"
  | "STREAM_FAILED"
  | "ACTION_FAILED"
  | "TIMED_OUT"
  | "FAILED_CLEANUP">;

// QA-SCRCPY-008. An emulator and a physical handset are different evidence. The class is a
// field on the receipt so a reader never has to infer which one produced it.
export type ScrcpyTargetClass = "android-emulator" | "android-device";

// QA-SCRCPY-001. The ADB platform the host is admitted to run. The port reports what is
// actually installed and the two are compared, so a missing or drifted platform-tools arrives
// as an observation rather than an assumption.
export interface AdbHostSubject {
  platformToolsVersion: string;
  adbProtocolVersion: string;
}

export interface AdbHostProbe {
  present: boolean;
  platformToolsVersion: string | null;
  adbProtocolVersion: string | null;
}

// QA-SCRCPY-001. scrcpy is admitted by exact identity, never by "whatever the installer
// fetched". `sourceCommit` is a full object ID, so a branch name is not expressible.
export interface ScrcpyToolSubject {
  version: string;
  sourceCommit: string;
  binarySha256: string;
  serverSha256: string;
  license: "Apache-2.0";
  licenseSha256: string;
  sbomSha256: string;
  noticesSha256: string;
}

// QA-SCRCPY-002. One serial or AVD name, one owner.
export interface ScrcpyTargetLease {
  serial: string;
  targetClass: ScrcpyTargetClass;
  leaseId: string;
  ownerWorkerId: string;
  expiresAtEpochMs: number;
}

// QA-SCRCPY-003. Watching frames and injecting input are separate capabilities.
export type ScrcpyScope = "scrcpy.stream" | "scrcpy.act";

export interface ScrcpyCapability {
  actorId: string;
  scopes: ScrcpyScope[];
  leaseId: string;
  nonce: string;
  expiresAtEpochMs: number;
}

// QA-SCRCPY-004. The closed set of input events. There is no `adb shell`, no `push`, no
// `pull`, no argv and no file path anywhere in this union -- so "expose a raw ADB command"
// is not a case to filter, it is a sentence the type cannot form.
export const SCRCPY_ACTIONS = ["tap", "swipe", "type-text", "press-key"] as const;
export type ScrcpyActionKind = (typeof SCRCPY_ACTIONS)[number];

// The allowlisted keys. Android exposes hundreds of keycodes; these are the navigation and
// volume keys a projection needs. Anything else -- including the ones that open a shell
// surface or trigger a factory action -- is simply not a member.
export const SCRCPY_KEYS = ["back", "home", "app-switch", "volume-up", "volume-down"] as const;
export type ScrcpyKey = (typeof SCRCPY_KEYS)[number];

export interface ScrcpyAction {
  kind: ScrcpyActionKind;
  // UX-FND-002. The same platform-neutral accessibility identity the iOS and web adapters use.
  target: AccessibilityTarget | null;
  x: number | null;
  y: number | null;
  toX: number | null;
  toY: number | null;
  text: string | null;
  key: ScrcpyKey | null;
}

// QA-SCRCPY-005. Bitrate, resolution and duration are all bounded, and retention is a named
// policy rather than a default that nobody revisits.
export interface ScrcpyPolicy {
  maxWidth: number;
  maxHeight: number;
  maxBitrateKbps: number;
  maxFramesPerSecond: number;
  maxStreamSeconds: number;
  maxActionsPerMinute: number;
  maxTextLength: number;
  // Frames may be projected without ever being written down. Retaining them is an explicit
  // decision with a size bound attached, not an accident of a debug flag.
  retainFrames: boolean;
  maxRetainedBytes: number;
}

export interface ScrcpyStreamStats {
  width: number;
  height: number;
  bitrateKbps: number;
  framesPerSecond: number;
  durationMs: number;
  frameCount: number;
  retainedBytes: number;
}

export interface ScrcpyActionResult {
  accepted: number;
  rejected: number;
  durationMs: number;
  detail: string;
}

export interface ScrcpySessionRequest {
  leaseId: string;
  serial: string;
  targetClass: ScrcpyTargetClass;
  requestedScopes: ScrcpyScope[];
  actions: ScrcpyAction[];
  streamSeconds: number;
}

export interface ScrcpyReceipt {
  schema: typeof SCRCPY_RECEIPT_SCHEMA;
  serial: string;
  targetClass: ScrcpyTargetClass;
  toolVersion: string;
  lifecycle: ScrcpyState[];
  outcome: ScrcpyOutcome;
  framesDelivered: number;
  retainedBytes: number;
  actionsAccepted: number;
  actionsRejected: number;
  leaseReleased: boolean;
  forwardsCleared: boolean;
  detail: string;
}

// The host-owned ADB surface. Device authorisation, USB/TCP transport and the ADB server all
// stay behind this port; nothing here carries a credential or a host path.
export interface ScrcpyPort {
  probeAdb(): AdbHostProbe;
  probeTool(): { installed: boolean; version: string | null; binarySha256: string | null };
  acquire(serial: string, workerId: string): ScrcpyTargetLease | null;
  start(lease: ScrcpyTargetLease): boolean;
  stream(lease: ScrcpyTargetLease, seconds: number): ScrcpyStreamStats | null;
  act(lease: ScrcpyTargetLease, actions: ScrcpyAction[]): ScrcpyActionResult | null;
  release(lease: ScrcpyTargetLease): boolean;
  retainedProcesses(): number;
  // An ADB forward or a leftover unix socket outlives the process that made it, which is
  // exactly why each gets its own question instead of one "is it clean" flag.
  retainedForwards(): number;
  retainedSockets(): number;
  retainedTempBytes(): number;
}
