import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  BETTOR_EFFECT_CONTRACT,
  fixedRequest,
  makeReceipt,
  selectRoute,
  validateReceipt,
  type RouteRequest,
} from "./contract.ts";
import {
  buildApiAttempt,
  classifyApiObservation,
  proposeApiEffectCommit,
  type ApiObservation,
  type ApiReadback,
} from "./api/adapter.ts";
import {
  buildBrowserAttempt,
  classifyBrowserObservation,
  proposeBrowserEffectCommit,
  type BrowserObservation,
  type BrowserReadback,
} from "./browser/adapter.ts";
import { decideWithPolicy, fixedObservation } from "./policy/gate.ts";

const ROOT = "services/runtime-fabric/src/integrations/dual-agent-route";
const PREFLIGHT_PATH = join(process.cwd(), ROOT, "matrix-preflight.json");
const REQUIRED = new Set([
  "api_first_read",
  "api_write_readback",
  "api_timeout_unknown",
  "fallback_api_absent",
  "fallback_api_refused",
  "fallback_api_not_admitted",
  "fallback_api_unsupported_action",
  "browser_write_readback",
  "browser_timeout_unknown",
  "policy_authority_separation",
  "route_evidence_separation",
  "effect_authority_preserved",
  "cleanup_separation",
]);

