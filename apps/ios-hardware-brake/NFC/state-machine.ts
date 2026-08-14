import type { NfcOutcome, NfcState } from "./types.ts";

const OUTCOMES = new Set<NfcState>([
  "ACTIVE", "ABSENT_DEVICE", "UNSUPPORTED_CARD", "ENTITLEMENT_REFUSED", "USER_CANCELLED",
  "TIMEOUT", "CARD_MISMATCH", "COUNTER_STALE", "REPLAY_REFUSED", "VERIFY_FAILED",
  "REVOKED", "RECOVERY_REQUIRED", "FAILED_CLEANUP",
]);

// SEC-NFC-005. A session that the user dismissed, a session that ran out of time and a reader
// that never found a card are three separate exits, reachable from every state where the field
// is live. Naming the set once keeps them from drifting apart state by state.
const SESSION_EXITS: readonly NfcState[] = ["USER_CANCELLED", "TIMEOUT"];

// SEC-NFC-002 and SEC-NFC-003. Evidence is reachable only through a response that was received
// from the registered card and then verified. There is no edge from CHALLENGE_BOUND or
// CARD_PRESENT to EVIDENCE_EMITTED, so "emit evidence without verifying" is a path that does
// not exist rather than a guard that can be forgotten.
const TRANSITIONS: Readonly<Record<NfcState, readonly NfcState[]>> = {
  UNPROVISIONED: ["CARD_PROFILE_ADMITTED", "ABSENT_DEVICE", "UNSUPPORTED_CARD", "ENTITLEMENT_REFUSED"],
  CARD_PROFILE_ADMITTED: ["CARD_REGISTERED", "UNSUPPORTED_CARD", "RECOVERY_REQUIRED"],
  CARD_REGISTERED: ["ACTIVE", "RECOVERY_REQUIRED", "FAILED_CLEANUP"],
  ACTIVE: ["SESSION_STARTED", "REVOKED", "RECOVERY_REQUIRED", "FAILED_CLEANUP"],
  SESSION_STARTED: ["CHALLENGE_BOUND", "ABSENT_DEVICE", "ENTITLEMENT_REFUSED", ...SESSION_EXITS],
  CHALLENGE_BOUND: ["CARD_PRESENT", "REPLAY_REFUSED", "REVOKED", "CARD_MISMATCH", ...SESSION_EXITS],
  CARD_PRESENT: ["RESPONSE_RECEIVED", "CARD_MISMATCH", ...SESSION_EXITS],
  RESPONSE_RECEIVED: ["RESPONSE_VERIFIED", "VERIFY_FAILED", "COUNTER_STALE", "REPLAY_REFUSED", "CARD_MISMATCH"],
  RESPONSE_VERIFIED: ["EVIDENCE_EMITTED", "FAILED_CLEANUP"],
  EVIDENCE_EMITTED: ["ACTIVE", "FAILED_CLEANUP"],
  // ACTIVE is a resumable outcome, not a finished one: registration ends there and every later
  // possession ceremony starts from it.
  ABSENT_DEVICE: [],
  UNSUPPORTED_CARD: [],
  ENTITLEMENT_REFUSED: [],
  USER_CANCELLED: [],
  TIMEOUT: [],
  CARD_MISMATCH: [],
  COUNTER_STALE: [],
  REPLAY_REFUSED: [],
  VERIFY_FAILED: [],
  REVOKED: [],
  RECOVERY_REQUIRED: [],
  FAILED_CLEANUP: [],
};

const RESUMABLE = new Set<NfcState>(["ACTIVE"]);

// The two tables have to agree and nothing in the type system makes them agree, so the
// agreement is asserted once, at module load.
for (const [state, next] of Object.entries(TRANSITIONS) as [NfcState, readonly NfcState[]][]) {
  const outcome = OUTCOMES.has(state);
  const resumable = RESUMABLE.has(state);
  if (outcome && next.length > 0 && !resumable) {
    throw new Error(`invalid nfc contract: terminal outcome ${state} declares successors`);
  }
  if (resumable && !(outcome && next.length > 0)) {
    throw new Error(`invalid nfc contract: resumable state ${state} cannot resume`);
  }
}

// Every declared state must be reachable from UNPROVISIONED, or it is a state no producer can
// emit -- a multi-state type that has collapsed without any consumer being able to see it.
{
  const seen = new Set<NfcState>(["UNPROVISIONED"]);
  const queue: NfcState[] = ["UNPROVISIONED"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as NfcState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as NfcState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid nfc contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isNfcOutcome(value: NfcState): value is NfcOutcome {
  return OUTCOMES.has(value);
}

export function assertNfcTransition(from: NfcState, to: NfcState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid nfc contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateNfcLifecycle(trace: readonly NfcState[]): NfcOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid nfc contract: lifecycle must contain between 2 and 32 states");
  }
  for (let index = 1; index < trace.length; index += 1) {
    assertNfcTransition(trace[index - 1] as NfcState, trace[index] as NfcState);
  }
  const terminal = trace[trace.length - 1] as NfcState;
  if (!isNfcOutcome(terminal)) throw new Error("invalid nfc contract: lifecycle did not reach an outcome");
  return terminal;
}
