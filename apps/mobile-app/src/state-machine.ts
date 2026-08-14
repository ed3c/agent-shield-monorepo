import type { ExpoOutcome, ExpoState } from "./types.ts";

const OUTCOMES = new Set<ExpoState>([
  "CLOSED", "ABSENT_TOOLCHAIN", "BUILD_FAILED", "ARTIFACT_FAILED", "SIMULATOR_ABSENT",
  "INSTALL_FAILED", "LAUNCH_FAILED", "ACTION_DENIED", "TEST_NOT_EXERCISED", "FAILED_CLEANUP",
]);

// UX-EXPO-008. Once an artifact exists there is host state to account for, so every state from
// ARTIFACT_READY onwards can end in a cleanup failure. Before that there is nothing to leave
// behind, and giving those states the edge anyway would be an unreachable path.
const AFTER_ARTIFACT: readonly ExpoState[] = ["FAILED_CLEANUP"];

// UX-EXPO-005. A run reaches CLOSED only through OBSERVING, which is only reachable through a
// launched app that accepted an action. There is no edge from ARTIFACT_READY or LAUNCHED to
// CLOSED, so "report a closed run without observing anything" is a path that does not exist.
const TRANSITIONS: Readonly<Record<ExpoState, readonly ExpoState[]>> = {
  UNBUILT: ["TOOLCHAIN_CHECKED", "ABSENT_TOOLCHAIN"],
  TOOLCHAIN_CHECKED: ["CONFIG_VALIDATED", "ABSENT_TOOLCHAIN", "BUILD_FAILED"],
  CONFIG_VALIDATED: ["BUILDING", "BUILD_FAILED"],
  BUILDING: ["ARTIFACT_READY", "BUILD_FAILED", "ARTIFACT_FAILED"],
  ARTIFACT_READY: ["INSTALLING", "SIMULATOR_ABSENT", "ARTIFACT_FAILED", ...AFTER_ARTIFACT],
  INSTALLING: ["LAUNCHED", "INSTALL_FAILED", "SIMULATOR_ABSENT", ...AFTER_ARTIFACT],
  LAUNCHED: ["ACTION_READY", "LAUNCH_FAILED", ...AFTER_ARTIFACT],
  ACTION_READY: ["OBSERVING", "ACTION_DENIED", "TEST_NOT_EXERCISED", ...AFTER_ARTIFACT],
  OBSERVING: ["CLOSED", "TEST_NOT_EXERCISED", ...AFTER_ARTIFACT],
  CLOSED: [],
  ABSENT_TOOLCHAIN: [],
  BUILD_FAILED: [],
  ARTIFACT_FAILED: [],
  SIMULATOR_ABSENT: [],
  INSTALL_FAILED: [],
  LAUNCH_FAILED: [],
  ACTION_DENIED: [],
  TEST_NOT_EXERCISED: [],
  FAILED_CLEANUP: [],
};

// Nothing here resumes: a mobile run ends, and the next run starts from UNBUILT with its own
// toolchain probe. So every outcome is terminal and the assertion below is unconditional.
for (const [state, next] of Object.entries(TRANSITIONS) as [ExpoState, readonly ExpoState[]][]) {
  if (OUTCOMES.has(state) && next.length > 0) {
    throw new Error(`invalid expo contract: terminal outcome ${state} declares successors`);
  }
}

// Every declared state must be reachable from UNBUILT, or it is a state no producer can emit.
{
  const seen = new Set<ExpoState>(["UNBUILT"]);
  const queue: ExpoState[] = ["UNBUILT"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as ExpoState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as ExpoState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid expo contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isExpoOutcome(value: ExpoState): value is ExpoOutcome {
  return OUTCOMES.has(value);
}

export function assertExpoTransition(from: ExpoState, to: ExpoState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid expo contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateExpoLifecycle(trace: readonly ExpoState[]): ExpoOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid expo contract: lifecycle must contain between 2 and 32 states");
  }
  if (trace[0] !== "UNBUILT") throw new Error("invalid expo contract: lifecycle must start at UNBUILT");
  for (let index = 1; index < trace.length; index += 1) {
    assertExpoTransition(trace[index - 1] as ExpoState, trace[index] as ExpoState);
  }
  const terminal = trace[trace.length - 1] as ExpoState;
  if (!isExpoOutcome(terminal)) throw new Error("invalid expo contract: lifecycle did not reach an outcome");
  return terminal;
}
