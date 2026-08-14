import type { EvidenceState } from "../index.ts";
import { EVIDENCE_LADDER, type EvidenceRung, type IntegrationOutcome, type IntegrationState } from "./types.ts";

const OUTCOMES = new Set<IntegrationState>([
  "ADAPTERS_PENDING", "ABSENT_RELEASE", "INVALID_REQUIREMENTS", "CAPABILITY_CONFLICT",
  "PATH_CONFLICT", "SKILL_CONFLICT", "RUNTIME_CONFLICT", "SURFACE_DRIFT",
  "ADAPTER_ABSENT", "ORIGIN_ABSENT", "EQUIVALENCE_FAIL", "ROLLBACK_REFUSED_DRIFT",
]);

// Each stage can only fail into the blocked state that names its own subject. A closure
// failure cannot be reported as a skill conflict, and no stage can skip to a later one.
const TRANSITIONS: Readonly<Record<IntegrationState, readonly IntegrationState[]>> = {
  UNRESOLVED: ["RELEASE_PINNED", "ABSENT_RELEASE"],
  RELEASE_PINNED: ["REQUIREMENTS_VALIDATED", "INVALID_REQUIREMENTS"],
  REQUIREMENTS_VALIDATED: ["CLOSURE_RESOLVED", "CAPABILITY_CONFLICT"],
  CLOSURE_RESOLVED: ["CONFLICTS_CHECKED", "CAPABILITY_CONFLICT", "PATH_CONFLICT"],
  CONFLICTS_CHECKED: ["SKILLS_BOUND", "SKILL_CONFLICT"],
  SKILLS_BOUND: ["RUNTIME_BOUND", "RUNTIME_CONFLICT"],
  RUNTIME_BOUND: ["SURFACES_GENERATED", "SURFACE_DRIFT"],
  SURFACES_GENERATED: ["OFFLINE_VERIFIED", "SURFACE_DRIFT"],
  // This issue stops at ADAPTERS_PENDING. Carrier, origin, equivalence and promotion states
  // belong to the child issues, so they are named here as blocked outcomes only -- this
  // foundation cannot reach ADMITTED, and there is no transition that would let it.
  OFFLINE_VERIFIED: ["ADAPTERS_PENDING", "ADAPTER_ABSENT", "ORIGIN_ABSENT", "EQUIVALENCE_FAIL", "ROLLBACK_REFUSED_DRIFT"],
  ADAPTERS_PENDING: [],
  ABSENT_RELEASE: [],
  INVALID_REQUIREMENTS: [],
  CAPABILITY_CONFLICT: [],
  PATH_CONFLICT: [],
  SKILL_CONFLICT: [],
  RUNTIME_CONFLICT: [],
  SURFACE_DRIFT: [],
  ADAPTER_ABSENT: [],
  ORIGIN_ABSENT: [],
  EQUIVALENCE_FAIL: [],
  ROLLBACK_REFUSED_DRIFT: [],
};

// Same discipline as the security family: the "cannot continue past an outcome" rule lives in
// TRANSITIONS, and the agreement between the two tables is asserted here at module load
// rather than re-checked per trace. No integration outcome is resumable.
for (const [state, next] of Object.entries(TRANSITIONS) as [IntegrationState, readonly IntegrationState[]][]) {
  if (OUTCOMES.has(state) && next.length > 0) {
    throw new Error(`invalid integration contract: terminal outcome ${state} declares successors`);
  }
}
{
  const seen = new Set<IntegrationState>(["UNRESOLVED"]);
  const queue: IntegrationState[] = ["UNRESOLVED"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as IntegrationState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as IntegrationState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid integration contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isIntegrationOutcome(value: IntegrationState): value is IntegrationOutcome {
  return OUTCOMES.has(value);
}

export function assertIntegrationTransition(from: IntegrationState, to: IntegrationState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid integration contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateIntegrationLifecycle(trace: readonly IntegrationState[]): IntegrationOutcome {
  if (trace.length < 2 || trace.length > 24) {
    throw new Error("invalid integration contract: lifecycle must contain between 2 and 24 states");
  }
  if (trace[0] !== "UNRESOLVED") throw new Error("invalid integration contract: lifecycle must start at UNRESOLVED");
  for (let index = 1; index < trace.length; index += 1) assertIntegrationTransition(trace[index - 1], trace[index]);
  const terminal = trace[trace.length - 1];
  if (!isIntegrationOutcome(terminal)) throw new Error("invalid integration contract: lifecycle did not reach an outcome");
  return terminal;
}

// INT-FND-007. A rung may be PASS only when every rung below it is PASS. Anything else is a
// higher claim resting on an unmade lower one.
export function assertEvidenceLadder(evidence: Readonly<Record<EvidenceRung, EvidenceState>>): void {
  let floorBroken = false;
  for (const rung of EVIDENCE_LADDER) {
    const state = evidence[rung];
    if (state === undefined) throw new Error(`invalid integration contract: evidence rung ${rung} is absent`);
    if (state === "PASS" && floorBroken) {
      throw new Error(`invalid integration contract: evidence rung ${rung} claims PASS above an unproven rung`);
    }
    if (state !== "PASS") floorBroken = true;
  }
}

// This foundation can only reach ADAPTERS_PENDING, so the strongest evidence it projects is
// NOT_EXERCISED. Carrier, origin, equivalence and release results are separate child subjects.
export function integrationEvidenceForOutcome(outcome: IntegrationOutcome): EvidenceState {
  switch (outcome) {
    case "ADAPTERS_PENDING":
      return "NOT_EXERCISED";
    case "ABSENT_RELEASE":
    case "ADAPTER_ABSENT":
    case "ORIGIN_ABSENT":
      return "ABSENT";
    default:
      return "FAIL";
  }
}
