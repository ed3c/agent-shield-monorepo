import {
  BETTOR_EFFECT_CONTRACT,
  RouteContractError,
  digest,
  selectRoute,
  validateRequest,
  type EffectBinding,
  type FallbackReason,
  type RouteDecision,
  type RouteRequest,
} from "../contract.ts";

export const BROWSER_ATTEMPT_SCHEMA = "agent-shield/dual-agent-route/browser-attempt/v1" as const;
export const BROWSER_OBSERVATION_SCHEMA = "agent-shield/dual-agent-route/browser-observation/v1" as const;
export const BROWSER_READBACK_SCHEMA = "agent-shield/dual-agent-route/browser-readback/v1" as const;

export type BrowserOutcome = "SUCCESS" | "FAILURE" | "TIMEOUT" | "CONNECTION_LOST";

export interface BrowserAttemptPacket {
  schema: typeof BROWSER_ATTEMPT_SCHEMA;
  requestId: string;
  tenantScope: string;
  actionId: string;
  actionClass: RouteRequest["actionClass"];
  fallbackReason: FallbackReason;
  routeSubjectDigest: string;
  browserSubject: RouteRequest["browser"]["subject"];
  toolSubject: RouteRequest["browser"]["toolSubject"];
  origin: string;
  locatorId: string;
  sessionHandle: string;
  effectBinding: EffectBinding | null;
  timeoutMs: number;
  maxOutputBytes: number;
  maxArtifactBytes: number;
  executionSurface: "DECLARED_ACTION_ONLY";
  canonicalWriteMode: "OBSERVATION_ONLY";
  liveBrowserState: "NOT_EXERCISED";
}

export interface BrowserObservation {
  schema: typeof BROWSER_OBSERVATION_SCHEMA;
  requestId: string;
  actionId: string;
  routeSubjectDigest: string;
  origin: string;
  locatorId: string;
  outcome: BrowserOutcome;
  observationDigest: string;
  screenshotDigest: string | null;
  evidenceLane: "BROWSER";
  evidenceClass: "BROWSER_FIXTURE";
  canonicalWriteMode: "OBSERVATION_ONLY";
  liveBrowserState: "NOT_EXERCISED";
  cleanupState: "CLEAN" | "DIRTY";
}

export interface BrowserReadback {
  schema: typeof BROWSER_READBACK_SCHEMA;
  requestId: string;
  actionId: string;
  routeSubjectDigest: string;
  origin: string;
  targetDigest: string;
  verified: true;
  evidenceLane: "BROWSER";
  evidenceClass: "BROWSER_READBACK_FIXTURE";
  liveReadbackState: "NOT_EXERCISED";
  cleanupState: "CLEAN";
}

export interface BrowserEffectProposal {
  mode: "EFFECT_COMMIT_PROPOSAL";
  effectOwner: typeof BETTOR_EFFECT_CONTRACT.owner;
  effectContractCommit: typeof BETTOR_EFFECT_CONTRACT.commit;
  effectIntentDigest: string;
  requestId: string;
  actionId: string;
  routeSubjectDigest: string;
  observationDigest: string;
  readbackDigest: string;
  canonicalWriteMode: "PROPOSAL_ONLY";
  externalEffectState: "NOT_EXERCISED";
  evidenceCeiling: "DETERMINISTIC_BROWSER_FALLBACK_ONLY";
}

export class BrowserAdapterError extends Error {
  constructor(public readonly code: string, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const H64 = /^[0-9a-f]{64}$/;
const SAFE_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;
const SAFE_LOCATOR = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const SENSITIVE_KEY = /(cookie|password|raw[_-]?secret|secret[_-]?value|token[_-]?value|credential[_-]?value|profile[_-]?bytes|storage[_-]?state)/i;

function refuse(code: string, detail = ""): never {
  throw new BrowserAdapterError(code, detail);
}

function h64(value: string, code: string): void {
  if (!H64.test(value)) refuse(code);
}

function scanSensitive(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) scanSensitive(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) refuse("RAW_SESSION_MATERIAL", key);
      scanSensitive(item);
    }
  }
}

