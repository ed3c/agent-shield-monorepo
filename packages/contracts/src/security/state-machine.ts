import type { EvidenceState } from "../index.ts";
import type { SecurityOutcome, SecurityRiskTier, SecurityState } from "./types.ts";

const OUTCOMES = new Set<SecurityState>([
  "SUBMISSION_PENDING", "DENIED", "EXPIRED", "REVOKED", "REPLAY_REFUSED",
  "WAITING_FOR_HUMAN", "WAITING_FOR_HARDWARE", "ABSENT_PROVIDER",
  "NOT_IMPLEMENTED", "NOT_EXERCISED", "FAILED_POLICY", "FAILED_EVIDENCE",
  "FAILED_SIGNING", "FAILED_LEDGER", "FAILED_SUBMISSION", "FAILED_RECOVERY",
]);

const BLOCKED: readonly SecurityState[] = [
  "DENIED", "EXPIRED", "REVOKED", "REPLAY_REFUSED", "WAITING_FOR_HUMAN", "ABSENT_PROVIDER",
];

// SEC-FND-002. Signing and submission are reachable only through the states that earn them.
// The low-risk route may authorize a session and prepare an operation; only the high-risk
// route passes through challenge, hardware wait, verified evidence and signing authorization.
const TRANSITIONS: Readonly<Record<SecurityState, readonly SecurityState[]>> = {
  DRAFT: ["INTENT_VALIDATED", "FAILED_POLICY", "EXPIRED", "REPLAY_REFUSED", "NOT_IMPLEMENTED", "NOT_EXERCISED"],
  INTENT_VALIDATED: ["RISK_EVALUATED", ...BLOCKED, "FAILED_POLICY"],
  RISK_EVALUATED: ["ROUTED", ...BLOCKED, "FAILED_POLICY"],
  ROUTED: ["SESSION_AUTHORIZED", "CHALLENGE_ISSUED", ...BLOCKED, "FAILED_POLICY"],
  SESSION_AUTHORIZED: ["OPERATION_PREPARED", ...BLOCKED, "FAILED_POLICY"],
  CHALLENGE_ISSUED: ["WAITING_FOR_HARDWARE", "EVIDENCE_VERIFIED", ...BLOCKED, "FAILED_EVIDENCE"],
  EVIDENCE_VERIFIED: ["SIGNING_AUTHORIZED", ...BLOCKED, "FAILED_EVIDENCE", "FAILED_SIGNING"],
  SIGNING_AUTHORIZED: ["OPERATION_PREPARED", ...BLOCKED, "FAILED_SIGNING"],
  OPERATION_PREPARED: ["SUBMISSION_PENDING", ...BLOCKED, "FAILED_LEDGER", "FAILED_SUBMISSION"],
  SUBMISSION_PENDING: [],
  DENIED: [],
  EXPIRED: [],
  REVOKED: [],
  REPLAY_REFUSED: [],
  // The two waiting states are resumable, not finished: a human or a device can still move
  // them. Recovery approval is human-owned, so FAILED_RECOVERY is emitted from here and
  // nowhere else -- a state no production path can reach would not exist.
  WAITING_FOR_HUMAN: ["OPERATION_PREPARED", "DENIED", "EXPIRED", "REVOKED", "FAILED_RECOVERY"],
  WAITING_FOR_HARDWARE: ["EVIDENCE_VERIFIED", "EXPIRED", "REVOKED", "DENIED", "FAILED_EVIDENCE"],
  ABSENT_PROVIDER: [],
  NOT_IMPLEMENTED: [],
  NOT_EXERCISED: [],
  FAILED_POLICY: [],
  FAILED_EVIDENCE: [],
  FAILED_SIGNING: [],
  FAILED_LEDGER: [],
  FAILED_SUBMISSION: [],
  FAILED_RECOVERY: [],
};

// The states a trace may pass through and still continue. Everything else in OUTCOMES ends
// the trace where it appears.
const RESUMABLE = new Set<SecurityState>(["WAITING_FOR_HUMAN", "WAITING_FOR_HARDWARE"]);

