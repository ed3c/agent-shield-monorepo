import {
  BrowserAdapterError,
  buildBrowserAttempt,
  classifyBrowserObservation,
  proposeBrowserEffectCommit,
  validateBrowserReadback,
  type BrowserObservation,
  type BrowserReadback,
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
    if ((error instanceof BrowserAdapterError || error instanceof RouteContractError) && error.code === code) {
      console.log(`${code}: RED/${code}`);
      return;
    }
    throw error;
  }
  throw new Error(`${code}: planted control survived`);
}

function fallbackRequest(write = false): RouteRequest {
  const request = fixedRequest();
  request.api.admissionState = "ABSENT";
  if (write) {
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
  }
  return request;
}

function packet(write = false) {
  const request = fallbackRequest(write);
  return buildBrowserAttempt(request, selectRoute(request), {
    origin: "https://example.invalid",
    locatorId: write ? "records.create.button" : "records.read.panel",
    sessionHandle: "secret://session/demo",
  });
}

function observation(p: ReturnType<typeof packet>, outcome: BrowserObservation["outcome"] = "SUCCESS"): BrowserObservation {
  return {
    schema: "agent-shield/dual-agent-route/browser-observation/v1",
    requestId: p.requestId,
    actionId: p.actionId,
    routeSubjectDigest: p.routeSubjectDigest,
    origin: p.origin,
    locatorId: p.locatorId,
    outcome,
    observationDigest: "a".repeat(64),
    screenshotDigest: "b".repeat(64),
    evidenceLane: "BROWSER",
    evidenceClass: "BROWSER_FIXTURE",
    canonicalWriteMode: "OBSERVATION_ONLY",
    liveBrowserState: "NOT_EXERCISED",
    cleanupState: "CLEAN",
  };
}

function readback(p: ReturnType<typeof packet>): BrowserReadback {
  return {
    schema: "agent-shield/dual-agent-route/browser-readback/v1",
    requestId: p.requestId,
    actionId: p.actionId,
    routeSubjectDigest: p.routeSubjectDigest,
    origin: p.origin,
    targetDigest: "c".repeat(64),
    verified: true,
    evidenceLane: "BROWSER",
    evidenceClass: "BROWSER_READBACK_FIXTURE",
    liveReadbackState: "NOT_EXERCISED",
    cleanupState: "CLEAN",
  };
}

const readPacket = packet(false);
if (readPacket.fallbackReason !== "API_ABSENT" || readPacket.executionSurface !== "DECLARED_ACTION_ONLY") throw new Error("fallback packet failed");
if (classifyBrowserObservation(readPacket, observation(readPacket)).effectStateProposal !== "NONE") throw new Error("read-only browser created effect");
console.log("P1: PASS bounded read-only browser fallback");

const writePacket = packet(true);
const writeObs = observation(writePacket);
if (classifyBrowserObservation(writePacket, writeObs).effectStateProposal !== "EFFECT_OBSERVED_PENDING_READBACK") throw new Error("write observation failed");
const proposal = proposeBrowserEffectCommit(writePacket, writeObs, readback(writePacket));
if (proposal.canonicalWriteMode !== "PROPOSAL_ONLY" || proposal.externalEffectState !== "NOT_EXERCISED") throw new Error("browser effect authority widened");
console.log("P2: PASS browser write requires readback and emits proposal only");

const timeout = observation(writePacket, "TIMEOUT");
if (classifyBrowserObservation(writePacket, timeout).effectStateProposal !== "RESULT_UNKNOWN") throw new Error("timeout not unknown");
expect("RESULT_UNKNOWN_COMMIT_FORBIDDEN", () => proposeBrowserEffectCommit(writePacket, timeout, readback(writePacket)));
console.log("P3: PASS browser timeout stays RESULT_UNKNOWN");

const admittedApi = fixedRequest();
expect("FALLBACK_DESPITE_ADMITTED_API", () => buildBrowserAttempt(admittedApi, { ...selectRoute(admittedApi), selected: "BROWSER", reason: "API_ABSENT" }, {
  origin: "https://example.invalid", locatorId: "records.read.panel", sessionHandle: "secret://session/demo",
}));

const rawSession = fallbackRequest();
expect("RAW_SESSION_MATERIAL", () => buildBrowserAttempt(rawSession, selectRoute(rawSession), {
  origin: "https://example.invalid", locatorId: "records.read.panel", sessionHandle: "cookie=session",
}));

const wildcard = fallbackRequest();
expect("WILDCARD_BROWSER_SURFACE", () => buildBrowserAttempt(wildcard, selectRoute(wildcard), {
  origin: "https://example.invalid", locatorId: "css:*", sessionHandle: "secret://session/demo",
}));

const badOrigin = fallbackRequest();
expect("BROWSER_ORIGIN_INVALID", () => buildBrowserAttempt(badOrigin, selectRoute(badOrigin), {
  origin: "http://localhost:9222", locatorId: "records.read.panel", sessionHandle: "secret://session/demo",
}));

const apiEvidence = observation(writePacket);
(apiEvidence.evidenceLane as string) = "API";
expect("API_AS_BROWSER_EVIDENCE", () => classifyBrowserObservation(writePacket, apiEvidence));

const promoted = observation(writePacket);
(promoted.liveBrowserState as string) = "PASS";
expect("PACKAGE_PRESENCE_AS_LIVE_BROWSER", () => classifyBrowserObservation(writePacket, promoted));

const selfCommit = observation(writePacket);
(selfCommit.canonicalWriteMode as string) = "CANONICAL_WRITE";
expect("BROWSER_SELF_COMMIT", () => classifyBrowserObservation(writePacket, selfCommit));

const dirty = observation(writePacket);
dirty.cleanupState = "DIRTY";
expect("BROWSER_CLEANUP_RESIDUE", () => classifyBrowserObservation(writePacket, dirty));

const wrong = observation(writePacket);
wrong.origin = "https://other.invalid";
expect("BROWSER_OBSERVATION_SUBJECT_MISMATCH", () => classifyBrowserObservation(writePacket, wrong));

const readbackApi = readback(writePacket);
(readbackApi.evidenceLane as string) = "API";
expect("API_AS_BROWSER_EVIDENCE", () => validateBrowserReadback(writePacket, readbackApi));

const liveReadback = readback(writePacket);
(liveReadback.liveReadbackState as string) = "PASS";
expect("FIXTURE_AS_LIVE_BROWSER_READBACK", () => validateBrowserReadback(writePacket, liveReadback));

const noReadback = packet(true);
expect("BROWSER_READBACK_REQUIRED", () => proposeBrowserEffectCommit(noReadback, observation(noReadback), null));

console.log("PASS: DA-INT-BR bounded browser fallback positive paths + planted disagreement controls");