export function buildBrowserAttempt(
  request: RouteRequest,
  decision: RouteDecision = selectRoute(request),
  options: {
    origin: string;
    locatorId: string;
    sessionHandle: string;
    timeoutMs?: number;
    maxOutputBytes?: number;
    maxArtifactBytes?: number;
  },
): BrowserAttemptPacket {
  validateRequest(request);
  const apiSupportsAction = request.api.admissionState === "ADMITTED" && request.api.actionIds.includes(request.actionId);
  if (apiSupportsAction) refuse("FALLBACK_DESPITE_ADMITTED_API");
  if (decision.selected !== "BROWSER" || decision.reason === "API_FIRST") refuse("BROWSER_ROUTE_NOT_ADMITTED");
  if (request.browser.admissionState !== "ADMITTED" || !request.browser.actionIds.includes(request.actionId)) {
    refuse("BROWSER_ROUTE_NOT_ADMITTED");
  }
  if (decision.routeSubjectDigest !== digest(request.browser.subject)) refuse("BROWSER_ROUTE_SUBJECT_MISMATCH");
  if (!SAFE_ORIGIN.test(options.origin)) refuse("BROWSER_ORIGIN_INVALID");
  if (!SAFE_LOCATOR.test(options.locatorId) || /[\s*#[\]()=>]/.test(options.locatorId)) refuse("WILDCARD_BROWSER_SURFACE");
  if (!options.sessionHandle.startsWith("secret://session/")) refuse("RAW_SESSION_MATERIAL");
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxOutputBytes = options.maxOutputBytes ?? 1_048_576;
  const maxArtifactBytes = options.maxArtifactBytes ?? 4_194_304;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) refuse("BROWSER_LIMIT_INVALID");
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0 || maxOutputBytes > 8_388_608) refuse("BROWSER_LIMIT_INVALID");
  if (!Number.isInteger(maxArtifactBytes) || maxArtifactBytes <= 0 || maxArtifactBytes > 16_777_216) refuse("BROWSER_LIMIT_INVALID");
  const packet: BrowserAttemptPacket = {
    schema: BROWSER_ATTEMPT_SCHEMA,
    requestId: request.requestId,
    tenantScope: request.tenantScope,
    actionId: request.actionId,
    actionClass: request.actionClass,
    fallbackReason: decision.reason,
    routeSubjectDigest: decision.routeSubjectDigest,
    browserSubject: request.browser.subject,
    toolSubject: request.browser.toolSubject,
    origin: options.origin,
    locatorId: options.locatorId,
    sessionHandle: options.sessionHandle,
    effectBinding: request.effectBinding,
    timeoutMs,
    maxOutputBytes,
    maxArtifactBytes,
    executionSurface: "DECLARED_ACTION_ONLY",
    canonicalWriteMode: "OBSERVATION_ONLY",
    liveBrowserState: "NOT_EXERCISED",
  };
  scanSensitive({ ...packet, sessionHandle: undefined });
  return packet;
}

export function classifyBrowserObservation(packet: BrowserAttemptPacket, observation: BrowserObservation): {
  effectStateProposal: "NONE" | "EFFECT_OBSERVED_PENDING_READBACK" | "RESULT_UNKNOWN" | "ATTEMPT_FAILED";
  receiptDigest: string;
  evidenceCeiling: "DETERMINISTIC_BROWSER_FALLBACK_ONLY";
} {
  if (packet.schema !== BROWSER_ATTEMPT_SCHEMA || observation.schema !== BROWSER_OBSERVATION_SCHEMA) refuse("BROWSER_SCHEMA_MISMATCH");
  scanSensitive(observation);
  if (
    observation.requestId !== packet.requestId ||
    observation.actionId !== packet.actionId ||
    observation.routeSubjectDigest !== packet.routeSubjectDigest ||
    observation.origin !== packet.origin ||
    observation.locatorId !== packet.locatorId
  ) {
    refuse("BROWSER_OBSERVATION_SUBJECT_MISMATCH");
  }
  if (observation.evidenceLane !== "BROWSER" || observation.evidenceClass !== "BROWSER_FIXTURE") refuse("API_AS_BROWSER_EVIDENCE");
  if (observation.liveBrowserState !== "NOT_EXERCISED") refuse("PACKAGE_PRESENCE_AS_LIVE_BROWSER");
  if (observation.canonicalWriteMode !== "OBSERVATION_ONLY") refuse("BROWSER_SELF_COMMIT");
  if (observation.cleanupState !== "CLEAN") refuse("BROWSER_CLEANUP_RESIDUE");
  h64(observation.observationDigest, "BROWSER_OBSERVATION_DIGEST_INVALID");
  if (observation.screenshotDigest !== null) h64(observation.screenshotDigest, "BROWSER_ARTIFACT_DIGEST_INVALID");
  if (!["SUCCESS", "FAILURE", "TIMEOUT", "CONNECTION_LOST"].includes(observation.outcome)) refuse("BROWSER_OUTCOME_INVALID");

  let effectStateProposal: "NONE" | "EFFECT_OBSERVED_PENDING_READBACK" | "RESULT_UNKNOWN" | "ATTEMPT_FAILED" = "NONE";
  if (packet.effectBinding) {
    if (observation.outcome === "SUCCESS") effectStateProposal = "EFFECT_OBSERVED_PENDING_READBACK";
    else if (observation.outcome === "FAILURE") effectStateProposal = "ATTEMPT_FAILED";
    else effectStateProposal = "RESULT_UNKNOWN";
  }
  return {
    effectStateProposal,
    receiptDigest: digest(observation),
    evidenceCeiling: "DETERMINISTIC_BROWSER_FALLBACK_ONLY",
  };
}

