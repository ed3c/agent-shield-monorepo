import type { OriginOutcome, OriginState } from "./types.ts";

const OUTCOMES = new Set<OriginState>([
  "RECEIPT_EMITTED", "ORIGIN_ABSENT", "AUTH_ABSENT", "AUTH_REFUSED", "REF_ABSENT",
  "COMMIT_MISMATCH", "TREE_MISMATCH", "MANIFEST_MISMATCH", "FETCH_FAILED", "FRESH_CLONE_FAILED",
]);

// INT-GH-002. Every verification stage can fail to fetch, because the network is available to
// fail at any of them and collapsing that into one early check would report a mid-run drop as a
// content mismatch.
const FETCHING: readonly OriginState[] = ["FETCH_FAILED"];

// INT-GH-003 and INT-GH-004. A receipt is reachable only after the manifest verified, which is
// reachable only after the tree, which is reachable only after the commit. There is no edge
// from REACHABILITY_CHECKED to RECEIPT_EMITTED, so "the origin answered, therefore the release
// is there" is a path that does not exist.
const TRANSITIONS: Readonly<Record<OriginState, readonly OriginState[]>> = {
  UNRESOLVED: ["ORIGIN_IDENTITY_PINNED", "ORIGIN_ABSENT"],
  ORIGIN_IDENTITY_PINNED: ["REACHABILITY_CHECKED", "ORIGIN_ABSENT", "AUTH_ABSENT", "AUTH_REFUSED"],
  REACHABILITY_CHECKED: ["REF_FETCHED", "REF_ABSENT", ...FETCHING],
  REF_FETCHED: ["COMMIT_VERIFIED", "COMMIT_MISMATCH", ...FETCHING],
  COMMIT_VERIFIED: ["TREE_VERIFIED", "TREE_MISMATCH", ...FETCHING],
  TREE_VERIFIED: ["RELEASE_MANIFEST_VERIFIED", "MANIFEST_MISMATCH", ...FETCHING],
  RELEASE_MANIFEST_VERIFIED: ["FRESH_CLONE_VERIFIED", "FRESH_CLONE_FAILED", ...FETCHING],
  // The clone is verified last and against the same digests, so a clone that disagrees with the
  // API is a mismatch rather than a second opinion nobody compares.
  FRESH_CLONE_VERIFIED: ["RECEIPT_EMITTED", "TREE_MISMATCH", "COMMIT_MISMATCH"],
  RECEIPT_EMITTED: [],
  ORIGIN_ABSENT: [],
  AUTH_ABSENT: [],
  AUTH_REFUSED: [],
  REF_ABSENT: [],
  COMMIT_MISMATCH: [],
  TREE_MISMATCH: [],
  MANIFEST_MISMATCH: [],
  FETCH_FAILED: [],
  FRESH_CLONE_FAILED: [],
};

// A verification run ends; nothing resumes. A retry is a new run against the same immutable
// subject, which is the whole point of pinning one.
for (const [state, next] of Object.entries(TRANSITIONS) as [OriginState, readonly OriginState[]][]) {
  if (OUTCOMES.has(state) && next.length > 0) {
    throw new Error(`invalid origin contract: terminal outcome ${state} declares successors`);
  }
}

{
  const seen = new Set<OriginState>(["UNRESOLVED"]);
  const queue: OriginState[] = ["UNRESOLVED"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as OriginState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as OriginState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid origin contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isOriginOutcome(value: OriginState): value is OriginOutcome {
  return OUTCOMES.has(value);
}

export function assertOriginTransition(from: OriginState, to: OriginState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid origin contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateOriginLifecycle(trace: readonly OriginState[]): OriginOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid origin contract: lifecycle must contain between 2 and 32 states");
  }
  if (trace[0] !== "UNRESOLVED") throw new Error("invalid origin contract: lifecycle must start at UNRESOLVED");
  for (let index = 1; index < trace.length; index += 1) {
    assertOriginTransition(trace[index - 1] as OriginState, trace[index] as OriginState);
  }
  const terminal = trace[trace.length - 1] as OriginState;
  if (!isOriginOutcome(terminal)) throw new Error("invalid origin contract: lifecycle did not reach an outcome");
  return terminal;
}
