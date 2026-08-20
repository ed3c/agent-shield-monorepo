import {
  BETTOR_EFFECT_CONTRACT,
  RouteContractError,
  digest,
  selectRoute,
  validateRequest,
  type EffectBinding,
  type RouteDecision,
  type RouteRequest,
} from "../contract.ts";

export const API_ATTEMPT_SCHEMA = "agent-shield/dual-agent-route/api-attempt/v1" as const;
export const API_OBSERVATION_SCHEMA = "agent-shield/dual-agent-route/api-observation/v1" as const;
export const API_READBACK_SCHEMA = "agent-shield/dual-agent-route/api-readback/v1" as const;

export type ApiOutcome = "SUCCESS" | "FAILURE" | "TIMEOUT" | "CONNECTION_LOST";

export interface ApiAttemptPacket {
  schema: typeof API_ATTEMPT_SCHEMA;
  requestId: string;
  tenantScope: string;
  actionId: string;
  actionClass: RouteRequest["actionClass"];
  routeSubjectDigest: string;
  providerSubject: RouteRequest["api"]["subject"];
  toolSubject: RouteRequest["api"]["toolSubject"];
  schemaDigest: string;
  termsDigest: string;
  authHandle: string;
  effectBinding: EffectBinding | null;
  timeoutMs: number;
  maxOutputBytes: number;
  canonicalWriteMode: "OBSERVATION_ONLY";
  liveApiState: "NOT_EXERCISED";
}

export interface ApiObservation {
  schema: typeof API_OBSERVATION_SCHEMA;
  requestId: string;
  actionId: string;
  routeSubjectDigest: string;
  outcome: ApiOutcome;
  responseDigest: string;
  providerNativeIdempotencyObserved: boolean;
  providerNativeIdempotencyIsAuthority: false;
  evidenceLane: "API";
  evidenceClass: "DETERMINISTIC_FIXTURE";
  canonicalWriteMode: "OBSERVATION_ONLY";
  liveApiState: "NOT_EXERCISED";
  cleanupState: "CLEAN" | "DIRTY";
}

export interface ApiReadback {
  schema: typeof API_READBACK_SCHEMA;
  requestId: string;
  actionId: string;
  routeSubjectDigest: string;
  targetDigest: string;
  verified: true;
  evidenceLane: "API";
  evidenceClass: "API_READBACK_FIXTURE";
  liveReadbackState: "NOT_EXERCISED";
  cleanupState: "CLEAN";
}

export interface ApiEffectProposal {
  mode: "EFFECT_COMMIT_PROPOSAL";
  effectOwner: typeof BETTOR_EFFECT_CONTRACT.owner;
  effectContractCommit: typeof BETTOR_EFFECT_CONTRACT.commit;
  effectIntentDigest: string;
  requestId: string;
  actionId: string;
  routeSubjectDigest: string;
  responseDigest: string;
  readbackDigest: string;
  canonicalWriteMode: "PROPOSAL_ONLY";
  externalEffectState: "NOT_EXERCISED";
  evidenceCeiling: "DETERMINISTIC_API_ADAPTER_ONLY";
}

export class ApiAdapterError extends Error {
  constructor(public readonly code: string, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const H64 = /^[0-9a-f]{64}$/;
const SENSITIVE_KEY = /(cookie|password|raw[_-]?secret|secret[_-]?value|token[_-]?value|credential[_-]?value|profile[_-]?bytes)/i;

function refuse(code: string, detail = ""): never {
  throw new ApiAdapterError(code, detail);
}

function scanSensitive(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) scanSensitive(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) refuse("RAW_CREDENTIAL", key);
      scanSensitive(item);
    }
  }
}

function h64(value: string, code: string): void {
  if (!H64.test(value)) refuse(code);
}

export function buildApiAttempt(
  request: RouteRequest,
  decision: RouteDecision = selectRoute(request),
  limits: { timeoutMs: number; maxOutputBytes: number } = { timeoutMs: 30_000, maxOutputBytes: 1_048_576 },
): ApiAttemptPacket {
  validateRequest(request);
  if (decision.selected !== "API" || decision.reason !== "API_FIRST") refuse("API_ROUTE_NOT_ADMITTED");
  if (request.api.admissionState !== "ADMITTED" || !request.api.actionIds.includes(request.actionId)) {
    refuse("API_ROUTE_NOT_ADMITTED");
  }
  if (decision.routeSubjectDigest !== digest(request.api.subject)) refuse("API_ROUTE_SUBJECT_MISMATCH");
  if (!request.api.authHandle.startsWith("secret://")) refuse("RAW_CREDENTIAL");
  if (!Number.isInteger(limits.timeoutMs) || limits.timeoutMs <= 0 || limits.timeoutMs > 120_000) refuse("API_LIMIT_INVALID");
  if (!Number.isInteger(limits.maxOutputBytes) || limits.maxOutputBytes <= 0 || limits.maxOutputBytes > 8_388_608) refuse("API_LIMIT_INVALID");
  const packet: ApiAttemptPacket = {
    schema: API_ATTEMPT_SCHEMA,
    requestId: request.requestId,
    tenantScope: request.tenantScope,
    actionId: request.actionId,
    actionClass: request.actionClass,
    routeSubjectDigest: decision.routeSubjectDigest,
    providerSubject: request.api.subject,
    toolSubject: request.api.toolSubject,
    schemaDigest: request.api.schemaDigest,
    termsDigest: request.api.termsDigest,
    authHandle: request.api.authHandle,
    effectBinding: request.effectBinding,
    timeoutMs: limits.timeoutMs,
    maxOutputBytes: limits.maxOutputBytes,
    canonicalWriteMode: "OBSERVATION_ONLY",
    liveApiState: "NOT_EXERCISED",
  };
  scanSensitive({ ...packet, authHandle: undefined });
  return packet;
}

