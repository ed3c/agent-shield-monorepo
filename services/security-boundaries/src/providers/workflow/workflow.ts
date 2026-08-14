import type {
  ActivityKind,
  EvidenceEpochs,
  RiskTier,
  WorkflowCommand,
  WorkflowEvent,
  WorkflowState,
} from "./types.ts";

export function fail(message: string): never {
  throw new Error(`invalid workflow contract: ${message}`);
}

export interface WorkflowProjection {
  state: WorkflowState;
  tier: RiskTier | null;
  completed: ActivityKind[];
  startEpochs: EvidenceEpochs | null;
  observedEpochs: EvidenceEpochs | null;
  deadlineEpochMs: number;
  lastAtEpochMs: number;
  cancelled: boolean;
  humanApproved: boolean;
  hardwareAttested: boolean;
  detail: string;
}

function sameEpochs(left: EvidenceEpochs, right: EvidenceEpochs): boolean {
  return left.policyEpoch === right.policyEpoch
    && left.challengeEpoch === right.challengeEpoch
    && left.deviceEpoch === right.deviceEpoch;
}

// SEC-WF-001. A pure fold over the history. There is no clock, no random source and no
// network handle in scope, so a replay of the same history always produces the same
// projection -- determinism is structural, not a rule about which calls to avoid.
export function project(history: readonly WorkflowEvent[]): WorkflowProjection {
  if (history.length === 0 || history[0].kind !== "started") fail("a workflow history must begin with a started event");
  const started = history[0];

  const projection: WorkflowProjection = {
    state: "CREATED",
    tier: null,
    completed: [],
    startEpochs: started.epochs,
    observedEpochs: null,
    deadlineEpochMs: started.deadlineEpochMs,
    lastAtEpochMs: started.atEpochMs,
    cancelled: false,
    humanApproved: false,
    hardwareAttested: false,
    detail: "workflow created",
  };

  for (const [index, event] of history.entries()) {
    if (index > 0 && event.atEpochMs < history[index - 1].atEpochMs) fail(`history event ${index} moves backwards in time`);
    projection.lastAtEpochMs = event.atEpochMs;

    switch (event.kind) {
      case "started":
        projection.state = "POLICY_PENDING";
        break;
      case "policy-denied":
        projection.state = "DENIED";
        projection.detail = `policy denied: ${event.reason}`;
        break;
      case "cancellation-requested":
        projection.cancelled = true;
        break;
      case "human-approved":
        projection.humanApproved = true;
        break;
      case "hardware-attested":
        projection.hardwareAttested = true;
        break;
      case "epochs-observed":
        projection.observedEpochs = event.epochs;
        break;
      case "timer-fired":
        // A timer is only meaningful against the recorded deadline, never against a clock.
        if (event.atEpochMs >= projection.deadlineEpochMs) projection.state = "TIMED_OUT";
        break;
      case "activity-failed":
        projection.state = "ACTIVITY_FAILED";
        projection.detail = `${event.activity} failed: ${event.detail}`;
        break;
      default: {
        // SEC-WF-002. A repeated completion for an activity already recorded changes nothing,
        // so a retried delivery cannot duplicate a challenge, a signature, a ledger write or a
        // submission.
        if (projection.completed.includes(event.activity)) break;
        projection.completed.push(event.activity);
        if (event.tier !== undefined) projection.tier = event.tier;
        if (event.epochs !== undefined) projection.observedEpochs = event.epochs;
        break;
      }
    }
  }

  return projection;
}

const LOW_ROUTE: readonly ActivityKind[] = ["evaluate-policy", "authorize-session", "sign", "append-ledger", "submit", "await-confirmation"];
const HIGH_ROUTE: readonly ActivityKind[] = ["evaluate-policy", "issue-challenge", "await-hardware", "sign", "append-ledger", "submit", "await-confirmation"];