export function validateBrowserReadback(packet: BrowserAttemptPacket, readback: BrowserReadback): BrowserReadback {
  if (!packet.effectBinding) refuse("READBACK_WITHOUT_EFFECT");
  if (readback.schema !== BROWSER_READBACK_SCHEMA) refuse("BROWSER_READBACK_SCHEMA_MISMATCH");
  if (
    readback.requestId !== packet.requestId ||
    readback.actionId !== packet.actionId ||
    readback.routeSubjectDigest !== packet.routeSubjectDigest ||
    readback.origin !== packet.origin
  ) {
    refuse("BROWSER_READBACK_SUBJECT_MISMATCH");
  }
  if (readback.evidenceLane !== "BROWSER" || readback.evidenceClass !== "BROWSER_READBACK_FIXTURE") refuse("API_AS_BROWSER_EVIDENCE");
  if (readback.liveReadbackState !== "NOT_EXERCISED") refuse("FIXTURE_AS_LIVE_BROWSER_READBACK");
  if (readback.cleanupState !== "CLEAN") refuse("BROWSER_CLEANUP_RESIDUE");
  h64(readback.targetDigest, "BROWSER_READBACK_DIGEST_INVALID");
  return readback;
}

export function proposeBrowserEffectCommit(
  packet: BrowserAttemptPacket,
  observation: BrowserObservation,
  readback: BrowserReadback | null,
): BrowserEffectProposal {
  if (!packet.effectBinding) refuse("EFFECT_BINDING_REQUIRED");
  const classified = classifyBrowserObservation(packet, observation);
  if (classified.effectStateProposal === "RESULT_UNKNOWN") refuse("RESULT_UNKNOWN_COMMIT_FORBIDDEN");
  if (classified.effectStateProposal !== "EFFECT_OBSERVED_PENDING_READBACK") refuse("BROWSER_COMMIT_NOT_ADMISSIBLE");
  if (!readback) refuse("BROWSER_READBACK_REQUIRED");
  validateBrowserReadback(packet, readback);
  if (
    packet.effectBinding.owner !== BETTOR_EFFECT_CONTRACT.owner ||
    packet.effectBinding.commit !== BETTOR_EFFECT_CONTRACT.commit ||
    packet.effectBinding.canonicalWriteMode !== "PROPOSAL_ONLY"
  ) {
    refuse("EFFECT_OWNER_BYPASS");
  }
  return {
    mode: "EFFECT_COMMIT_PROPOSAL",
    effectOwner: BETTOR_EFFECT_CONTRACT.owner,
    effectContractCommit: BETTOR_EFFECT_CONTRACT.commit,
    effectIntentDigest: packet.effectBinding.effectIntentDigest,
    requestId: packet.requestId,
    actionId: packet.actionId,
    routeSubjectDigest: packet.routeSubjectDigest,
    observationDigest: observation.observationDigest,
    readbackDigest: readback.targetDigest,
    canonicalWriteMode: "PROPOSAL_ONLY",
    externalEffectState: "NOT_EXERCISED",
    evidenceCeiling: "DETERMINISTIC_BROWSER_FALLBACK_ONLY",
  };
}

export function asBrowserError(error: unknown): string {
  if (error instanceof BrowserAdapterError || error instanceof RouteContractError) return error.message;
  return String(error);
}
