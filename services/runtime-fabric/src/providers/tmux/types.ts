import type { EvidenceState } from "../../../../../packages/contracts/src/index.ts";
import type { RuntimeRequest } from "../../../../../packages/contracts/src/runtime/index.ts";
import type { RuntimeOperationContext } from "../../spi/index.ts";

export const TMUX_SESSION_REQUEST_SCHEMA = "agent-shield/tmux-session-request/v1" as const;
export const TMUX_SESSION_RECEIPT_SCHEMA = "agent-shield/tmux-session-receipt/v1" as const;
export const TMUX_CONTROL_RECEIPT_SCHEMA = "agent-shield/tmux-control-receipt/v1" as const;
export const TMUX_CAPTURE_RECEIPT_SCHEMA = "agent-shield/tmux-capture-receipt/v1" as const;

export type TmuxSessionState =
  | "UNRESOLVED"
  | "HOST_CHECKED"
  | "SESSION_CREATING"
  | "SESSION_READY"
  | "ATTACHED"
  | "DETACHED"
  | "STOPPING"
  | "COLLECTING"
  | "TERMINATED"
  | "ABSENT_TMUX"
  | "FAILED_CREATE"
  | "STREAM_LIMIT"
  | "TIMED_OUT"
  | "CANCELLED"
  | "PROCESS_FAILED"
  | "FAILED_TERMINATE"
  | "FAILED_CLEANUP";

export type TmuxSessionOutcome = Extract<TmuxSessionState,
  | "TERMINATED"
  | "ABSENT_TMUX"
  | "FAILED_CREATE"
  | "STREAM_LIMIT"
  | "TIMED_OUT"
  | "CANCELLED"
  | "PROCESS_FAILED"
  | "FAILED_TERMINATE"
  | "FAILED_CLEANUP">;

export type TmuxControlAction = "attach" | "capture" | "detach" | "stop";
export type TmuxControlOutcome = "ATTACHED" | "DETACHED" | "AUTHORIZED" | "AUTH_REFUSED" | "FAILED_ATTACH";

export interface TmuxUpstreamSubject {
  repository: "https://github.com/tmux/tmux";
  version: "3.7b";
  tag: "3.7b";
  tagObject: "3423e0dcc6ec1069d575cd104ed1c005e3e3943f";
  commit: "e802909de06012a4df6209d55e86487c56223163";
  archiveSha256: "87f2e99e3b685973f2ca002ffd6ed7e51a5744f7009daae5a15670b6d532db96";
  license: "ISC";
  tagSignature: "UNVERIFIED";
  artifactAdmission: "NOT_EXERCISED";
}

export interface TmuxImmutableRef { id: string; sha256: string }
export interface TmuxWorkspaceRef { id: string; sha256: string }

export interface TmuxAuthorizationEnvelope {
  capabilityRef: string;
  audience: "tmux-control";
  expiresAtEpochMs: number;
  actions: TmuxControlAction[];
}

export interface TmuxStreamBounds {
  maxFrameBytes: number;
  maxTotalBytes: number;
  maxFrames: number;
  maxIdleMs: number;
  maxTaskMs: number;
}

export interface TmuxCleanupPolicy {
  sessionRetention: "terminate";
  maxDurationMs: number;
}

export interface TmuxPolicyEnvelopeRef {
  schema: "agent-shield/openshell-policy-envelope/v1";
  sha256: string;
}

export interface TmuxSessionRequest {
  schema: typeof TMUX_SESSION_REQUEST_SCHEMA;
  requestId: string;
  namespace: string;
  runtimeRequest: RuntimeRequest;
  workspace: TmuxWorkspaceRef;
  taskProfile: TmuxImmutableRef;
  taskEnvelope: TmuxImmutableRef;
  authorization: TmuxAuthorizationEnvelope;
  stream: TmuxStreamBounds;
  cleanup: TmuxCleanupPolicy;
  policyEnvelope: TmuxPolicyEnvelopeRef | null;
  upstream: TmuxUpstreamSubject;
  exclusions: string[];
}

export interface TmuxProcessIdentity {
  groupId: string;
  generationToken: string;
}

export interface TmuxSessionIdentity {
  socketName: string;
  sessionName: string;
  paneId: string;
  workspace: TmuxWorkspaceRef;
  process: TmuxProcessIdentity;
}

export interface TmuxNativePlan {
  socketName: string;
  sessionName: string;
  createArgv: string[];
  attachArgv: string[];
  detachArgv: string[];
  captureArgv: string[];
  inspectArgv: string[];
  terminateArgv: string[];
}

export interface TmuxPtyFrame {
  sequence: number;
  dataBase64: string;
  bytes: number;
  sha256: string;
  eof: boolean;
}

export interface TmuxDriverDescriptor {
  upstream: TmuxUpstreamSubject;
  externalState: "PASS" | "NOT_EXERCISED" | "ABSENT";
}

