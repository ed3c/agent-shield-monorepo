import type { AccessibilityTarget } from "../../../../../packages/contracts/src/product/index.ts";

export const WDA_RECEIPT_SCHEMA = "agent-shield/wda-projection-receipt/v1" as const;

export type WdaState =
  | "UNRESOLVED"
  | "MAC_HOST_CHECKED"
  | "TOOLCHAIN_ADMITTED"
  | "TARGET_LEASED"
  | "BUILDING"
  | "INSTALLING"
  | "STARTING"
  | "READY"
  | "STREAMING"
  | "ACTING"
  | "STOPPING"
  | "RELEASED"
  | "ABSENT_MAC_HOST"
  | "ABSENT_XCODE"
  | "ABSENT_TARGET"
  | "SIGNING_REFUSED"
  | "BUILD_FAILED"
  | "START_FAILED"
  | "AUTH_REFUSED"
  | "STREAM_FAILED"
  | "ACTION_FAILED"
  | "TIMED_OUT"
  | "FAILED_CLEANUP";

export type WdaOutcome = Extract<WdaState,
  | "RELEASED"
  | "ABSENT_MAC_HOST"
  | "ABSENT_XCODE"
  | "ABSENT_TARGET"
  | "SIGNING_REFUSED"
  | "BUILD_FAILED"
  | "START_FAILED"
  | "AUTH_REFUSED"
  | "STREAM_FAILED"
  | "ACTION_FAILED"
  | "TIMED_OUT"
  | "FAILED_CLEANUP">;

// QA-WDA-008. The target class is a field on every receipt, never an inference. A simulator
// run and a physical-device run are different evidence, and the difference has to survive
// into the receipt or a reader will spend one for the other.
export type WdaTargetClass = "ios-simulator" | "ios-device";

// QA-WDA-001. What the host is admitted to be. The port reports what the host actually is,
// and the two are compared -- so a Linux runner arrives as an observation, gets rejected,
// and cannot be waved through by declaring `darwin` here.
export interface WdaHostSubject {
  platform: "darwin";
  osVersion: string;
  xcodeVersion: string;
  xcodeBuild: string;
}

export interface WdaHostProbe {
  platform: string;
  osVersion: string | null;
  xcodeVersion: string | null;
  xcodeBuild: string | null;
}

// QA-WDA-001. WebDriverAgent is admitted by exact identity. `sourceCommit` is a full object
// ID rather than a branch, so "the WDA on main" is not something this contract can name.
export interface WdaToolchainSubject {
  version: string;
  sourceCommit: string;
  artifactSha256: string;
  license: "BSD-3-Clause";
  licenseSha256: string;
  sbomSha256: string;
  noticesSha256: string;
}

// QA-WDA-002. One target, one owner. The UDID identifies the device; the lease identifies
// who may currently speak to it.
export interface WdaTargetLease {
  udid: string;
  targetClass: WdaTargetClass;
  leaseId: string;
  ownerWorkerId: string;
  expiresAtEpochMs: number;
}

// QA-WDA-003. Reading frames and driving the UI are separate scopes, so an operator admitted
// to watch a session cannot escalate into acting on it.
export type WdaScope = "wda.stream" | "wda.act";

export interface WdaCapability {
  actorId: string;
  scopes: WdaScope[];
  // The capability is bound to one lease. A token minted for another session is not a token
  // for this one, which is what makes QA-WDA-003's tunnel control fail closed.
  leaseId: string;
  nonce: string;
  expiresAtEpochMs: number;
}

// QA-WDA-004. The closed set of things an operator may do. There is no XCTest method name,
// no shell, no argv, no URL and no arbitrary endpoint field -- so "pass through a generic
// request" is not a bug to filter for, it is a sentence this type cannot express.
export const WDA_ACTIONS = ["tap", "swipe", "type-text", "press-button"] as const;
export type WdaActionKind = (typeof WDA_ACTIONS)[number];

export const WDA_BUTTONS = ["home", "lock", "volume-up", "volume-down"] as const;
export type WdaButton = (typeof WDA_BUTTONS)[number];

export interface WdaAction {
  kind: WdaActionKind;
  // UX-FND-002. Elements are addressed by the shared platform-neutral accessibility identity,
  // not by a framework selector language this provider would have to interpret.
  target: AccessibilityTarget | null;
  x: number | null;
  y: number | null;
  toX: number | null;
  toY: number | null;
  text: string | null;
  button: WdaButton | null;
}

// QA-WDA-005. Every bound the stream is held to. A policy that omits one is a policy the
// compiler rejects, so an unbounded capture has nowhere to originate.
export interface WdaPolicy {
  screenWidth: number;
  screenHeight: number;
  maxFrameBytes: number;
  maxFramesPerSecond: number;
  maxStreamSeconds: number;
  maxActionsPerMinute: number;
  maxTextLength: number;
  maxDerivedDataMb: number;
  // A frame that contains a secure field must arrive redacted. Turning this off is a policy
  // change with a name, not an oversight in a capture path.
  requireSecureFieldRedaction: boolean;
}

export interface WdaFrame {
  sequence: number;
  bytes: number;
  sha256: string;
  // The host tells us whether the captured screen held a secure field. Redaction is then a
  // fact about the frame rather than a promise about the pipeline.
  secureFieldsPresent: boolean;
  redacted: boolean;
}

export interface WdaStreamResult {
  frames: WdaFrame[];
  durationMs: number;
  framesPerSecond: number;
}

export interface WdaActionResult {
  accepted: number;
  rejected: number;
  durationMs: number;
  detail: string;
}

export interface WdaSessionRequest {
  leaseId: string;
  udid: string;
  targetClass: WdaTargetClass;
  requestedScopes: WdaScope[];
  actions: WdaAction[];
  streamSeconds: number;
}

export interface WdaReceipt {
  schema: typeof WDA_RECEIPT_SCHEMA;
  udid: string;
  // QA-WDA-008. Carried, not derived. A reader never has to ask which kind of target this was.
  targetClass: WdaTargetClass;
  toolchainVersion: string;
  lifecycle: WdaState[];
  outcome: WdaOutcome;
  framesDelivered: number;
  actionsAccepted: number;
  actionsRejected: number;
  leaseReleased: boolean;
  derivedDataCleared: boolean;
  detail: string;
}

// The host-owned surface. Signing, provisioning profiles, device trust and the simulator
// runtime all live behind this port and stay host-owned; nothing here carries a credential.
export interface WdaPort {
  probeHost(): WdaHostProbe;
  probeToolchain(): { installed: boolean; version: string | null };
  acquire(udid: string, workerId: string): WdaTargetLease | null;
  signingApproved(lease: WdaTargetLease): boolean;
  build(lease: WdaTargetLease): boolean;
  install(lease: WdaTargetLease): boolean;
  start(lease: WdaTargetLease): boolean;
  stream(lease: WdaTargetLease, seconds: number): WdaStreamResult | null;
  act(lease: WdaTargetLease, actions: WdaAction[]): WdaActionResult | null;
  release(lease: WdaTargetLease): boolean;
  retainedProcesses(): number;
  retainedPorts(): number;
  retainedDerivedDataMb(): number;
}
