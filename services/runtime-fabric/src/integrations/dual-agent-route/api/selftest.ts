import {
  ApiAdapterError,
  buildApiAttempt,
  classifyApiObservation,
  proposeApiEffectCommit,
  validateApiReadback,
  type ApiObservation,
  type ApiReadback,
} from "./adapter.ts";
import {
  BETTOR_EFFECT_CONTRACT,
  RouteContractError,
  fixedRequest,
  selectRoute,
  type RouteRequest,
} from "../contract.ts";

function expect(code: string, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    if ((error instanceof ApiAdapterError || error instanceof RouteContractError) && error.code === code) {
      console.log(`${code}: RED/${code}`);
      return;
    }
    throw error;
  }
  throw new Error(`${code}: planted control survived`);
}

function writeRequest(): RouteRequest {
  const request = fixedRequest();
  request.actionId = "records.create";
  request.actionClass = "REVERSIBLE_WRITE";
  request.effectBinding = {
    owner: BETTOR_EFFECT_CONTRACT.owner,
    mode: BETTOR_EFFECT_CONTRACT.mode,
    repository: BETTOR_EFFECT_CONTRACT.repository,
    commit: BETTOR_EFFECT_CONTRACT.commit,
    tree: BETTOR_EFFECT_CONTRACT.tree,
    effectIntentDigest: "9".repeat(64),
    canonicalWriteMode: "PROPOSAL_ONLY",
  };
  return request;
}

function observation(packet: ReturnType<typeof buildApiAttempt>, outcome: ApiObservation["outcome"] = "SUCCESS"): ApiObservation {
  return {
    schema: "agent-shield/dual-agent-route/api-observation/v1",
    requestId: packet.requestId,
    actionId: packet.actionId,
    routeSubjectDigest: packet.routeSubjectDigest,
    outcome,
    responseDigest: "a".repeat(64),
    providerNativeIdempotencyObserved: true,
    providerNativeIdempotencyIsAuthority: false,
    evidenceLane: "API",
    evidenceClass: "DETERMINISTIC_FIXTURE",
    canonicalWriteMode: "OBSERVATION_ONLY",
    liveApiState: "NOT_EXERCISED",
    cleanupState: "CLEAN",
  };
}

function readback(packet: ReturnType<typeof buildApiAttempt>): ApiReadback {
  return {
    schema: "agent-shield/dual-agent-route/api-readback/v1",
    requestId: packet.requestId,
    actionId: packet.actionId,
    routeSubjectDigest: packet.routeSubjectDigest,
    targetDigest: "b".repeat(64),
    verified: true,
    evidenceLane: "API",
    evidenceClass: "API_READBACK_FIXTURE",
    liveReadbackState: "NOT_EXERCISED",
    cleanupState: "CLEAN",
  };
}

const readRequest = fixedRequest();
const readPacket = buildApiAttempt(readRequest, selectRoute(readRequest));
const readObs = observation(readPacket);
const readClass = classifyApiObservation(readPacket, readObs);
if (readClass.effectStateProposal !== "NONE") throw new Error("read-only API unexpectedly created effect");
console.log("P1: PASS read-only API observation remains effect-free");

const write = writeRequest();
const writePacket = buildApiAttempt(write, selectRoute(write));
const writeObs = observation(writePacket, "SUCCESS");
const writeClass = classifyApiObservation(writePacket, writeObs);
if (writeClass.effectStateProposal !== "EFFECT_OBSERVED_PENDING_READBACK") throw new Error("write observation classification failed");
const proposal = proposeApiEffectCommit(writePacket, writeObs, readback(writePacket));
if (proposal.canonicalWriteMode !== "PROPOSAL_ONLY" || proposal.externalEffectState !== "NOT_EXERCISED") throw new Error("effect proposal authority widened");
console.log("P2: PASS write API requires readback and emits effect proposal only");

const timeout = observation(writePacket, "TIMEOUT");
if (classifyApiObservation(writePacket, timeout).effectStateProposal !== "RESULT_UNKNOWN") throw new Error("timeout not preserved as unknown");
expect("RESULT_UNKNOWN_COMMIT_FORBIDDEN", () => proposeApiEffectCommit(writePacket, timeout, readback(writePacket)));
console.log("P3: PASS timeout remains RESULT_UNKNOWN");

const fallback = fixedRequest();
fallback.api.admissionState = "ABSENT";
const fallbackDecision = selectRoute(fallback);
expect("API_ROUTE_NOT_ADMITTED", () => buildApiAttempt(fallback, fallbackDecision));

const raw = fixedRequest();
raw.api.authHandle = "raw-token-value";
expect("RAW_AUTH_MATERIAL", () => buildApiAttempt(raw));

const noReadback = writeRequest();
const noReadbackPacket = buildApiAttempt(noReadback);
expect("API_READBACK_REQUIRED", () => proposeApiEffectCommit(noReadbackPacket, observation(noReadbackPacket), null));

const browserEvidence = observation(writePacket);
(browserEvidence.evidenceLane as string) = "BROWSER";
expect("BROWSER_AS_API_EVIDENCE", () => classifyApiObservation(writePacket, browserEvidence));

const promoted = observation(writePacket);
(promoted.liveApiState as string) = "PASS";
expect("PACKAGE_PRESENCE_AS_LIVE_API", () => classifyApiObservation(writePacket, promoted));

const selfCommit = observation(writePacket);
(selfCommit.canonicalWriteMode as string) = "CANONICAL_WRITE";
expect("PROVIDER_SELF_COMMIT", () => classifyApiObservation(writePacket, selfCommit));

const idemAuthority = observation(writePacket);
(idemAuthority.providerNativeIdempotencyIsAuthority as boolean) = true;
expect("PROVIDER_IDEMPOTENCY_AS_AUTHORITY", () => classifyApiObservation(writePacket, idemAuthority));

const dirty = observation(writePacket);
dirty.cleanupState = "DIRTY";
expect("API_CLEANUP_RESIDUE", () => classifyApiObservation(writePacket, dirty));

const wrongSubject = observation(writePacket);
wrongSubject.routeSubjectDigest = "0".repeat(64);
expect("API_OBSERVATION_SUBJECT_MISMATCH", () => classifyApiObservation(writePacket, wrongSubject));

const badReadback = readback(writePacket);
badReadback.evidenceClass = "API_READBACK_FIXTURE";
(badReadback.evidenceLane as string) = "BROWSER";
expect("BROWSER_AS_API_EVIDENCE", () => validateApiReadback(writePacket, badReadback));

const liveReadback = readback(writePacket);
(liveReadback.liveReadbackState as string) = "PASS";
expect("FIXTURE_AS_LIVE_API_READBACK", () => validateApiReadback(writePacket, liveReadback));

const badLimit = fixedRequest();
expect("API_LIMIT_INVALID", () => buildApiAttempt(badLimit, selectRoute(badLimit), { timeoutMs: 0, maxOutputBytes: 100 }));

console.log("PASS: DA-INT-API typed API adapter positive paths + planted disagreement controls");
