import type { OpaDecisionState, OpaEvaluationInput, OpaLimits } from "./types.ts";

export interface PolicyRule {
  id: string;
  // A rule returns its decision when it applies, or null when it does not. Every rule is a
  // pure function of the closed input and the limits: no clock, no network, no randomness.
  // SEC-OPA-002 is a property of this signature, not of a convention someone must remember.
  apply(input: OpaEvaluationInput, limits: OpaLimits): { state: OpaDecisionState; reason: string; requiredEvidence?: string[] } | null;
}

// Ordered, most restrictive first. The order is part of the bundle: a later rule cannot
// override an earlier one, so a permissive rule cannot be slipped in front of a deny.
export const POLICY_RULES: readonly PolicyRule[] = [
  {
    id: "denied-target",
    apply(input, limits) {
      return limits.deniedTargets.includes(input.target)
        ? { state: "DENY", reason: "target-denied" }
        : null;
    },
  },
  {
    id: "amount-over-limit",
    apply(input, limits) {
      return BigInt(input.amountMinor) > BigInt(limits.maxAmountMinor)
        ? { state: "REQUIRE_HUMAN", reason: "amount-over-limit" }
        : null;
    },
  },
  {
    id: "missing-evidence",
    apply(input, limits) {
      const missing = limits.requiredEvidenceRefs.filter((ref) => !input.evidenceRefs.includes(ref));
      return missing.length > 0
        ? { state: "REQUIRE_HUMAN", reason: "evidence-missing", requiredEvidence: missing }
        : null;
    },
  },
  {
    id: "hardware-data-class",
    apply(input, limits) {
      return limits.hardwareDataClasses.includes(input.dataClass)
        ? { state: "REQUIRE_HARDWARE", reason: "hardware-required-data-class" }
        : null;
    },
  },
  {
    id: "agent-actor-escalation",
    apply(input) {
      // An Agent acting alone never reaches a session allow; a human is always in the loop for
      // settlement. This is the rule most likely to be "simplified away", so it is named.
      return input.actorKind === "agent"
        ? { state: "REQUIRE_HUMAN", reason: "agent-initiated-settlement" }
        : null;
    },
  },
];

export interface PolicyOutcome {
  state: OpaDecisionState;
  reasonCodes: string[];
  requiredEvidence: string[];
}

// SEC-OPA-002. Deterministic: the same input and the same rule set always produce the same
// outcome, including the order of reason codes.
export function evaluatePolicy(
  input: OpaEvaluationInput,
  limits: OpaLimits,
  rules: readonly PolicyRule[] = POLICY_RULES,
): PolicyOutcome {
  const reasonCodes: string[] = [];
  const requiredEvidence = new Set<string>();
  let state: OpaDecisionState = "ALLOW_SESSION";
  const severity: Record<OpaDecisionState, number> = {
    ALLOW_SESSION: 0,
    REQUIRE_HARDWARE: 1,
    REQUIRE_HUMAN: 2,
    DENY: 3,
  };

  for (const rule of rules) {
    const hit = rule.apply(input, limits);
    if (hit === null) continue;
    reasonCodes.push(hit.reason);
    for (const ref of hit.requiredEvidence ?? []) requiredEvidence.add(ref);
    // The most restrictive hit wins regardless of rule order, so reordering the bundle cannot
    // turn a deny into an allow.
    if (severity[hit.state] > severity[state]) state = hit.state;
  }

  return {
    state,
    reasonCodes: reasonCodes.length > 0 ? [...reasonCodes].sort() : ["within-policy"],
    requiredEvidence: [...requiredEvidence].sort(),
  };
}
