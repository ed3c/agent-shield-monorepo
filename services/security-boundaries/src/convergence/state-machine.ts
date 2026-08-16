import type { SecurityConvergenceOutcome, SecurityConvergenceState } from "./types.ts";

const OUTCOMES = new Set<SecurityConvergenceState>([
  "HUMAN_REVIEW", "TESTNET_ADMITTED", "CHILD_ABSENT", "SUBJECT_MISMATCH",
  "CAPABILITY_CONFLICT", "CEREMONY_REFUSED", "POLICY_FAIL", "HARDWARE_FAIL",
  "SIGNING_FAIL", "LEDGER_FAIL", "CONTRACT_FAIL", "TESTNET_FAIL", "RECOVERY_FAIL",
  "CLEANUP_FAIL", "AUDIT_GAP", "HUMAN_REJECTED",
]);

const EXECUTION_FAILURES: readonly SecurityConvergenceState[] = [
  "POLICY_FAIL", "HARDWARE_FAIL", "SIGNING_FAIL", "LEDGER_FAIL", "CONTRACT_FAIL", "TESTNET_FAIL",
];

const TRANSITIONS: Readonly<Record<SecurityConvergenceState, readonly SecurityConvergenceState[]>> = {
  CHILDREN_PENDING: ["SUBJECTS_PINNED", "CHILD_ABSENT", "SUBJECT_MISMATCH"],
  SUBJECTS_PINNED: ["CAPABILITIES_RESOLVED", "CAPABILITY_CONFLICT", "SUBJECT_MISMATCH"],
  CAPABILITIES_RESOLVED: ["CEREMONY_PRECHECK"],
  CEREMONY_PRECHECK: ["E2E_REFERENCE_RUNNING", "CEREMONY_REFUSED", "POLICY_FAIL", "HARDWARE_FAIL"],
  E2E_REFERENCE_RUNNING: ["ADVERSARIAL_SUITE_RUNNING", ...EXECUTION_FAILURES],
  ADVERSARIAL_SUITE_RUNNING: [
    "RECOVERY_SUITE_RUNNING",
    ...EXECUTION_FAILURES,
    "RECOVERY_FAIL",
    "AUDIT_GAP",
  ],
  RECOVERY_SUITE_RUNNING: ["CLEANUP_REVOCATION_CHECKED", "RECOVERY_FAIL", "CLEANUP_FAIL"],
  CLEANUP_REVOCATION_CHECKED: ["RESIDUAL_RISK_REVIEWED", "CLEANUP_FAIL"],
  RESIDUAL_RISK_REVIEWED: ["RELEASE_RENDERED", "AUDIT_GAP"],
  RELEASE_RENDERED: ["HUMAN_REVIEW", "AUDIT_GAP"],
  HUMAN_REVIEW: ["TESTNET_ADMITTED", "HUMAN_REJECTED"],
  TESTNET_ADMITTED: [],
  CHILD_ABSENT: [],
  SUBJECT_MISMATCH: [],
  CAPABILITY_CONFLICT: [],
  CEREMONY_REFUSED: [],
  POLICY_FAIL: [],
  HARDWARE_FAIL: [],
  SIGNING_FAIL: [],
  LEDGER_FAIL: [],
  CONTRACT_FAIL: [],
  TESTNET_FAIL: [],
  RECOVERY_FAIL: [],
  CLEANUP_FAIL: [],
  AUDIT_GAP: [],
  HUMAN_REJECTED: [],
};

const RESUMABLE = new Set<SecurityConvergenceState>(["HUMAN_REVIEW"]);

for (const [state, next] of Object.entries(TRANSITIONS) as [SecurityConvergenceState, readonly SecurityConvergenceState[]][]) {
  const outcome = OUTCOMES.has(state);
  const resumable = RESUMABLE.has(state);
  if (outcome && next.length > 0 && !resumable) {
    throw new Error(`invalid security convergence contract: terminal outcome ${state} declares successors`);
  }
  if (resumable && !(outcome && next.length > 0)) {
    throw new Error(`invalid security convergence contract: resumable state ${state} cannot resume`);
  }
}

{
  const seen = new Set<SecurityConvergenceState>(["CHILDREN_PENDING"]);
  const queue: SecurityConvergenceState[] = ["CHILDREN_PENDING"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as SecurityConvergenceState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as SecurityConvergenceState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid security convergence contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isSecurityConvergenceOutcome(value: SecurityConvergenceState): value is SecurityConvergenceOutcome {
  return OUTCOMES.has(value);
}

export function assertSecurityConvergenceTransition(from: SecurityConvergenceState, to: SecurityConvergenceState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid security convergence contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateSecurityConvergenceLifecycle(
  trace: readonly SecurityConvergenceState[],
): SecurityConvergenceOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid security convergence contract: lifecycle must contain between 2 and 32 states");
  }
  if (trace[0] !== "CHILDREN_PENDING") {
    throw new Error("invalid security convergence contract: lifecycle must start at CHILDREN_PENDING");
  }
  for (let index = 1; index < trace.length; index += 1) {
    assertSecurityConvergenceTransition(
      trace[index - 1] as SecurityConvergenceState,
      trace[index] as SecurityConvergenceState,
    );
  }
  const terminal = trace[trace.length - 1] as SecurityConvergenceState;
  if (!isSecurityConvergenceOutcome(terminal)) {
    throw new Error("invalid security convergence contract: lifecycle did not reach an outcome");
  }
  return terminal;
}
