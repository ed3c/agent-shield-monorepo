import type { EquivalenceOutcome, EquivalenceState } from "./types.ts";

const OUTCOMES = new Set<EquivalenceState>([
  "RECEIPT_EMITTED", "GITHUB_ABSENT", "FORGEJO_ABSENT", "RECEIPT_STALE", "SUBJECT_MISMATCH",
  "NOT_EQUIVALENT", "UNSUPPORTED_LEVEL", "CLOSURE_MISMATCH", "ATTESTATION_ABSENT",
]);

// INT-EQ-001 and INT-EQ-006. Each receipt is verified on its own before either is compared, so
// "one origin was absent" and "the two disagree" can never be confused: the first is reachable
// before COMPARING and the second only after it.
const TRANSITIONS: Readonly<Record<EquivalenceState, readonly EquivalenceState[]>> = {
  UNRESOLVED: ["GITHUB_RECEIPT_VERIFIED", "GITHUB_ABSENT", "RECEIPT_STALE", "UNSUPPORTED_LEVEL"],
  GITHUB_RECEIPT_VERIFIED: ["FORGEJO_RECEIPT_VERIFIED", "FORGEJO_ABSENT", "RECEIPT_STALE"],
  FORGEJO_RECEIPT_VERIFIED: ["LOGICAL_RELEASE_MATCHED", "SUBJECT_MISMATCH"],
  LOGICAL_RELEASE_MATCHED: ["EQUIVALENCE_LEVEL_SELECTED", "UNSUPPORTED_LEVEL", "ATTESTATION_ABSENT", "CLOSURE_MISMATCH"],
  EQUIVALENCE_LEVEL_SELECTED: ["COMPARING"],
  COMPARING: ["EQUIVALENT", "NOT_EQUIVALENT"],
  EQUIVALENT: ["RECEIPT_EMITTED"],
  RECEIPT_EMITTED: [],
  GITHUB_ABSENT: [],
  FORGEJO_ABSENT: [],
  RECEIPT_STALE: [],
  SUBJECT_MISMATCH: [],
  NOT_EQUIVALENT: [],
  UNSUPPORTED_LEVEL: [],
  CLOSURE_MISMATCH: [],
  ATTESTATION_ABSENT: [],
};

for (const [state, next] of Object.entries(TRANSITIONS) as [EquivalenceState, readonly EquivalenceState[]][]) {
  if (OUTCOMES.has(state) && next.length > 0) {
    throw new Error(`invalid equivalence contract: terminal outcome ${state} declares successors`);
  }
}

{
  const seen = new Set<EquivalenceState>(["UNRESOLVED"]);
  const queue: EquivalenceState[] = ["UNRESOLVED"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as EquivalenceState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as EquivalenceState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid equivalence contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isEquivalenceOutcome(value: EquivalenceState): value is EquivalenceOutcome {
  return OUTCOMES.has(value);
}

export function assertEquivalenceTransition(from: EquivalenceState, to: EquivalenceState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid equivalence contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateEquivalenceLifecycle(trace: readonly EquivalenceState[]): EquivalenceOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid equivalence contract: lifecycle must contain between 2 and 32 states");
  }
  if (trace[0] !== "UNRESOLVED") throw new Error("invalid equivalence contract: lifecycle must start at UNRESOLVED");
  for (let index = 1; index < trace.length; index += 1) {
    assertEquivalenceTransition(trace[index - 1] as EquivalenceState, trace[index] as EquivalenceState);
  }
  const terminal = trace[trace.length - 1] as EquivalenceState;
  if (!isEquivalenceOutcome(terminal)) throw new Error("invalid equivalence contract: lifecycle did not reach an outcome");
  return terminal;
}