const STATE_FOR_NEXT: Readonly<Record<ActivityKind, WorkflowState>> = {
  "evaluate-policy": "POLICY_PENDING",
  "issue-challenge": "CHALLENGE_PENDING",
  "await-hardware": "HARDWARE_PENDING",
  "authorize-session": "SESSION_PENDING",
  sign: "SIGNING_PENDING",
  "append-ledger": "LEDGER_PENDING",
  submit: "SUBMISSION_PENDING",
  "await-confirmation": "CONFIRMATION_PENDING",
  compensate: "COMPENSATING",
};

// SEC-WF-006. The epochs recorded at start must still hold when signing or submission is about
// to run. A revocation observed during a wait therefore stops the workflow before it signs,
// rather than after.
const EPOCH_GATED: ReadonlySet<ActivityKind> = new Set(["sign", "submit"]);

export function decide(history: readonly WorkflowEvent[]): WorkflowCommand {
  const projection = project(history);
  const workflowId = (history[0] as Extract<WorkflowEvent, { kind: "started" }>).workflowId;

  // SEC-WF-004. Cancellation wins over any pending work, and compensation runs before the
  // workflow settles so no activity is left orphaned.
  if (projection.cancelled) {
    return projection.completed.includes("compensate")
      ? { kind: "settle", state: "CANCELLED", detail: "cancelled and compensated" }
      : { kind: "run-activity", activity: "compensate", sequence: projection.completed.length, idempotencyKey: `${workflowId}:compensate` };
  }
  if (projection.state === "DENIED") return { kind: "settle", state: "DENIED", detail: projection.detail };
  if (projection.state === "TIMED_OUT") {
    return projection.completed.includes("compensate")
      ? { kind: "settle", state: "TIMED_OUT", detail: "deadline exceeded and compensated" }
      : { kind: "run-activity", activity: "compensate", sequence: projection.completed.length, idempotencyKey: `${workflowId}:compensate` };
  }
  if (projection.state === "ACTIVITY_FAILED") {
    return projection.completed.includes("compensate")
      ? { kind: "settle", state: "ACTIVITY_FAILED", detail: projection.detail }
      : { kind: "run-activity", activity: "compensate", sequence: projection.completed.length, idempotencyKey: `${workflowId}:compensate` };
  }

  const route = projection.tier === "high" ? HIGH_ROUTE : projection.tier === "low" ? LOW_ROUTE : ["evaluate-policy" as ActivityKind];
  const next = route.find((activity) => !projection.completed.includes(activity));
  if (next === undefined) return { kind: "settle", state: "COMPLETED", detail: "workflow completed" };

  // SEC-WF-003. Two independent waits, released by two different recorded events. Hardware
  // evidence arriving is not a human approving, and neither can stand in for the other: a
  // workflow with an attestation but no approval still waits, and vice versa. Waiting is a
  // command, so a restart resumes the wait rather than finding a half-finished success.
  if (next === "await-hardware" && !projection.hardwareAttested) {
    return { kind: "wait", state: "WAITING_FOR_HARDWARE" };
  }
  if (next === "sign" && projection.tier === "high" && !projection.humanApproved) {
    return { kind: "wait", state: "WAITING_FOR_HUMAN" };
  }

  if (EPOCH_GATED.has(next) && projection.startEpochs !== null && projection.observedEpochs !== null) {
    if (!sameEpochs(projection.startEpochs, projection.observedEpochs)) {
      return { kind: "settle", state: "FAILED", detail: "evidence epoch drifted before signing or submission" };
    }
  }

  return { kind: "run-activity", activity: next, sequence: projection.completed.length, idempotencyKey: `${workflowId}:${next}` };
}

// A replay is the same fold over the same history, so this is the whole of SEC-WF-001.
export function replay(history: readonly WorkflowEvent[]): WorkflowCommand[] {
  const commands: WorkflowCommand[] = [];
  for (let length = 1; length <= history.length; length += 1) {
    commands.push(decide(history.slice(0, length)));
  }
  return commands;
}