export interface TmuxDriverHostCheck {
  state: "AVAILABLE" | "ABSENT";
  detail: string;
}

export interface TmuxDriverStatus {
  running: boolean;
  exitCode: number | null;
  signal: string | null;
  lastActivityEpochMs: number;
}

export interface TmuxDriverCapture {
  frames: TmuxPtyFrame[];
  status: TmuxDriverStatus;
}

export interface TmuxDriverTermination {
  state: "PASS" | "FAIL" | "IDENTITY_MISMATCH";
  observedGenerationToken: string | null;
  detail: string;
}

export interface TmuxDriverCleanup {
  state: "PASS" | "FAIL";
  durationMs: number;
  processGroupChecked: boolean;
  sessionChecked: boolean;
  residue: string[];
  detail: string;
}

export interface TmuxDriver {
  readonly descriptor: TmuxDriverDescriptor;
  checkHost(): Promise<TmuxDriverHostCheck>;
  create(plan: TmuxNativePlan, request: TmuxSessionRequest): Promise<TmuxSessionIdentity>;
  attach(identity: TmuxSessionIdentity): Promise<{ state: "PASS" | "FAIL"; detail: string }>;
  detach(identity: TmuxSessionIdentity): Promise<{ state: "PASS" | "FAIL"; detail: string }>;
  capture(identity: TmuxSessionIdentity, afterSequence: number, maxFrames: number): Promise<TmuxDriverCapture>;
  status(identity: TmuxSessionIdentity): Promise<TmuxDriverStatus>;
  terminate(identity: TmuxSessionIdentity, expectedGenerationToken: string): Promise<TmuxDriverTermination>;
  cleanup(identity: TmuxSessionIdentity, expectedGenerationToken: string): Promise<TmuxDriverCleanup>;
}

export interface TmuxControlReceipt {
  schema: typeof TMUX_CONTROL_RECEIPT_SCHEMA;
  requestId: string;
  sessionName: string | null;
  action: TmuxControlAction;
  outcome: TmuxControlOutcome;
  state: EvidenceState;
  capabilityRef: string;
  detail: string;
}

export interface TmuxCaptureReceipt {
  schema: typeof TMUX_CAPTURE_RECEIPT_SCHEMA;
  requestId: string;
  sessionName: string;
  state: EvidenceState;
  frames: TmuxPtyFrame[];
  firstSequence: number | null;
  lastSequence: number | null;
  frameCount: number;
  totalBytes: number;
  truncated: boolean;
  taskRunning: boolean;
  detail: string;
}

export interface TmuxCleanupReceipt {
  state: "PASS" | "FAIL" | "NOT_EXERCISED";
  durationMs: number;
  processGroupChecked: boolean;
  sessionChecked: boolean;
  residue: string[];
  detail: string;
}

export interface TmuxSessionReceipt {
  schema: typeof TMUX_SESSION_RECEIPT_SCHEMA;
  requestId: string;
  requestDigest: string;
  upstream: TmuxUpstreamSubject;
  externalTmuxState: "PASS" | "NOT_EXERCISED" | "ABSENT";
  lifecycle: TmuxSessionState[];
  outcome: TmuxSessionOutcome;
  state: EvidenceState;
  session: TmuxSessionIdentity | null;
  nativePlanDigest: string | null;
  attachCount: number;
  detachCount: number;
  authRefusalCount: number;
  capturedFrames: number;
  capturedBytes: number;
  lastSequence: number;
  streamTruncated: boolean;
  exit: { code: number | null; signal: string | null };
  cleanup: TmuxCleanupReceipt;
  exclusions: string[];
  detail: string;
}

// Fixed-workflow Runtime v2 provider types. These coexist with the older session/control
// envelope types above and do not widen the provider into caller-selected shell execution.
export interface TmuxWorkflowSpec {
  id: string;
  argv: readonly string[];
  allowedExitCodes: readonly number[];
  maxCaptureLines: number;
}

export interface TmuxProviderInput {
  workflowId: string;
  captureLines: number;
}

export interface TmuxMaterializationHandle {
  sessionName: string;
  workflowId: string;
  captureLines: number;
}

export interface TmuxProbeResult {
  state: "AVAILABLE" | "ABSENT" | "REFUSED_POLICY";
  version: string | null;
  detail: string;
}

export interface TmuxExitResult {
  code: number;
  signal: string | null;
}

export interface TmuxTransport {
  probe(context: RuntimeOperationContext): Promise<TmuxProbeResult>;
  createSession(sessionName: string, workflow: TmuxWorkflowSpec, context: RuntimeOperationContext): Promise<void>;
  waitForExit(sessionName: string, context: RuntimeOperationContext): Promise<TmuxExitResult>;
  capture(sessionName: string, maxLines: number, context: RuntimeOperationContext): Promise<string>;
  killSession(sessionName: string, context: RuntimeOperationContext): Promise<void>;
  sessionExists(sessionName: string, context: RuntimeOperationContext): Promise<boolean>;
}
