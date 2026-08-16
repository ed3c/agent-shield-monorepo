import type { ProductConvergenceOutcome, ProductConvergenceState } from "./types.ts";

const OUTCOMES = new Set<ProductConvergenceState>([
  "HUMAN_REVIEW", "ADMITTED", "CHILD_ABSENT", "SUBJECT_MISMATCH", "ACTION_CONFLICT",
  "PLATFORM_ABSENT", "AUTH_FAIL", "ACCESSIBILITY_FAIL", "AUTOMATION_FAIL",
  "PROJECTION_FAIL", "CLEANUP_FAIL", "RELEASE_DRIFT", "HUMAN_REJECTED",
]);

const TRANSITIONS: Readonly<Record<ProductConvergenceState, readonly ProductConvergenceState[]>> = {
  CHILDREN_PENDING: ["SUBJECTS_PINNED", "CHILD_ABSENT", "SUBJECT_MISMATCH"],
  SUBJECTS_PINNED: ["ACTION_REGISTRY_RESOLVED", "ACTION_CONFLICT", "SUBJECT_MISMATCH"],
  ACTION_REGISTRY_RESOLVED: ["PLATFORM_MATRIX_RUNNING", "PLATFORM_ABSENT"],
  PLATFORM_MATRIX_RUNNING: ["AUTOMATION_MATRIX_RUNNING", "PLATFORM_ABSENT"],
  AUTOMATION_MATRIX_RUNNING: [
    "SECURITY_STATE_CONTROLS_RUNNING",
    "AUTH_FAIL",
    "AUTOMATION_FAIL",
    "PROJECTION_FAIL",
  ],
  SECURITY_STATE_CONTROLS_RUNNING: [
    "CLEANUP_CHECKED",
    "AUTH_FAIL",
    "ACCESSIBILITY_FAIL",
    "AUTOMATION_FAIL",
    "PROJECTION_FAIL",
    "CLEANUP_FAIL",
  ],
  CLEANUP_CHECKED: ["RELEASE_RENDERED"],
  RELEASE_RENDERED: ["HUMAN_REVIEW", "RELEASE_DRIFT"],
  HUMAN_REVIEW: ["ADMITTED", "HUMAN_REJECTED"],
  ADMITTED: [],
  CHILD_ABSENT: [],
  SUBJECT_MISMATCH: [],
  ACTION_CONFLICT: [],
  PLATFORM_ABSENT: [],
  AUTH_FAIL: [],
  ACCESSIBILITY_FAIL: [],
  AUTOMATION_FAIL: [],
  PROJECTION_FAIL: [],
  CLEANUP_FAIL: [],
  RELEASE_DRIFT: [],
  HUMAN_REJECTED: [],
};

const RESUMABLE = new Set<ProductConvergenceState>(["HUMAN_REVIEW"]);

for (const [state, next] of Object.entries(TRANSITIONS) as [ProductConvergenceState, readonly ProductConvergenceState[]][]) {
  const outcome = OUTCOMES.has(state);
  const resumable = RESUMABLE.has(state);
  if (outcome && next.length > 0 && !resumable) {
    throw new Error(`invalid product convergence contract: terminal outcome ${state} declares successors`);
  }
  if (resumable && !(outcome && next.length > 0)) {
    throw new Error(`invalid product convergence contract: resumable state ${state} cannot resume`);
  }
}

{
  const seen = new Set<ProductConvergenceState>(["CHILDREN_PENDING"]);
  const queue: ProductConvergenceState[] = ["CHILDREN_PENDING"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as ProductConvergenceState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as ProductConvergenceState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid product convergence contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isProductConvergenceOutcome(value: ProductConvergenceState): value is ProductConvergenceOutcome {
  return OUTCOMES.has(value);
}

export function assertProductConvergenceTransition(from: ProductConvergenceState, to: ProductConvergenceState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid product convergence contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateProductConvergenceLifecycle(
  trace: readonly ProductConvergenceState[],
): ProductConvergenceOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid product convergence contract: lifecycle must contain between 2 and 32 states");
  }
  if (trace[0] !== "CHILDREN_PENDING") {
    throw new Error("invalid product convergence contract: lifecycle must start at CHILDREN_PENDING");
  }
  for (let index = 1; index < trace.length; index += 1) {
    assertProductConvergenceTransition(
      trace[index - 1] as ProductConvergenceState,
      trace[index] as ProductConvergenceState,
    );
  }
  const terminal = trace[trace.length - 1] as ProductConvergenceState;
  if (!isProductConvergenceOutcome(terminal)) {
    throw new Error("invalid product convergence contract: lifecycle did not reach an outcome");
  }
  return terminal;
}
