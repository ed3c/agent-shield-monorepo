export { SealedApdu, REDACTED } from "./sealed-apdu.ts";
export { FakeCoreNfcBridge, PLANTED_SECRET } from "./fake-reader.ts";
export { assertNfcTransition, isNfcOutcome, validateNfcLifecycle } from "./state-machine.ts";
export {
  CardRegistry,
  assertCardProfile,
  challengeRefusal,
  corenfcProviderState,
  fail,
  runPossession,
  runRegistration,
  runRevocation,
  verifyPossessionEvidence,
  type LifecycleRequest,
  type PossessionRequest,
  type RegistrationRequest,
} from "./provider.ts";
export { PROPRIETARY_PROTOCOLS } from "./types.ts";
export type {
  CardKeyRef,
  CardProfile,
  CardResponse,
  CoreNfcBridge,
  NfcChallenge,
  NfcLifecycleReceipt,
  NfcOutcome,
  NfcPossessionReceipt,
  NfcProtocol,
  NfcRegistrationReceipt,
  NfcState,
  PossessionEvidence,
  RegisteredCard,
  SchemeReview,
  SessionResult,
  VerificationResult,
} from "./types.ts";