// "A lifecycle cannot continue past an outcome" is enforced by TRANSITIONS, not by a second
// scan of the trace: a non-resumable outcome has no successors, so the transition walk already
// rejects it. Re-checking it in validateSecurityLifecycle would be dead code.
//
// What that argument depends on is the two tables agreeing, and nothing in the type system
// makes them agree. So the agreement is asserted here, once, at module load: giving a terminal
// state a successor, or naming a resumable state that cannot resume, fails immediately instead
// of quietly widening the reachable set. Every state must also be declared exactly once.
for (const [state, next] of Object.entries(TRANSITIONS) as [SecurityState, readonly SecurityState[]][]) {
  const outcome = OUTCOMES.has(state);
  const resumable = RESUMABLE.has(state);
  if (outcome && next.length > 0 && !resumable) {
    throw new Error(`invalid security contract: terminal outcome ${state} declares successors`);
  }
  if (resumable && !(outcome && next.length > 0)) {
    throw new Error(`invalid security contract: resumable state ${state} cannot resume`);
  }
  // No runtime check that a target is a declared state: TRANSITIONS is typed
  // Record<SecurityState, readonly SecurityState[]>, so an undeclared target is a compile
  // error and a runtime guard for it could never fire.
  void next;
}

// Every declared state must be reachable from DRAFT, or it is a state no producer can emit.
{
  const seen = new Set<SecurityState>(["DRAFT"]);
  const queue: SecurityState[] = ["DRAFT"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as SecurityState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as SecurityState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid security contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isSecurityOutcome(value: SecurityState): value is SecurityOutcome {
  return OUTCOMES.has(value);
}

export function assertSecurityTransition(from: SecurityState, to: SecurityState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid security contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateSecurityLifecycle(trace: readonly SecurityState[]): SecurityOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid security contract: lifecycle must contain between 2 and 32 states");
  }
  if (trace[0] !== "DRAFT") throw new Error("invalid security contract: lifecycle must start at DRAFT");
  for (let index = 1; index < trace.length; index += 1) assertSecurityTransition(trace[index - 1], trace[index]);
  const terminal = trace[trace.length - 1];
  if (!isSecurityOutcome(terminal)) throw new Error("invalid security contract: lifecycle did not reach an outcome");
  return terminal;
}

// The tier is checked against the trace rather than against a producer-supplied flag, so a
// caller cannot declare "low" to skip hardware evidence, or declare "high" while taking the
// session route.
//
// This function deliberately does NOT re-check that a high-risk submission passed through
// EVIDENCE_VERIFIED and SIGNING_AUTHORIZED. TRANSITIONS above already makes every other path
// to OPERATION_PREPARED unreachable from CHALLENGE_ISSUED, so such a guard would be dead code
// that reads like a second independent barrier while never being able to fire.
export function assertSecurityRouteForTier(trace: readonly SecurityState[], tier: SecurityRiskTier): void {
  if (tier === "high") {
    if (!trace.includes("CHALLENGE_ISSUED")) {
      throw new Error("invalid security contract: a high-risk intent must issue a challenge");
    }
    return;
  }
  if (trace.includes("CHALLENGE_ISSUED") || trace.includes("SIGNING_AUTHORIZED")) {
    throw new Error("invalid security contract: a low-risk intent cannot claim the hardware signing route");
  }
}

// SEC-FND-007. A deterministic contract pass is never a security audit, a native provider or
// a production result. The strongest state this family can project is NOT_EXERCISED, except
// for the explicit absence and failure states.
export function securityEvidenceForOutcome(outcome: SecurityOutcome): EvidenceState {
  switch (outcome) {
    case "SUBMISSION_PENDING":
    case "WAITING_FOR_HUMAN":
    case "WAITING_FOR_HARDWARE":
    case "NOT_EXERCISED":
      return "NOT_EXERCISED";
    case "ABSENT_PROVIDER":
      return "ABSENT";
    case "NOT_IMPLEMENTED":
      return "NOT_IMPLEMENTED";
    default:
      return "FAIL";
  }
}