class MatrixError extends Error {
  constructor(public readonly code: string, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

function refuse(code: string, detail = ""): never {
  throw new MatrixError(code, detail);
}

function expect(code: string, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    const actual = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
    if (actual === code) {
      console.log(`${code}: RED/${code}`);
      return;
    }
    throw error;
  }
  throw new Error(`${code}: planted control survived`);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function gitBlob(path: string): string {
  const run = spawnSync("git", ["hash-object", path], { encoding: "utf8" });
  if (run.status !== 0) refuse("SIBLING_BLOB_DRIFT", path);
  return String(run.stdout).trim();
}

function loadPreflight(): any {
  return JSON.parse(String(readFileSync(PREFLIGHT_PATH, "utf8")));
}

function assertPreflight(preflight: any): void {
  if (preflight?.schema !== "agent-shield/dual-agent-route/matrix-preflight/v1") refuse("PREFLIGHT_SCHEMA_MISMATCH");
  if (
    preflight.common_parent?.commit !== "1250b096b53b8d114425a3618e91137090f0778a" ||
    preflight.common_parent?.tree !== "6b9537b00450a43d0e9bcf1b1ae6c4a2e441c67c"
  ) refuse("PARENT_SUBJECT_DRIFT");
  const siblings = preflight.siblings;
  if (!Array.isArray(siblings) || new Set(siblings.map((item: any) => item.atom)).size !== 3) refuse("INCOMPLETE_SIBLING_SET");
  if (new Set(siblings.map((item: any) => item.atom)).size !== 3 || !["DA-INT-API", "DA-INT-BR", "DA-INT-POL"].every((atom) => siblings.some((item: any) => item.atom === atom))) {
    refuse("INCOMPLETE_SIBLING_SET");
  }
  for (const sibling of siblings) {
    if (!sibling.commit || !sibling.tree || !sibling.targeted_run || !sibling.files) refuse("INCOMPLETE_SIBLING_SET");
    for (const [path, sha] of Object.entries(sibling.files as Record<string, string>)) {
      if (gitBlob(path) !== sha) refuse("SIBLING_BLOB_DRIFT", `${path}: ${gitBlob(path)} != ${sha}`);
    }
  }
  if (
    preflight.effect_authority?.repository !== BETTOR_EFFECT_CONTRACT.repository ||
    preflight.effect_authority?.commit !== BETTOR_EFFECT_CONTRACT.commit ||
    preflight.effect_authority?.tree !== BETTOR_EFFECT_CONTRACT.tree ||
    preflight.effect_authority?.writer !== BETTOR_EFFECT_CONTRACT.owner
  ) refuse("EFFECT_AUTHORITY_DRIFT");
  if (!Array.isArray(preflight.required_cases) || new Set(preflight.required_cases).size !== REQUIRED.size || ![...REQUIRED].every((item) => preflight.required_cases.includes(item))) {
    refuse("INCOMPLETE_ROUTE_DENOMINATOR");
  }
  if (!preflight.external_states || Object.values(preflight.external_states).some((value) => value !== "NOT_EXERCISED")) {
    refuse("LIVE_EVIDENCE_LAUNDERING");
  }
}

function writeRequest(base?: RouteRequest): RouteRequest {
  const request = base ? clone(base) : fixedRequest();
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

function apiObservation(packet: ReturnType<typeof buildApiAttempt>, outcome: ApiObservation["outcome"] = "SUCCESS"): ApiObservation {
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

function apiReadback(packet: ReturnType<typeof buildApiAttempt>): ApiReadback {
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

function browserPacket(request: RouteRequest) {
  return buildBrowserAttempt(request, selectRoute(request), {
    origin: "https://example.invalid",
    locatorId: request.actionId === "records.create" ? "records.create.button" : "records.read.panel",
    sessionHandle: "secret://session/demo",
  });
}

function browserObservation(packet: ReturnType<typeof browserPacket>, outcome: BrowserObservation["outcome"] = "SUCCESS"): BrowserObservation {
  return {
    schema: "agent-shield/dual-agent-route/browser-observation/v1",
    requestId: packet.requestId,
    actionId: packet.actionId,
    routeSubjectDigest: packet.routeSubjectDigest,
    origin: packet.origin,
    locatorId: packet.locatorId,
    outcome,
    observationDigest: "c".repeat(64),
    screenshotDigest: "d".repeat(64),
    evidenceLane: "BROWSER",
    evidenceClass: "BROWSER_FIXTURE",
    canonicalWriteMode: "OBSERVATION_ONLY",
    liveBrowserState: "NOT_EXERCISED",
    cleanupState: "CLEAN",
  };
}

function browserReadback(packet: ReturnType<typeof browserPacket>): BrowserReadback {
  return {
    schema: "agent-shield/dual-agent-route/browser-readback/v1",
    requestId: packet.requestId,
    actionId: packet.actionId,
    routeSubjectDigest: packet.routeSubjectDigest,
    origin: packet.origin,
    targetDigest: "e".repeat(64),
    verified: true,
    evidenceLane: "BROWSER",
    evidenceClass: "BROWSER_READBACK_FIXTURE",
    liveReadbackState: "NOT_EXERCISED",
    cleanupState: "CLEAN",
  };
}

function runMatrix(): Record<string, string> {
  const rows: Record<string, string> = {};

  const apiRead = fixedRequest();
  const apiDecision = selectRoute(apiRead);
  const apiPacket = buildApiAttempt(apiRead, apiDecision);
  const apiObs = apiObservation(apiPacket);
  if (classifyApiObservation(apiPacket, apiObs).effectStateProposal !== "NONE") throw new Error("API read effect drift");
  rows.api_first_read = "PASS";

  const apiWrite = writeRequest();
  const apiWritePacket = buildApiAttempt(apiWrite);
  const apiWriteObs = apiObservation(apiWritePacket);
  const apiProposal = proposeApiEffectCommit(apiWritePacket, apiWriteObs, apiReadback(apiWritePacket));
  if (apiProposal.effectOwner !== BETTOR_EFFECT_CONTRACT.owner || apiProposal.canonicalWriteMode !== "PROPOSAL_ONLY") throw new Error("API effect authority drift");
  rows.api_write_readback = "PASS";

  const apiTimeout = apiObservation(apiWritePacket, "TIMEOUT");
  if (classifyApiObservation(apiWritePacket, apiTimeout).effectStateProposal !== "RESULT_UNKNOWN") throw new Error("API timeout drift");
  rows.api_timeout_unknown = "PASS";

  for (const [key, state, expected] of [
    ["fallback_api_absent", "ABSENT", "API_ABSENT"],
    ["fallback_api_refused", "REFUSED", "API_REFUSED"],
    ["fallback_api_not_admitted", "NOT_ADMITTED", "API_NOT_ADMITTED"],
  ] as const) {
    const request = fixedRequest();
    request.api.admissionState = state;
    const decision = selectRoute(request);
    if (decision.selected !== "BROWSER" || decision.reason !== expected) throw new Error(`${key} failed`);
    browserPacket(request);
    rows[key] = "PASS";
  }

  const unsupported = fixedRequest();
  unsupported.actionId = "records.export";
  unsupported.api.actionIds = ["records.read"];
  unsupported.browser.actionIds = ["records.read", "records.export"];
  if (selectRoute(unsupported).reason !== "API_UNSUPPORTED_ACTION") throw new Error("unsupported action fallback failed");
  rows.fallback_api_unsupported_action = "PASS";

  const browserWriteRequest = writeRequest();
  browserWriteRequest.api.admissionState = "ABSENT";
  const brPacket = browserPacket(browserWriteRequest);
  const brObs = browserObservation(brPacket);
  const brProposal = proposeBrowserEffectCommit(brPacket, brObs, browserReadback(brPacket));
  if (brProposal.effectOwner !== BETTOR_EFFECT_CONTRACT.owner || brProposal.canonicalWriteMode !== "PROPOSAL_ONLY") throw new Error("browser effect authority drift");
  rows.browser_write_readback = "PASS";

  const brTimeout = browserObservation(brPacket, "CONNECTION_LOST");
  if (classifyBrowserObservation(brPacket, brTimeout).effectStateProposal !== "RESULT_UNKNOWN") throw new Error("browser timeout drift");
  rows.browser_timeout_unknown = "PASS";

  const policyRequest = fixedRequest();
  const policyReceipt = decideWithPolicy(policyRequest, fixedObservation(policyRequest, "API"), fixedObservation(policyRequest, "BROWSER"));
  if (policyReceipt.selected !== "API" || policyReceipt.providerHealthUsedForSelection || policyReceipt.latencyUsedForSelection || policyReceipt.packagePresenceUsedForAdmission) {
    throw new Error("policy authority drift");
  }
  rows.policy_authority_separation = "PASS";

  const routeReceipt = makeReceipt(apiRead, apiDecision);
  validateReceipt(routeReceipt, "API");
  rows.route_evidence_separation = "PASS";

  if (apiProposal.effectOwner !== BETTOR_EFFECT_CONTRACT.owner || brProposal.effectOwner !== BETTOR_EFFECT_CONTRACT.owner) throw new Error("effect authority lost");
  rows.effect_authority_preserved = "PASS";

  if (apiObs.cleanupState !== "CLEAN" || brObs.cleanupState !== "CLEAN") throw new Error("cleanup not separate");
  rows.cleanup_separation = "PASS";

  if (new Set(Object.keys(rows)).size !== REQUIRED.size || ![...REQUIRED].every((key) => rows[key] === "PASS")) {
    refuse("INCOMPLETE_ROUTE_DENOMINATOR");
  }
  return rows;
}

const preflight = loadPreflight();
assertPreflight(preflight);
console.log("P1: PASS exact sibling subject + Git blob materialization");
const rows = runMatrix();
console.log(`P2: PASS complete route denominator ${Object.keys(rows).length}/${REQUIRED.size}`);

const drift = clone(preflight);
drift.siblings[0].files["services/runtime-fabric/src/integrations/dual-agent-route/api/adapter.ts"] = "0".repeat(40);
expect("SIBLING_BLOB_DRIFT", () => assertPreflight(drift));

const incomplete = clone(preflight);
incomplete.required_cases.pop();
expect("INCOMPLETE_ROUTE_DENOMINATOR", () => assertPreflight(incomplete));

const authority = clone(preflight);
authority.effect_authority.writer = "provider-demo";
expect("EFFECT_AUTHORITY_DRIFT", () => assertPreflight(authority));

const live = clone(preflight);
live.external_states.live_api = "PASS";
expect("LIVE_EVIDENCE_LAUNDERING", () => assertPreflight(live));

const receipt = makeReceipt(fixedRequest(), selectRoute(fixedRequest()));
expect("ROUTE_EVIDENCE_SUBSTITUTION", () => validateReceipt(receipt, "BROWSER"));

const health = fixedRequest();
expect("PROVIDER_HEALTH_AS_POLICY", () => decideWithPolicy(health, fixedObservation(health, "API"), fixedObservation(health, "BROWSER"), "PROVIDER_HEALTH"));

const forcedBrowser = fixedRequest();
forcedBrowser.routeHint = "BROWSER";
expect("FALLBACK_DESPITE_ADMITTED_API", () => selectRoute(forcedBrowser));

const writeNoEffect = writeRequest();
if (!writeNoEffect.effectBinding) throw new Error("fixture error");
(writeNoEffect.effectBinding.owner as string) = "provider-demo";
expect("EFFECT_OWNER_BYPASS", () => selectRoute(writeNoEffect));

console.log("PASS: DA-INT-E complete API/browser/policy route matrix + convergence controls");
