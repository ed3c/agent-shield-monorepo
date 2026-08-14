import type { SecureEnclaveOutcome, SecureEnclaveState } from "./types.ts";

const OUTCOMES = new Set<SecureEnclaveState>([
  "ACTIVE", "ABSENT_DEVICE", "UNSUPPORTED_HARDWARE", "USER_REFUSED", "AUTH_FAILED",
  "CHALLENGE_EXPIRED", "REPLAY_REFUSED", "SIGN_FAILED", "ROTATING", "REVOKED",
  "RECOVERY_REQUIRED", "FAILED_CLEANUP",
]);

// SEC-SE-006. A provisioned key can always be rotated, revoked, or found to need a human
// recovery ceremony, and any ceremony can end by failing to clean up after itself. Naming the
// set once keeps those four reachable from every state that owns a live key.
const LIFECYCLE_EXITS: readonly SecureEnclaveState[] = ["ROTATING", "REVOKED", "RECOVERY_REQUIRED", "FAILED_CLEANUP"];

// SEC-SE-004. Signing is reachable only through the states that earn it: a challenge that was
// accepted, then a local authorization that was actually satisfied. There is no edge from
// ACTIVE or CHALLENGE_RECEIVED to SIGNED, so "sign without user presence" is not a guard that
// can be forgotten -- it is a path that does not exist.
const TRANSITIONS: Readonly<Record<SecureEnclaveState, readonly SecureEnclaveState[]>> = {
  UNPROVISIONED: ["DEVICE_CHECKED", "ABSENT_DEVICE", "UNSUPPORTED_HARDWARE"],
  DEVICE_CHECKED: ["KEY_CREATING", "UNSUPPORTED_HARDWARE", "AUTH_FAILED", "RECOVERY_REQUIRED"],
  KEY_CREATING: ["KEY_REGISTERED", "UNSUPPORTED_HARDWARE", "USER_REFUSED", "AUTH_FAILED", "RECOVERY_REQUIRED"],
  KEY_REGISTERED: ["ACTIVE", "RECOVERY_REQUIRED", "FAILED_CLEANUP"],
  ACTIVE: ["CHALLENGE_RECEIVED", ...LIFECYCLE_EXITS],
  CHALLENGE_RECEIVED: ["USER_PRESENCE_REQUIRED", "CHALLENGE_EXPIRED", "REPLAY_REFUSED", "AUTH_FAILED", "REVOKED"],
  USER_PRESENCE_REQUIRED: ["SIGNED", "USER_REFUSED", "AUTH_FAILED", "CHALLENGE_EXPIRED"],
  SIGNED: ["EVIDENCE_EMITTED", "SIGN_FAILED", "FAILED_CLEANUP"],
  EVIDENCE_EMITTED: ["ACTIVE", "FAILED_CLEANUP"],
  // ACTIVE and ROTATING are resumable outcomes, not finished ones: a provisioning ceremony ends
  // at ACTIVE and a later signing ceremony starts from it, and a rotation parks at ROTATING
  // until the human admit that #59 keeps human-owned lets a new key be created.
  ROTATING: ["KEY_CREATING", "REVOKED", "RECOVERY_REQUIRED"],
  ABSENT_DEVICE: [],
  UNSUPPORTED_HARDWARE: [],
  USER_REFUSED: [],
  AUTH_FAILED: [],
  CHALLENGE_EXPIRED: [],
  REPLAY_REFUSED: [],
  SIGN_FAILED: [],
  REVOKED: [],
  RECOVERY_REQUIRED: [],
  FAILED_CLEANUP: [],
};

const RESUMABLE = new Set<SecureEnclaveState>(["ACTIVE", "ROTATING"]);

// The two tables above have to agree, and nothing in the type system makes them agree. So the
// agreement is asserted once, at module load: giving a terminal state a successor, or naming a
// resumable state that cannot resume, fails immediately instead of quietly widening the
// reachable set.
for (const [state, next] of Object.entries(TRANSITIONS) as [SecureEnclaveState, readonly SecureEnclaveState[]][]) {
  const outcome = OUTCOMES.has(state);
  const resumable = RESUMABLE.has(state);
  if (outcome && next.length > 0 && !resumable) {
    throw new Error(`invalid secure enclave contract: terminal outcome ${state} declares successors`);
  }
  if (resumable && !(outcome && next.length > 0)) {
    throw new Error(`invalid secure enclave contract: resumable state ${state} cannot resume`);
  }
}

// Every declared state must be reachable from UNPROVISIONED, or it is a state no producer can
// emit -- a multi-state type that has collapsed without any downstream consumer being able to
// see it.
{
  const seen = new Set<SecureEnclaveState>(["UNPROVISIONED"]);
  const queue: SecureEnclaveState[] = ["UNPROVISIONED"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as SecureEnclaveState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as SecureEnclaveState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid secure enclave contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isSecureEnclaveOutcome(value: SecureEnclaveState): value is SecureEnclaveOutcome {
  return OUTCOMES.has(value);
}

export function assertSecureEnclaveTransition(from: SecureEnclaveState, to: SecureEnclaveState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid secure enclave contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateSecureEnclaveLifecycle(trace: readonly SecureEnclaveState[]): SecureEnclaveOutcome {
  if (trace.length < 2 || trace.length > 32) {
    throw new Error("invalid secure enclave contract: lifecycle must contain between 2 and 32 states");
  }
  for (let index = 1; index < trace.length; index += 1) {
    assertSecureEnclaveTransition(trace[index - 1] as SecureEnclaveState, trace[index] as SecureEnclaveState);
  }
  const terminal = trace[trace.length - 1] as SecureEnclaveState;
  if (!isSecureEnclaveOutcome(terminal)) {
    throw new Error("invalid secure enclave contract: lifecycle did not reach an outcome");
  }
  return terminal;
}
