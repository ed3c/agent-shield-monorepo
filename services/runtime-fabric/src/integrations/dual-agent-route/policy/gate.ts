import {
  BETTOR_EFFECT_CONTRACT,
  RouteContractError,
  digest,
  selectRoute,
  validateRequest,
  type RouteDecision,
  type RouteKind,
  type RouteRequest,
} from "../contract.ts";

export const ROUTE_POLICY_OBSERVATION_SCHEMA = "agent-shield/dual-agent-route/policy-observation/v1" as const;
export const ROUTE_POLICY_RECEIPT_SCHEMA = "agent-shield/dual-agent-route/policy-receipt/v1" as const;

export interface RouteCapabilityObservation {
  schema: typeof ROUTE_POLICY_OBSERVATION_SCHEMA;
  kind: RouteKind;
  routeSubjectDigest: string;
  actionId: string;
  admissionState: "ADMITTED" | "ABSENT" | "REFUSED" | "NOT_ADMITTED";
  actionSupported: boolean;
  packagePresence: boolean;
  providerHealth: "HEALTHY" | "UNHEALTHY" | "UNKNOWN";
  latencyClass: "LOW" | "HIGH" | "UNKNOWN";
  selectionAuthority: "CONTRACT_ADMISSION_ONLY";
  evidenceClass: "DETERMINISTIC_CAPABILITY_FIXTURE";
  liveState: "NOT_EXERCISED";
}

export interface RoutePolicyReceipt {
  schema: typeof ROUTE_POLICY_RECEIPT_SCHEMA;
  requestId: string;
  actionId: string;
  selected: RouteKind;
  reason: RouteDecision["reason"];
  selectionAuthority: "CONTRACT_AND_POLICY_ONLY";
  providerHealthUsedForSelection: false;
  latencyUsedForSelection: false;
  packagePresenceUsedForAdmission: false;
  workerPreferenceUsedForSelection: false;
  effectRequirementPreserved: boolean;
  apiObservationDigest: string;
  browserObservationDigest: string;
  livePolicyState: "NOT_EXERCISED";
  evidenceCeiling: "DETERMINISTIC_ROUTE_SELECTION_POLICY_ONLY";
}

export class RoutePolicyError extends Error {
  constructor(public readonly code: string, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

function refuse(code: string, detail = ""): never {
  throw new RoutePolicyError(code, detail);
}

function expectedObservation(request: RouteRequest, kind: RouteKind): Pick<RouteCapabilityObservation, "routeSubjectDigest" | "admissionState" | "actionSupported"> {
  const route = kind === "API" ? request.api : request.browser;
  return {
    routeSubjectDigest: digest(route.subject),
    admissionState: route.admissionState,
    actionSupported: route.actionIds.includes(request.actionId),
  };
}

export function validateCapabilityObservation(request: RouteRequest, observation: RouteCapabilityObservation): void {
  validateRequest(request);
  if (observation.schema !== ROUTE_POLICY_OBSERVATION_SCHEMA) refuse("POLICY_OBSERVATION_SCHEMA_MISMATCH");
  if (observation.kind !== "API" && observation.kind !== "BROWSER") refuse("POLICY_OBSERVATION_KIND_MISMATCH");
  if (observation.actionId !== request.actionId) refuse("ACTION_SCOPE_WIDENING");
  const expected = expectedObservation(request, observation.kind);
  if (observation.routeSubjectDigest !== expected.routeSubjectDigest) refuse("MUTABLE_ROUTE_SUBJECT");
  if (observation.admissionState !== expected.admissionState || observation.actionSupported !== expected.actionSupported) {
    refuse("CAPABILITY_OBSERVATION_DRIFT");
  }
  if (observation.selectionAuthority !== "CONTRACT_ADMISSION_ONLY") refuse("PROVIDER_HEALTH_AS_POLICY");
  if (observation.evidenceClass !== "DETERMINISTIC_CAPABILITY_FIXTURE" || observation.liveState !== "NOT_EXERCISED") {
    refuse("PACKAGE_PRESENCE_AS_ADMISSION");
  }
}

export function decideWithPolicy(
  request: RouteRequest,
  apiObservation: RouteCapabilityObservation,
  browserObservation: RouteCapabilityObservation,
  attemptedAuthority: "CONTRACT_AND_POLICY_ONLY" | "PROVIDER_HEALTH" | "LOWEST_LATENCY" | "PACKAGE_PRESENCE" | "WORKER_PREFERENCE" = "CONTRACT_AND_POLICY_ONLY",
): RoutePolicyReceipt {
  validateRequest(request);
  validateCapabilityObservation(request, apiObservation);
  validateCapabilityObservation(request, browserObservation);
  if (apiObservation.kind !== "API" || browserObservation.kind !== "BROWSER") refuse("ROUTE_EVIDENCE_LAUNDERING");
  if (attemptedAuthority === "PROVIDER_HEALTH") refuse("PROVIDER_HEALTH_AS_POLICY");
  if (attemptedAuthority === "LOWEST_LATENCY") refuse("LATENCY_AS_POLICY");
  if (attemptedAuthority === "PACKAGE_PRESENCE") refuse("PACKAGE_PRESENCE_AS_ADMISSION");
  if (attemptedAuthority === "WORKER_PREFERENCE") refuse("WORKER_SELECTION_WIDENING");

  const decision = selectRoute(request);
  const writeClass = request.actionClass !== "READ_ONLY";
  if (writeClass) {
    const effect = request.effectBinding;
    if (!effect) refuse("EFFECT_REQUIREMENT_MISSING");
    if (
      effect.owner !== BETTOR_EFFECT_CONTRACT.owner ||
      effect.commit !== BETTOR_EFFECT_CONTRACT.commit ||
      effect.canonicalWriteMode !== "PROPOSAL_ONLY"
    ) {
      refuse("EFFECT_REQUIREMENT_MISSING");
    }
  }
  return {
    schema: ROUTE_POLICY_RECEIPT_SCHEMA,
    requestId: request.requestId,
    actionId: request.actionId,
    selected: decision.selected,
    reason: decision.reason,
    selectionAuthority: "CONTRACT_AND_POLICY_ONLY",
    providerHealthUsedForSelection: false,
    latencyUsedForSelection: false,
    packagePresenceUsedForAdmission: false,
    workerPreferenceUsedForSelection: false,
    effectRequirementPreserved: writeClass,
    apiObservationDigest: digest(apiObservation),
    browserObservationDigest: digest(browserObservation),
    livePolicyState: "NOT_EXERCISED",
    evidenceCeiling: "DETERMINISTIC_ROUTE_SELECTION_POLICY_ONLY",
  };
}

export function fixedObservation(request: RouteRequest, kind: RouteKind): RouteCapabilityObservation {
  const route = kind === "API" ? request.api : request.browser;
  return {
    schema: ROUTE_POLICY_OBSERVATION_SCHEMA,
    kind,
    routeSubjectDigest: digest(route.subject),
    actionId: request.actionId,
    admissionState: route.admissionState,
    actionSupported: route.actionIds.includes(request.actionId),
    packagePresence: route.packagePresence,
    providerHealth: "HEALTHY",
    latencyClass: kind === "API" ? "HIGH" : "LOW",
    selectionAuthority: "CONTRACT_ADMISSION_ONLY",
    evidenceClass: "DETERMINISTIC_CAPABILITY_FIXTURE",
    liveState: "NOT_EXERCISED",
  };
}

export function asPolicyError(error: unknown): string {
  if (error instanceof RoutePolicyError || error instanceof RouteContractError) return error.message;
  return String(error);
}
