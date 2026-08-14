export const MAESTRO_RECEIPT_SCHEMA = "agent-shield/maestro-run-receipt/v1" as const;

export type MaestroState =
  | "UNRESOLVED"
  | "TOOL_ADMITTED"
  | "TARGET_LEASED"
  | "FLOW_VERIFIED"
  | "INSTALLING"
  | "RUNNING"
  | "COLLECTING"
  | "RELEASING"
  | "COMPLETED"
  | "ABSENT_TOOL"
  | "ABSENT_TARGET"
  | "LEASE_REFUSED"
  | "INVALID_FLOW"
  | "INSTALL_FAILED"
  | "TEST_FAILED"
  | "TIMED_OUT"
  | "ARTIFACT_FAILED"
  | "FAILED_CLEANUP";

export type MaestroOutcome = Extract<MaestroState,
  | "COMPLETED"
  | "ABSENT_TOOL"
  | "ABSENT_TARGET"
  | "LEASE_REFUSED"
  | "INVALID_FLOW"
  | "INSTALL_FAILED"
  | "TEST_FAILED"
  | "TIMED_OUT"
  | "ARTIFACT_FAILED"
  | "FAILED_CLEANUP">;

// QA-MAESTRO-002.
export interface MaestroToolSubject {
  id: string;
  version: string;
  artifactSha256: string;
  sourceCommit: string;
  license: "Apache-2.0";
  licenseSha256: string;
  sbomSha256: string;
  noticesSha256: string;
}

// QA-MAESTRO-003. A flow is admitted by digest, never by path. There is no `path` field, so
// a traversal, a host absolute path or a remote URL cannot be expressed as a flow reference.
export interface FlowBundle {
  bundleId: string;
  bundleSha256: string;
  flowIds: string[];
  // The accessibility identities the bundle's flows assert against. A flow that asserts
  // nothing has an empty list, and QA-MAESTRO-005 turns on exactly that.
  assertedTargetIds: Record<string, string[]>;
}

export interface TargetLease {
  targetId: string;
  platform: "ios-simulator" | "android-emulator";
  leaseId: string;
  ownerWorkerId: string;
  expiresAtEpochMs: number;
}

export interface AppArtifact {
  appId: string;
  buildSha256: string;
  platform: TargetLease["platform"];
}

// QA-MAESTRO-001. The exposed tool surface is generated from policy, and a tool takes a flow
// ID from an admitted bundle -- not a path, not a command.
export interface MaestroPolicy {
  exposedFlowIds: string[];
  maxDurationMs: number;
  maxArtifactBytes: number;
  maxArtifacts: number;
  requireAssertions: boolean;
}

export interface MaestroRequest {
  flowId: string;
  bundleId: string;
  bundleSha256: string;
  appId: string;
  leaseId: string;
}

export interface MaestroArtifact {
  kind: "junit-report" | "screenshot" | "video";
  sha256: string;
  bytes: number;
}

export interface MaestroRunResult {
  passedAssertions: number;
  failedAssertions: number;
  durationMs: number;
  artifacts: MaestroArtifact[];
  detail: string;
}

export interface MaestroReceipt {
  schema: typeof MAESTRO_RECEIPT_SCHEMA;
  flowId: string;
  bundleSha256: string;
  targetId: string;
  appBuildSha256: string;
  lifecycle: MaestroState[];
  outcome: MaestroOutcome;
  passedAssertions: number;
  failedAssertions: number;
  artifacts: MaestroArtifact[];
  leaseReleased: boolean;
  detail: string;
}

export interface MaestroPort {
  probe(): { available: boolean; version: string | null };
  acquire(targetId: string, workerId: string): TargetLease | null;
  install(lease: TargetLease, app: AppArtifact): boolean;
  run(lease: TargetLease, bundle: FlowBundle, flowId: string): MaestroRunResult | null;
  release(lease: TargetLease): boolean;
  retainedProcesses(): number;
}
