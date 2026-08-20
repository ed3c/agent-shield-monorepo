import {
  BETTOR_EFFECT_CONTRACT,
  RouteContractError,
  fixedRequest,
  makeReceipt,
  selectRoute,
  validateReceipt,
  type RouteRequest,
} from "./contract.ts";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function expect(code: string, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof RouteContractError && error.code === code) {
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

const api = fixedRequest();
const apiDecision = selectRoute(api);
if (apiDecision.selected !== "API" || apiDecision.reason !== "API_FIRST") throw new Error("API-first selection failed");
validateReceipt(makeReceipt(api, apiDecision), "API");
console.log("P1: PASS admitted API is selected first");

const absent = fixedRequest();
absent.api.admissionState = "ABSENT";
const absentDecision = selectRoute(absent);
if (absentDecision.selected !== "BROWSER" || absentDecision.reason !== "API_ABSENT") throw new Error("API absence fallback failed");
validateReceipt(makeReceipt(absent, absentDecision), "BROWSER");
console.log("P2: PASS API absence uses explicitly admitted browser fallback");

const unsupported = fixedRequest();
unsupported.actionId = "records.export";
unsupported.api.actionIds = ["records.read"];
unsupported.browser.actionIds = ["records.read", "records.export"];
const unsupportedDecision = selectRoute(unsupported);
if (unsupportedDecision.selected !== "BROWSER" || unsupportedDecision.reason !== "API_UNSUPPORTED_ACTION") throw new Error("unsupported-action fallback failed");
console.log("P3: PASS unsupported API action uses bounded browser fallback");

const write = writeRequest();
const writeDecision = selectRoute(write);
if (writeDecision.effectMode !== "EFFECT_ADMISSION_REQUEST") throw new Error("write effect binding missing");
console.log("P4: PASS write action binds canonical effect admission only");

const forcedBrowser = fixedRequest();
forcedBrowser.routeHint = "BROWSER";
expect("FALLBACK_DESPITE_ADMITTED_API", () => selectRoute(forcedBrowser));

const noFallback = fixedRequest();
noFallback.api.admissionState = "ABSENT";
noFallback.policy.browserFallbackAllowed = false;
expect("NO_ADMITTED_ROUTE", () => selectRoute(noFallback));

const raw = fixedRequest();
raw.browser.authHandle = "cookie=session-value";
expect("RAW_AUTH_MATERIAL", () => selectRoute(raw));

const wildcard = fixedRequest();
wildcard.api.actionIds = ["records.*"];
expect("WILDCARD_ACTION", () => selectRoute(wildcard));

const mutable = fixedRequest();
mutable.api.subject.commit = "main";
expect("MUTABLE_ROUTE_SUBJECT", () => selectRoute(mutable));

const live = fixedRequest();
(live.externalStates.apiExecution as string) = "PASS";
expect("PACKAGE_PRESENCE_AS_LIVE", () => selectRoute(live));

const bypass = writeRequest();
if (!bypass.effectBinding) throw new Error("fixture error");
(bypass.effectBinding.owner as string) = "provider-demo";
expect("EFFECT_OWNER_BYPASS", () => selectRoute(bypass));

const apiReceipt = makeReceipt(api, apiDecision);
expect("ROUTE_EVIDENCE_SUBSTITUTION", () => validateReceipt(apiReceipt, "BROWSER"));

const promotedReceipt = clone(apiReceipt);
(promotedReceipt.observationState as string) = "PASS";
expect("PACKAGE_PRESENCE_AS_LIVE", () => validateReceipt(promotedReceipt, "API"));

const selfCommit = clone(apiReceipt);
(selfCommit.canonicalWriteMode as string) = "CANONICAL_WRITE";
expect("PROVIDER_SELF_COMMIT", () => validateReceipt(selfCommit, "API"));

const hintConflict = fixedRequest();
hintConflict.api.admissionState = "ABSENT";
hintConflict.routeHint = "API";
expect("ROUTE_HINT_CONFLICT", () => selectRoute(hintConflict));

console.log("PASS: DA-INT-C route contract positive paths + planted disagreement controls");
