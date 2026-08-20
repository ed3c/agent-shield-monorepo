import {
  RoutePolicyError,
  decideWithPolicy,
  fixedObservation,
  validateCapabilityObservation,
} from "./gate.ts";
import {
  BETTOR_EFFECT_CONTRACT,
  RouteContractError,
  fixedRequest,
  type RouteRequest,
} from "../contract.ts";

function expect(code: string, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    if ((error instanceof RoutePolicyError || error instanceof RouteContractError) && error.code === code) {
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
const apiObs = fixedObservation(api, "API");
const browserObs = fixedObservation(api, "BROWSER");
const apiReceipt = decideWithPolicy(api, apiObs, browserObs);
if (apiReceipt.selected !== "API" || apiReceipt.reason !== "API_FIRST") throw new Error("API-first policy failed");
if (apiReceipt.latencyUsedForSelection || apiReceipt.providerHealthUsedForSelection) throw new Error("observation authority leaked into selection");
console.log("P1: PASS API selected despite browser lower-latency fixture");

const absent = fixedRequest();
absent.api.admissionState = "ABSENT";
const absentReceipt = decideWithPolicy(absent, fixedObservation(absent, "API"), fixedObservation(absent, "BROWSER"));
if (absentReceipt.selected !== "BROWSER" || absentReceipt.reason !== "API_ABSENT") throw new Error("typed fallback failed");
console.log("P2: PASS typed API absence permits browser fallback");

const write = writeRequest();
const writeReceipt = decideWithPolicy(write, fixedObservation(write, "API"), fixedObservation(write, "BROWSER"));
if (!writeReceipt.effectRequirementPreserved) throw new Error("effect requirement lost");
console.log("P3: PASS write route preserves canonical effect admission requirement");

expect("PROVIDER_HEALTH_AS_POLICY", () => decideWithPolicy(api, apiObs, browserObs, "PROVIDER_HEALTH"));
expect("LATENCY_AS_POLICY", () => decideWithPolicy(api, apiObs, browserObs, "LOWEST_LATENCY"));
expect("PACKAGE_PRESENCE_AS_ADMISSION", () => decideWithPolicy(api, apiObs, browserObs, "PACKAGE_PRESENCE"));
expect("WORKER_SELECTION_WIDENING", () => decideWithPolicy(api, apiObs, browserObs, "WORKER_PREFERENCE"));

const drift = fixedObservation(api, "API");
drift.routeSubjectDigest = "0".repeat(64);
expect("MUTABLE_ROUTE_SUBJECT", () => validateCapabilityObservation(api, drift));

const scope = fixedObservation(api, "API");
scope.actionId = "records.delete";
expect("ACTION_SCOPE_WIDENING", () => validateCapabilityObservation(api, scope));

const admissionDrift = fixedObservation(api, "API");
admissionDrift.admissionState = "ABSENT";
expect("CAPABILITY_OBSERVATION_DRIFT", () => validateCapabilityObservation(api, admissionDrift));

const live = fixedObservation(api, "API");
(live.liveState as string) = "PASS";
expect("PACKAGE_PRESENCE_AS_ADMISSION", () => validateCapabilityObservation(api, live));

const widened = fixedObservation(api, "API");
(widened.selectionAuthority as string) = "PROVIDER_HEALTH";
expect("PROVIDER_HEALTH_AS_POLICY", () => validateCapabilityObservation(api, widened));

const wrongLane = fixedObservation(api, "BROWSER");
expect("ROUTE_EVIDENCE_LAUNDERING", () => decideWithPolicy(api, wrongLane, fixedObservation(api, "API")));

const noEffect = writeRequest();
noEffect.effectBinding = null;
expect("EFFECT_BINDING_REQUIRED", () => decideWithPolicy(noEffect, fixedObservation(noEffect, "API"), fixedObservation(noEffect, "BROWSER")));

const forced = fixedRequest();
forced.routeHint = "BROWSER";
expect("FALLBACK_DESPITE_ADMITTED_API", () => decideWithPolicy(forced, fixedObservation(forced, "API"), fixedObservation(forced, "BROWSER")));

console.log("PASS: DA-INT-POL route-selection policy positive paths + planted disagreement controls");
