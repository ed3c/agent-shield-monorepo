import type { ForgejoOutcome, ForgejoState } from "./types.ts";

const OUTCOMES = new Set<ForgejoState>([
  "CLEANED", "ORIGIN_ABSENT", "SERVICE_UNREACHABLE", "AUTH_ABSENT", "AUTH_REFUSED",
  "HELPER_POLICY_REFUSED", "REF_ABSENT", "COMMIT_MISMATCH", "TREE_MISMATCH",
  "MANIFEST_MISMATCH", "FETCH_FAILED", "FAILED_CLEANUP",
]);

// INT-FJ-008. Once anything has authenticated there is a credential stream and possibly a lease
// to account for, so every state from AUTHENTICATED onwards can end in a cleanup failure.
const AFTER_AUTH: readonly ForgejoState[] = ["FAILED_CLEANUP"];
const FETCHING: readonly ForgejoState[] = ["FETCH_FAILED"];

// Unlike the GitHub verifier, CLEANED rather than RECEIPT_EMITTED is the success outcome: #73
// puts cleanup inside the lifecycle because a run that authenticated against a local broker and
// left a credential stream open has not finished, whatever it proved about the release.
const TRANSITIONS: Readonly<Record<ForgejoState, readonly ForgejoState[]>> = {
  UNRESOLVED: ["ORIGIN_IDENTITY_PINNED", "ORIGIN_ABSENT", "SERVICE_UNREACHABLE"],
  // HELPER_POLICY_REFUSED is reachable here as well as from the policy check itself. #73's
  // terminal list has no dedicated binding-failure state, and that is the right reading rather
  // than a gap: the runtime binding is the runtime-env workload that *carries* the helper
  // policy, so an absent, unaddressed or self-owned binding is a policy that cannot be trusted
  // before any policy has been read.
  ORIGIN_IDENTITY_PINNED: ["RUNTIME_BINDING_VERIFIED", "ORIGIN_ABSENT", "SERVICE_UNREACHABLE", "HELPER_POLICY_REFUSED"],
  RUNTIME_BINDING_VERIFIED: ["HELPER_POLICY_CHECKED", "HELPER_POLICY_REFUSED"],
  HELPER_POLICY_CHECKED: ["AUTHENTICATED", "AUTH_ABSENT", "AUTH_REFUSED", "HELPER_POLICY_REFUSED"],
  AUTHENTICATED: ["REF_FETCHED", "REF_ABSENT", ...FETCHING, ...AFTER_AUTH],
  REF_FETCHED: ["COMMIT_VERIFIED", "COMMIT_MISMATCH", ...FETCHING, ...AFTER_AUTH],
  COMMIT_VERIFIED: ["TREE_VERIFIED", "TREE_MISMATCH", ...FETCHING, ...AFTER_AUTH],
  TREE_VERIFIED: ["RELEASE_MANIFEST_VERIFIED", "MANIFEST_MISMATCH", ...FETCHING, ...AFTER_AUTH],
  RELEASE_MANIFEST_VERIFIED: ["RECEIPT_EMITTED", ...AFTER_AUTH],
  RECEIPT_EMITTED: ["CLEANED", ...AFTER_AUTH],
  CLEANED: [],
  ORIGIN_ABSENT: [],
  SERVICE_UNREACHABLE: [],
  AUTH_ABSENT: [],
  AUTH_REFUSED: [],
  HELPER_POLICY_REFUSED: [],
  REF_ABSENT: [],
  COMMIT_MISMATCH: [],
  TREE_MISMATCH: [],
  MANIFEST_MISMATCH: [],
  FETCH_FAILED: [],
  FAILED_CLEANUP: [],
};

for (const [state, next] of Object.entries(TRANSITIONS) as [ForgejoState, readonly ForgejoState[]][]) {
  if (OUTCOMES.has(state) && next.length > 0) {
    throw new Error(`invalid authoring origin contract: terminal outcome ${state} declares successors`);
  }
}

{
  const seen = new Set<ForgejoState>(["UNRESOLVED"]);
  const queue: ForgejoState[] = ["UNRESOLVED"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as ForgejoState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as ForgejoState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid authoring origin contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isForgejoOutcome(value: ForgejoState): value is ForgejoOutcome {
  return OUTCOMES.has(value);
}

export function assertForgejoTransition(from: ForgejoState, to: ForgejoState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid authoring origin contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateForgejoLifecycle(trace: readonly ForgejoState[]): ForgejoOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid authoring origin contract: lifecycle must contain between 2 and 32 states");
  }
  if (trace[0] !== "UNRESOLVED") throw new Error("invalid authoring origin contract: lifecycle must start at UNRESOLVED");
  for (let index = 1; index < trace.length; index += 1) {
    assertForgejoTransition(trace[index - 1] as ForgejoState, trace[index] as ForgejoState);
  }
  const terminal = trace[trace.length - 1] as ForgejoState;
  if (!isForgejoOutcome(terminal)) throw new Error("invalid authoring origin contract: lifecycle did not reach an outcome");
  return terminal;
}