export function classifyApiObservation(packet: ApiAttemptPacket, observation: ApiObservation): {
  effectStateProposal: "NONE" | "EFFECT_OBSERVED_PENDING_READBACK" | "RESULT_UNKNOWN" | "ATTEMPT_FAILED";
  observationDigest: string;
  evidenceCeiling: "DETERMINISTIC_API_ADAPTER_ONLY";
} {
  if (packet.schema !== API_ATTEMPT_SCHEMA || observation.schema !== API_OBSERVATION_SCHEMA) refuse("API_SCHEMA_MISMATCH");
  scanSensitive(observation);
  if (
    observation.requestId !== packet.requestId ||
    observation.actionId !== packet.actionId ||
    observation.routeSubjectDigest !== packet.routeSubjectDigest
  ) {
    refuse("API_OBSERVATION_SUBJECT_MISMATCH");
  }
  if (observation.evidenceLane !== "API" || observation.evidenceClass !== "DETERMINISTIC_FIXTURE") {
    refuse("BROWSER_AS_API_EVIDENCE");
  }
  if (observation.liveApiState !== "NOT_EXERCISED") refuse("PACKAGE_PRESENCE_AS_LIVE_API");
  if (observation.canonicalWriteMode !== "OBSERVATION_ONLY") refuse("PROVIDER_SELF_COMMIT");
  if (observation.providerNativeIdempotencyIsAuthority !== false) refuse("PROVIDER_IDEMPOTENCY_AS_AUTHORITY");
  if (observation.cleanupState !== "CLEAN") refuse("API_CLEANUP_RESIDUE");
  h64(observation.responseDigest, "API_RESPONSE_DIGEST_INVALID");
  if (!["SUCCESS", "FAILURE", "TIMEOUT", "CONNECTION_LOST"].includes(observation.outcome)) refuse("API_OUTCOME_INVALID");

  let effectStateProposal: "NONE" | "EFFECT_OBSERVED_PENDING_READBACK" | "RESULT_UNKNOWN" | "ATTEMPT_FAILED" = "NONE";
  if (packet.effectBinding) {
    if (observation.outcome === "SUCCESS") effectStateProposal = "EFFECT_OBSERVED_PENDING_READBACK";
    else if (observation.outcome === "FAILURE") effectStateProposal = "ATTEMPT_FAILED";
    else effectStateProposal = "RESULT_UNKNOWN";
  }
  return {
    effectStateProposal,
    observationDigest: digest(observation),
    evidenceCeiling: "DETERMINISTIC_API_ADAPTER_ONLY",
  };
}

export function validateApiReadback(packet: ApiAttemptPacket, readback: ApiReadback): ApiReadback {
  if (!packet.effectBinding) refuse("READBACK_WITHOUT_EFFECT");
  if (readback.schema !== API_READBACK_SCHEMA) refuse("API_READBACK_SCHEMA_MISMATCH");
  if (
    readback.requestId !== packet.requestId ||
    readback.actionId !== packet.actionId ||
    readback.routeSubjectDigest !== packet.routeSubjectDigest
  ) {
    refuse("API_READBACK_SUBJECT_MISMATCH");
  }
  if (readback.evidenceLane !== "API" || readback.evidenceClass !== "API_READBACK_FIXTURE") refuse("BROWSER_AS_API_EVIDENCE");
  if (readback.liveReadbackState !== "NOT_EXERCISED") refuse("FIXTURE_AS_LIVE_API_READBACK");
  if (readback.cleanupState !== "CLEAN") refuse("API_CLEANUP_RESIDUE");
  h64(readback.targetDigest, "API_READBACK_DIGEST_INVALID");
  return readback;
}

export function proposeApiEffectCommit(
  packet: ApiAttemptPacket,
  observation: ApiObservation,
  readback: ApiReadback | null,
): ApiEffectProposal {
  if (!packet.effectBinding) refuse("EFFECT_BINDING_REQUIRED");
  const classified = classifyApiObservation(packet, observation);
  if (classified.effectStateProposal !== "EFFECT_OBSERVED_PENDING_READBACK") {
    if (classified.effectStateProposal === "RESULT_UNKNOWN") refuse("RESULT_UNKNOWN_COMMIT_FORBIDDEN");
    refuse("API_COMMIT_NOT_ADMISSIBLE");
  }
  if (!readback) refuse("API_READBACK_REQUIRED");
  validateApiReadback(packet, readback);
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
    responseDigest: observation.responseDigest,
    readbackDigest: readback.targetDigest,
    canonicalWriteMode: "PROPOSAL_ONLY",
    externalEffectState: "NOT_EXERCISED",
    evidenceCeiling: "DETERMINISTIC_API_ADAPTER_ONLY",
  };
}

export function asApiError(error: unknown): string {
  if (error instanceof ApiAdapterError || error instanceof RouteContractError) return error.message;
  return String(error);
}
