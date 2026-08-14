import type { ConvergenceOutcome, ConvergenceState } from "./types.ts";

const OUTCOMES = new Set<ConvergenceState>([
  "HUMAN_REVIEW", "ADMITTED", "CHILD_ABSENT", "SUBJECT_MISMATCH", "CAPABILITY_CONFLICT",
  "LOCAL_FAIL", "CLOUD_FAIL", "HYBRID_FAIL", "CLEANUP_FAIL", "RELEASE_DRIFT", "HUMAN_REJECTED",
]);

// A route can fail at the moment its result is read, and only then.
const ROUTE_FAILURES: readonly ConvergenceState[] = ["LOCAL_FAIL", "CLOUD_FAIL", "HYBRID_FAIL"];

// #44 is the sole owner of promotion, and promotion is Human Admit. So HUMAN_REVIEW is a
// resumable outcome rather than a stage: a deterministic run ends there, and only a human moves
// it to ADMITTED or HUMAN_REJECTED. There is no edge that reaches ADMITTED without passing
// through it, which is what makes "the convergence promoted itself" unexpressible.
const TRANSITIONS: Readonly<Record<ConvergenceState, readonly ConvergenceState[]>> = {
  CHILDREN_PENDING: ["SUBJECTS_PINNED", "CHILD_ABSENT", "SUBJECT_MISMATCH"],
  SUBJECTS_PINNED: ["REGISTRY_RESOLVED", "CAPABILITY_CONFLICT"],
  REGISTRY_RESOLVED: ["MATRIX_RUNNING", "CAPABILITY_CONFLICT"],
  MATRIX_RUNNING: ["CONTROLS_RUNNING", ...ROUTE_FAILURES],
  // CLEANUP_FAIL exits from here rather than from CLEANUP_CHECKED. Reaching CLEANUP_CHECKED
  // means the check ran *and passed*; pushing it and then failing would say the cleanup was
  // fine and then was not.
  CONTROLS_RUNNING: ["CLEANUP_CHECKED", "CLEANUP_FAIL", ...ROUTE_FAILURES],
  CLEANUP_CHECKED: ["RELEASE_RENDERED"],
  RELEASE_RENDERED: ["HUMAN_REVIEW", "RELEASE_DRIFT"],
  HUMAN_REVIEW: ["ADMITTED", "HUMAN_REJECTED"],
  ADMITTED: [],
  CHILD_ABSENT: [],
  SUBJECT_MISMATCH: [],
  CAPABILITY_CONFLICT: [],
  LOCAL_FAIL: [],
  CLOUD_FAIL: [],
  HYBRID_FAIL: [],
  CLEANUP_FAIL: [],
  RELEASE_DRIFT: [],
  HUMAN_REJECTED: [],
};

const RESUMABLE = new Set<ConvergenceState>(["HUMAN_REVIEW"]);

for (const [state, next] of Object.entries(TRANSITIONS) as [ConvergenceState, readonly ConvergenceState[]][]) {
  const outcome = OUTCOMES.has(state);
  const resumable = RESUMABLE.has(state);
  if (outcome && next.length > 0 && !resumable) {
    throw new Error(`invalid convergence contract: terminal outcome ${state} declares successors`);
  }
  if (resumable && !(outcome && next.length > 0)) {
    throw new Error(`invalid convergence contract: resumable state ${state} cannot resume`);
  }
}

{
  const seen = new Set<ConvergenceState>(["CHILDREN_PENDING"]);
  const queue: ConvergenceState[] = ["CHILDREN_PENDING"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as ConvergenceState]) {
      if (!seen.has(target)) { seen.add(target); queue.push(target); }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as ConvergenceState[]).filter((s) => !seen.has(s));
  if (unreachable.length > 0) {
    throw new Error(`invalid convergence contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isConvergenceOutcome(value: ConvergenceState): value is ConvergenceOutcome {
  return OUTCOMES.has(value);
}

export function assertConvergenceTransition(from: ConvergenceState, to: ConvergenceState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid convergence contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateConvergenceLifecycle(trace: readonly ConvergenceState[]): ConvergenceOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid convergence contract: lifecycle must contain between 2 and 32 states");
  }
  if (trace[0] !== "CHILDREN_PENDING") {
    throw new Error("invalid convergence contract: lifecycle must start at CHILDREN_PENDING");
  }
  for (let i = 1; i < trace.length; i += 1) {
    assertConvergenceTransition(trace[i - 1] as ConvergenceState, trace[i] as ConvergenceState);
  }
  const terminal = trace[trace.length - 1] as ConvergenceState;
  if (!isConvergenceOutcome(terminal)) {
    throw new Error("invalid convergence contract: lifecycle did not reach an outcome");
  }
  return terminal;
}
