import type { RuntimeLifecycleState, RuntimeOutcomeState } from "../../../../packages/contracts/src/runtime/index.ts";

const transitions: Readonly<Record<RuntimeLifecycleState, readonly RuntimeLifecycleState[]>> = {
  UNRESOLVED: ["RESOLVED", "ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED", "REFUSED_POLICY"],
  RESOLVED: ["ADMISSION_CHECKED", "ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED", "REFUSED_POLICY"],
  ADMISSION_CHECKED: ["MATERIALIZING", "FAILED_ADMISSION", "REFUSED_POLICY", "CANCELLED", "TIMED_OUT"],
  MATERIALIZING: ["READY", "CLEANING"],
  READY: ["RUNNING"],
  RUNNING: ["COLLECTING", "CLEANING"],
  COLLECTING: ["CLEANING"],
  CLEANING: ["COMPLETED", "FAILED_MATERIALIZATION", "FAILED_EXECUTION", "FAILED_ARTIFACT", "FAILED_CLEANUP", "CANCELLED", "TIMED_OUT"],
  COMPLETED: [],
  ABSENT: [],
  NOT_IMPLEMENTED: [],
  NOT_EXERCISED: [],
  REFUSED_POLICY: [],
  FAILED_ADMISSION: [],
  FAILED_MATERIALIZATION: [],
  FAILED_EXECUTION: [],
  FAILED_ARTIFACT: [],
  FAILED_CLEANUP: [],
  CANCELLED: [],
  TIMED_OUT: [],
};

const outcomeStates = new Set<RuntimeOutcomeState>([
  "COMPLETED", "ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED", "REFUSED_POLICY",
  "FAILED_ADMISSION", "FAILED_MATERIALIZATION", "FAILED_EXECUTION", "FAILED_ARTIFACT",
  "FAILED_CLEANUP", "CANCELLED", "TIMED_OUT",
]);

export function isRuntimeOutcomeState(state: RuntimeLifecycleState): state is RuntimeOutcomeState {
  return outcomeStates.has(state as RuntimeOutcomeState);
}

export function assertRuntimeTransition(from: RuntimeLifecycleState, to: RuntimeLifecycleState): void {
  if (!transitions[from].includes(to)) throw new Error(`illegal runtime transition: ${from} -> ${to}`);
}

export class RuntimeLifecycle {
  readonly trace: RuntimeLifecycleState[] = ["UNRESOLVED"];

  get current(): RuntimeLifecycleState {
    return this.trace[this.trace.length - 1];
  }

  transition(to: RuntimeLifecycleState): void {
    assertRuntimeTransition(this.current, to);
    this.trace.push(to);
  }

  terminal(): RuntimeOutcomeState {
    if (!isRuntimeOutcomeState(this.current)) throw new Error(`runtime lifecycle is not terminal: ${this.current}`);
    return this.current;
  }
}

export function validateRuntimeLifecycleTrace(trace: readonly RuntimeLifecycleState[]): RuntimeOutcomeState {
  if (trace.length < 2 || trace[0] !== "UNRESOLVED") throw new Error("runtime lifecycle must begin at UNRESOLVED");
  for (let index = 1; index < trace.length; index += 1) assertRuntimeTransition(trace[index - 1], trace[index]);
  const terminal = trace[trace.length - 1];
  if (!isRuntimeOutcomeState(terminal)) throw new Error(`runtime lifecycle is not terminal: ${terminal}`);
  return terminal;
}
