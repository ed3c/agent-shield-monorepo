export type CapabilityState =
  | "UNKNOWN"
  | "UNSUPPORTED"
  | "NOT_EXERCISED"
  | "SUPPORTED";

export interface InceptionRuntimeContract {
  schemaVersion: "runtime-env/inception-runtime-capability/v1";
  runtimeSubject: {
    repository: "ed3c/runtime-env";
    commit: string;
    tree: string;
  };
  workload: {
    name: "inception-agent-probe";
    imageDigest: string;
    argv: readonly string[];
    timeoutSeconds: number;
    resources: {
      cpuMillis: number;
      memoryMb: number;
      pids: number;
      outputBytes: number;
    };
  };
  policy: {
    policyDigest: string;
    network: "NONE" | "ALLOWLIST_ONLY";
    privileged: false;
    hostMounts: readonly [];
    runAsRoot: false;
  };
  environmentNames: readonly string[];
  workspaceLease: {
    leaseId: string;
    workspaceName: string;
    expiresAt: string;
  };
  capabilities: {
    streamingVisibility: CapabilityState;
    safeTransactionBoundary: CapabilityState;
    cancellation: CapabilityState;
    resume: CapabilityState;
    assistantPrefill: CapabilityState;
    tokenizerIdentity: CapabilityState;
    contextLimit: CapabilityState;
    toolCallTransactions: CapabilityState;
    hiddenReasoningAccess: "ABSENT";
  };
  cleanup: {
    descendantsTerminated: true;
    workspaceRemoved: true;
    residueInventoryRequired: true;
  };
}

export type SteeringAction =
  | "CHECKPOINT"
  | "TOOL_REQUEST"
  | "CANCEL"
  | "NO_ACTION"
  | "HUMAN_ESCALATE";

export interface SteeringRequest {
  action: SteeringAction;
  safeSyncPointObserved: boolean;
  activeToolTransaction: boolean;
  leaseId: string;
}

export interface CleanupReadback {
  pathResidue: number;
  processResidue: number;
  portResidue: number;
  indexResidue: number;
  containerResidue: number;
  mountResidue: number;
  artifactResidue: number;
}
