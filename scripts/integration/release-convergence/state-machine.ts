import type { ReleaseConvergenceOutcome, ReleaseConvergenceState } from "./types.ts";

const OUTCOMES = new Set<ReleaseConvergenceState>([
  "HUMAN_REVIEW", "PROMOTED", "REJECTED", "ROLLED_BACK", "CHILD_ABSENT",
  "SUBJECT_MISMATCH", "LOCK_CONFLICT", "OFFLINE_FAIL", "CLAUDE_FAIL", "CODEX_FAIL",
  "ORIGIN_FAIL", "EQUIVALENCE_FAIL", "CLEANUP_FAIL", "ROLLBACK_FAIL",
  "ATTESTATION_REQUIRED_ABSENT", "HUMAN_REJECTED",
]);

const TRANSITIONS: Readonly<Record<ReleaseConvergenceState, readonly ReleaseConvergenceState[]>> = {
  CHILDREN_PENDING: ["SUBJECTS_PINNED", "CHILD_ABSENT", "SUBJECT_MISMATCH"],
  SUBJECTS_PINNED: ["COMPOSITION_RESOLVED", "LOCK_CONFLICT", "SUBJECT_MISMATCH"],
  COMPOSITION_RESOLVED: ["OFFLINE_VERIFIED", "OFFLINE_FAIL"],
  OFFLINE_VERIFIED: ["CLAUDE_VERIFIED", "CLAUDE_FAIL"],
  CLAUDE_VERIFIED: ["CODEX_VERIFIED", "CODEX_FAIL"],
  CODEX_VERIFIED: ["ORIGINS_VERIFIED", "ORIGIN_FAIL"],
  ORIGINS_VERIFIED: ["EQUIVALENCE_VERIFIED", "EQUIVALENCE_FAIL"],
  EQUIVALENCE_VERIFIED: [
    "REMOVAL_ROLLBACK_CONTROLS_VERIFIED",
    "CLEANUP_FAIL",
    "ROLLBACK_FAIL",
    "LOCK_CONFLICT",
  ],
  REMOVAL_ROLLBACK_CONTROLS_VERIFIED: ["RELEASE_RECEIPT_RENDERED", "LOCK_CONFLICT"],
  RELEASE_RECEIPT_RENDERED: ["HUMAN_REVIEW"],
  HUMAN_REVIEW: [
    "PROMOTED",
    "REJECTED",
    "ROLLED_BACK",
    "ROLLBACK_FAIL",
    "ATTESTATION_REQUIRED_ABSENT",
    "HUMAN_REJECTED",
  ],
  PROMOTED: [],
  REJECTED: [],
  ROLLED_BACK: [],
  CHILD_ABSENT: [],
  SUBJECT_MISMATCH: [],
  LOCK_CONFLICT: [],
  OFFLINE_FAIL: [],
  CLAUDE_FAIL: [],
  CODEX_FAIL: [],
  ORIGIN_FAIL: [],
  EQUIVALENCE_FAIL: [],
  CLEANUP_FAIL: [],
  ROLLBACK_FAIL: [],
  ATTESTATION_REQUIRED_ABSENT: [],
  HUMAN_REJECTED: [],
};

const RESUMABLE = new Set<ReleaseConvergenceState>(["HUMAN_REVIEW"]);

for (const [state, next] of Object.entries(TRANSITIONS) as [ReleaseConvergenceState, readonly ReleaseConvergenceState[]][]) {
  const outcome = OUTCOMES.has(state);
  const resumable = RESUMABLE.has(state);
  if (outcome && next.length > 0 && !resumable) {
    throw new Error(`invalid release convergence contract: terminal outcome ${state} declares successors`);
  }
  if (resumable && !(outcome && next.length > 0)) {
    throw new Error(`invalid release convergence contract: resumable state ${state} cannot resume`);
  }
}

{
  const seen = new Set<ReleaseConvergenceState>(["CHILDREN_PENDING"]);
  const queue: ReleaseConvergenceState[] = ["CHILDREN_PENDING"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as ReleaseConvergenceState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as ReleaseConvergenceState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid release convergence contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isReleaseConvergenceOutcome(value: ReleaseConvergenceState): value is ReleaseConvergenceOutcome {
  return OUTCOMES.has(value);
}

export function assertReleaseConvergenceTransition(from: ReleaseConvergenceState, to: ReleaseConvergenceState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid release convergence contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateReleaseConvergenceLifecycle(
  trace: readonly ReleaseConvergenceState[],
): ReleaseConvergenceOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid release convergence contract: lifecycle must contain between 2 and 32 states");
  }
  if (trace[0] !== "CHILDREN_PENDING") {
    throw new Error("invalid release convergence contract: lifecycle must start at CHILDREN_PENDING");
  }
  for (let index = 1; index < trace.length; index += 1) {
    assertReleaseConvergenceTransition(
      trace[index - 1] as ReleaseConvergenceState,
      trace[index] as ReleaseConvergenceState,
    );
  }
  const terminal = trace[trace.length - 1] as ReleaseConvergenceState;
  if (!isReleaseConvergenceOutcome(terminal)) {
    throw new Error("invalid release convergence contract: lifecycle did not reach an outcome");
  }
  return terminal;
}
