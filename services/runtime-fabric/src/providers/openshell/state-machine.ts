import type { OpenShellPolicyOutcome, OpenShellPolicyState } from "./types.ts";

const outcomes = new Set<OpenShellPolicyOutcome>([
  "COMPLETED", "ABSENT_POLICY", "STALE_EPOCH", "REFUSED_TASK",
  "REFUSED_NETWORK", "REFUSED_FILESYSTEM", "FAILED_POLICY_SCHEMA",
]);

const transitions: Readonly<Record<OpenShellPolicyState, readonly OpenShellPolicyState[]>> = {
  UNRESOLVED: ["POLICY_RESOLVED", "ABSENT_POLICY", "FAILED_POLICY_SCHEMA"],
  POLICY_RESOLVED: ["POLICY_VERIFIED", "STALE_EPOCH", "FAILED_POLICY_SCHEMA"],
  POLICY_VERIFIED: ["AUTHORIZED", "REFUSED_TASK", "REFUSED_NETWORK", "REFUSED_FILESYSTEM"],
  AUTHORIZED: ["COMPILED", "FAILED_POLICY_SCHEMA"],
  COMPILED: ["COMPLETED"],
  COMPLETED: [],
  ABSENT_POLICY: [],
  STALE_EPOCH: [],
  REFUSED_TASK: [],
  REFUSED_NETWORK: [],
  REFUSED_FILESYSTEM: [],
  FAILED_POLICY_SCHEMA: [],
};

export function isOpenShellPolicyOutcome(value: OpenShellPolicyState): value is OpenShellPolicyOutcome {
  return outcomes.has(value as OpenShellPolicyOutcome);
}

export function assertOpenShellPolicyTransition(from: OpenShellPolicyState, to: OpenShellPolicyState): void {
  if (!transitions[from].includes(to)) throw new Error(`illegal OpenShell policy transition: ${from} -> ${to}`);
}

export class OpenShellPolicyLifecycle {
  readonly trace: OpenShellPolicyState[] = ["UNRESOLVED"];
  get current(): OpenShellPolicyState { return this.trace[this.trace.length - 1]; }
  transition(next: OpenShellPolicyState): void { assertOpenShellPolicyTransition(this.current, next); this.trace.push(next); }
  outcome(): OpenShellPolicyOutcome {
    if (!isOpenShellPolicyOutcome(this.current)) throw new Error(`OpenShell policy lifecycle is not terminal: ${this.current}`);
    return this.current;
  }
}

export function validateOpenShellPolicyLifecycle(trace: readonly OpenShellPolicyState[]): OpenShellPolicyOutcome {
  if (trace.length < 2 || trace[0] !== "UNRESOLVED") throw new Error("OpenShell policy lifecycle must start at UNRESOLVED");
  for (let index = 1; index < trace.length; index += 1) assertOpenShellPolicyTransition(trace[index - 1], trace[index]);
  const outcome = trace[trace.length - 1];
  if (!isOpenShellPolicyOutcome(outcome)) throw new Error(`OpenShell policy lifecycle is not terminal: ${outcome}`);
  return outcome;
}
