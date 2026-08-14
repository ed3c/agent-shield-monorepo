export const WORKFLOW_RECEIPT_SCHEMA = "agent-shield/workflow-receipt/v1" as const;

export type WorkflowState =
  | "CREATED"
  | "POLICY_PENDING"
  | "ROUTED"
  | "SESSION_PENDING"
  | "CHALLENGE_PENDING"
  | "HARDWARE_PENDING"
  | "SIGNING_PENDING"
  | "LEDGER_PENDING"
  | "SUBMISSION_PENDING"
  | "CONFIRMATION_PENDING"
  | "COMPLETED"
  | "DENIED"
  | "CANCELLED"
  | "EXPIRED"
  | "TIMED_OUT"
  | "WAITING_FOR_HUMAN"
  | "WAITING_FOR_HARDWARE"
  | "ACTIVITY_FAILED"
  | "COMPENSATING"
  | "COMPENSATION_FAILED"
  | "FAILED";

export type WorkflowOutcome = Extract<WorkflowState,
  | "COMPLETED"
  | "DENIED"
  | "CANCELLED"
  | "EXPIRED"
  | "TIMED_OUT"
  | "ACTIVITY_FAILED"
  | "COMPENSATION_FAILED"
  | "FAILED">;

// The activities this workflow may ask for. Every one goes through a typed port; none of them
// takes or returns a secret value, and there is no "call arbitrary provider" member.
export type ActivityKind =
  | "evaluate-policy"
  | "issue-challenge"
  | "await-hardware"
  | "authorize-session"
  | "sign"
  | "append-ledger"
  | "submit"
  | "await-confirmation"
  | "compensate";

export type RiskTier = "low" | "high";

// SEC-WF-006. The epochs that must still agree when signing and submission happen, not only
// when the workflow started.
export interface EvidenceEpochs {
  policyEpoch: number;
  challengeEpoch: number;
  deviceEpoch: number;
}

// The history is the only input to the decision function. Time is a recorded field on an
// event, never a reading the workflow takes -- SEC-WF-001 is therefore a property of the
// signature rather than a rule about what not to call.
export type WorkflowEvent =
  | { kind: "started"; atEpochMs: number; workflowId: string; intentId: string; deadlineEpochMs: number; epochs: EvidenceEpochs }
  | { kind: "activity-completed"; atEpochMs: number; activity: ActivityKind; sequence: number; tier?: RiskTier; epochs?: EvidenceEpochs }
  | { kind: "activity-failed"; atEpochMs: number; activity: ActivityKind; sequence: number; detail: string }
  | { kind: "policy-denied"; atEpochMs: number; reason: string }
  | { kind: "human-approved"; atEpochMs: number; approverId: string }
  | { kind: "hardware-attested"; atEpochMs: number; deviceEpoch: number }
  | { kind: "cancellation-requested"; atEpochMs: number; requestedBy: string }
  | { kind: "epochs-observed"; atEpochMs: number; epochs: EvidenceEpochs }
  | { kind: "timer-fired"; atEpochMs: number };

export type WorkflowCommand =
  | { kind: "run-activity"; activity: ActivityKind; sequence: number; idempotencyKey: string }
  | { kind: "wait"; state: Extract<WorkflowState, "WAITING_FOR_HUMAN" | "WAITING_FOR_HARDWARE"> }
  | { kind: "settle"; state: WorkflowOutcome; detail: string };

export interface WorkflowReceipt {
  schema: typeof WORKFLOW_RECEIPT_SCHEMA;
  workflowId: string;
  intentId: string;
  state: WorkflowState;
  outcome: WorkflowOutcome | null;
  completedActivities: ActivityKind[];
  compensated: boolean;
  historyLength: number;
  detail: string;
}

export interface WorkflowSdkSubject {
  id: string;
  version: string;
  artifactSha256: string;
  sourceCommit: string;
  license: "MIT";
  licenseSha256: string;
  sbomSha256: string;
  namespace: string;
}

// SEC-WF-005. The activity port is the only way out of the workflow. It carries activity
// kinds and idempotency keys -- no secret, no provider path, no free-form call.
export interface ActivityPort {
  run(activity: ActivityKind, idempotencyKey: string): { ok: boolean; tier?: RiskTier; epochs?: EvidenceEpochs; detail: string };
  currentEpochs(): EvidenceEpochs;
  activeWorkers(): number;
  shutdown(): boolean;
}
