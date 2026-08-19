export const ROUTE_REQUEST_SCHEMA = "agent-shield/dual-agent-route/request/v1" as const;
export const ROUTE_RECEIPT_SCHEMA = "agent-shield/dual-agent-route/receipt/v1" as const;

export const BETTOR_EFFECT_CONTRACT = {
  repository: "ed3c/bettor-arena",
  commit: "f9b64994979042fc3726c524944a61da4f9cb8b5",
  tree: "e0f0ff4bf0b55627b420ace027043c3b7fee5d1d",
  owner: "dual-agent-effect-ledger",
  mode: "EFFECT_ADMISSION_REQUEST",
} as const;

export type RouteKind = "API" | "BROWSER";
export type ActionClass = "READ_ONLY" | "REVERSIBLE_WRITE" | "IRREVERSIBLE_WRITE";
export type ApiAdmissionState = "ADMITTED" | "ABSENT" | "REFUSED" | "NOT_ADMITTED";
export type BrowserAdmissionState = "ADMITTED" | "ABSENT" | "REFUSED" | "NOT_ADMITTED";
export type FallbackReason = "API_ABSENT" | "API_REFUSED" | "API_NOT_ADMITTED" | "API_UNSUPPORTED_ACTION";
export type EvidenceState = "NOT_EXERCISED";

export interface ImmutableSubject {
  repository: string;
  commit: string;
  tree: string;
  id: string;
  version: string;
  sha256: string;
}

export interface RouteDescriptor {
  kind: RouteKind;
  subject: ImmutableSubject;
  toolSubject: ImmutableSubject;
  actionIds: string[];
  authHandle: string;
  schemaDigest: string;
  termsDigest: string;
  admissionState: ApiAdmissionState | BrowserAdmissionState;
  packagePresence: boolean;
  liveState: EvidenceState;
}

export interface RoutePolicy {
  browserFallbackAllowed: boolean;
  allowedFallbackReasons: FallbackReason[];
}

export interface EffectBinding {
  owner: typeof BETTOR_EFFECT_CONTRACT.owner;
  mode: typeof BETTOR_EFFECT_CONTRACT.mode;
  repository: typeof BETTOR_EFFECT_CONTRACT.repository;
  commit: typeof BETTOR_EFFECT_CONTRACT.commit;
  tree: typeof BETTOR_EFFECT_CONTRACT.tree;
  effectIntentDigest: string;
  canonicalWriteMode: "PROPOSAL_ONLY";
}

export interface RouteRequest {
  schema: typeof ROUTE_REQUEST_SCHEMA;
  requestId: string;
  tenantScope: string;
  actionId: string;
  actionClass: ActionClass;
  routeHint: RouteKind | null;
  api: RouteDescriptor;
  browser: RouteDescriptor;
  policy: RoutePolicy;
  effectBinding: EffectBinding | null;
  externalStates: {
    apiExecution: EvidenceState;
    browserExecution: EvidenceState;
    providerEffect: EvidenceState;
    task: EvidenceState;
    userOutcome: EvidenceState;
    release: EvidenceState;
  };
}

export interface RouteDecision {
  selected: RouteKind;
  reason: "API_FIRST" | FallbackReason;
  actionId: string;
  routeSubjectDigest: string;
  effectMode: "NONE" | "EFFECT_ADMISSION_REQUEST";
  evidenceCeiling: "DETERMINISTIC_ROUTE_CONTRACT_ONLY";
}

export interface RouteReceipt {
  schema: typeof ROUTE_RECEIPT_SCHEMA;
  requestId: string;
  selected: RouteKind;
  evidenceLane: RouteKind;
  routeSubjectDigest: string;
  observationState: EvidenceState;
  effectState: EvidenceState;
  taskState: EvidenceState;
  userOutcomeState: EvidenceState;
  releaseState: EvidenceState;
  canonicalWriteMode: "OBSERVATION_ONLY";
}

export class RouteContractError extends Error {
  constructor(public readonly code: string, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const H40 = /^[0-9a-f]{40}$/;
const H64 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/;
const SENSITIVE_KEY = /(cookie|password|raw[_-]?secret|secret[_-]?value|token[_-]?value|profile[_-]?bytes|credential[_-]?value)/i;

function refuse(code: string, detail = ""): never {
  throw new RouteContractError(code, detail);
}

function assertHex(value: string, re: RegExp, code: string): void {
  if (!re.test(value)) refuse(code, value);
}

function assertOpaqueHandle(value: string): void {
  if (!value.startsWith("secret://") || value.length > 256) refuse("RAW_AUTH_MATERIAL");
}

function assertSubject(subject: ImmutableSubject): void {
  if (!subject || !subject.repository || !SAFE_ID.test(subject.id) || !subject.version) {
    refuse("MUTABLE_ROUTE_SUBJECT");
  }
  assertHex(subject.commit, H40, "MUTABLE_ROUTE_SUBJECT");
  assertHex(subject.tree, H40, "MUTABLE_ROUTE_SUBJECT");
  assertHex(subject.sha256, H64, "MUTABLE_ROUTE_SUBJECT");
}

function assertClosedActions(actions: string[]): void {
  if (!Array.isArray(actions) || actions.length === 0 || new Set(actions).size !== actions.length) {
    refuse("ACTION_SURFACE_INVALID");
  }
  for (const action of actions) {
    if (!SAFE_ID.test(action) || action.includes("*") || action.includes(" ")) refuse("WILDCARD_ACTION", action);
  }
}

function scanSensitive(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) scanSensitive(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) refuse("RAW_AUTH_MATERIAL", key);
      scanSensitive(item);
    }
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digest(value: unknown): string {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(bytes);
  return hasher.digest("hex");
}

export function validateDescriptor(route: RouteDescriptor, expected: RouteKind): void {
  if (route.kind !== expected) refuse("ROUTE_KIND_MISMATCH");
  assertSubject(route.subject);
  assertSubject(route.toolSubject);
  assertClosedActions(route.actionIds);
  assertOpaqueHandle(route.authHandle);
  assertHex(route.schemaDigest, H64, "ROUTE_SCHEMA_MISMATCH");
  assertHex(route.termsDigest, H64, "ROUTE_TERMS_MISMATCH");
  if (route.liveState !== "NOT_EXERCISED") refuse("PACKAGE_PRESENCE_AS_LIVE");
}

export function validateRequest(request: RouteRequest): void {
  if (request.schema !== ROUTE_REQUEST_SCHEMA) refuse("ROUTE_REQUEST_SCHEMA_MISMATCH");
  if (!SAFE_ID.test(request.requestId) || !SAFE_ID.test(request.tenantScope) || !SAFE_ID.test(request.actionId)) {
    refuse("ROUTE_REQUEST_IDENTITY_MISMATCH");
  }
  if (request.actionId.includes("*")) refuse("WILDCARD_ACTION");
  validateDescriptor(request.api, "API");
  validateDescriptor(request.browser, "BROWSER");
  if (new Set(request.policy.allowedFallbackReasons).size !== request.policy.allowedFallbackReasons.length) {
    refuse("FALLBACK_POLICY_INVALID");
  }
  for (const reason of request.policy.allowedFallbackReasons) {
    if (!["API_ABSENT", "API_REFUSED", "API_NOT_ADMITTED", "API_UNSUPPORTED_ACTION"].includes(reason)) {
      refuse("FALLBACK_POLICY_INVALID");
    }
  }
  const external = request.externalStates;
  if (Object.values(external).some((state) => state !== "NOT_EXERCISED")) refuse("PACKAGE_PRESENCE_AS_LIVE");
  if (request.actionClass === "READ_ONLY") {
    if (request.effectBinding !== null) refuse("UNEXPECTED_EFFECT_BINDING");
  } else {
    const binding = request.effectBinding;
    if (!binding) refuse("EFFECT_BINDING_REQUIRED");
    if (
      binding.owner !== BETTOR_EFFECT_CONTRACT.owner ||
      binding.mode !== BETTOR_EFFECT_CONTRACT.mode ||
      binding.repository !== BETTOR_EFFECT_CONTRACT.repository ||
      binding.commit !== BETTOR_EFFECT_CONTRACT.commit ||
      binding.tree !== BETTOR_EFFECT_CONTRACT.tree ||
      binding.canonicalWriteMode !== "PROPOSAL_ONLY"
    ) {
      refuse("EFFECT_OWNER_BYPASS");
    }
    assertHex(binding.effectIntentDigest, H64, "EFFECT_BINDING_REQUIRED");
  }
  scanSensitive(request);
}

function apiFallbackReason(request: RouteRequest): FallbackReason {
  if (request.api.admissionState === "ABSENT") return "API_ABSENT";
  if (request.api.admissionState === "REFUSED") return "API_REFUSED";
  if (request.api.admissionState === "NOT_ADMITTED") return "API_NOT_ADMITTED";
  return "API_UNSUPPORTED_ACTION";
}

export function selectRoute(request: RouteRequest): RouteDecision {
  validateRequest(request);
  const apiSupports = request.api.admissionState === "ADMITTED" && request.api.actionIds.includes(request.actionId);
  if (apiSupports) {
    if (request.routeHint === "BROWSER") refuse("FALLBACK_DESPITE_ADMITTED_API");
    return {
      selected: "API",
      reason: "API_FIRST",
      actionId: request.actionId,
      routeSubjectDigest: digest(request.api.subject),
      effectMode: request.effectBinding ? "EFFECT_ADMISSION_REQUEST" : "NONE",
      evidenceCeiling: "DETERMINISTIC_ROUTE_CONTRACT_ONLY",
    };
  }

  const reason = apiFallbackReason(request);
  if (
    !request.policy.browserFallbackAllowed ||
    !request.policy.allowedFallbackReasons.includes(reason) ||
    request.browser.admissionState !== "ADMITTED" ||
    !request.browser.actionIds.includes(request.actionId)
  ) {
    refuse("NO_ADMITTED_ROUTE", reason);
  }
  if (request.routeHint === "API") refuse("ROUTE_HINT_CONFLICT", reason);
  return {
    selected: "BROWSER",
    reason,
    actionId: request.actionId,
    routeSubjectDigest: digest(request.browser.subject),
    effectMode: request.effectBinding ? "EFFECT_ADMISSION_REQUEST" : "NONE",
    evidenceCeiling: "DETERMINISTIC_ROUTE_CONTRACT_ONLY",
  };
}

export function makeReceipt(request: RouteRequest, decision: RouteDecision): RouteReceipt {
  validateRequest(request);
  const expected = decision.selected === "API" ? request.api : request.browser;
  if (decision.routeSubjectDigest !== digest(expected.subject)) refuse("ROUTE_RECEIPT_SUBJECT_MISMATCH");
  return {
    schema: ROUTE_RECEIPT_SCHEMA,
    requestId: request.requestId,
    selected: decision.selected,
    evidenceLane: decision.selected,
    routeSubjectDigest: decision.routeSubjectDigest,
    observationState: "NOT_EXERCISED",
    effectState: "NOT_EXERCISED",
    taskState: "NOT_EXERCISED",
    userOutcomeState: "NOT_EXERCISED",
    releaseState: "NOT_EXERCISED",
    canonicalWriteMode: "OBSERVATION_ONLY",
  };
}

export function validateReceipt(receipt: RouteReceipt, expectedLane: RouteKind): void {
  if (receipt.schema !== ROUTE_RECEIPT_SCHEMA) refuse("ROUTE_RECEIPT_SCHEMA_MISMATCH");
  if (receipt.selected !== expectedLane || receipt.evidenceLane !== expectedLane) refuse("ROUTE_EVIDENCE_SUBSTITUTION");
  if (
    receipt.observationState !== "NOT_EXERCISED" ||
    receipt.effectState !== "NOT_EXERCISED" ||
    receipt.taskState !== "NOT_EXERCISED" ||
    receipt.userOutcomeState !== "NOT_EXERCISED" ||
    receipt.releaseState !== "NOT_EXERCISED"
  ) {
    refuse("PACKAGE_PRESENCE_AS_LIVE");
  }
  if (receipt.canonicalWriteMode !== "OBSERVATION_ONLY") refuse("PROVIDER_SELF_COMMIT");
}

export function fixedRequest(): RouteRequest {
  const subject = (kind: RouteKind, suffix: string): RouteDescriptor => ({
    kind,
    subject: {
      repository: `example/${suffix}`,
      commit: suffix === "api" ? "a".repeat(40) : "b".repeat(40),
      tree: suffix === "api" ? "c".repeat(40) : "d".repeat(40),
      id: `${suffix}-provider`,
      version: "1.0.0",
      sha256: suffix === "api" ? "1".repeat(64) : "2".repeat(64),
    },
    toolSubject: {
      repository: `example/${suffix}-tool`,
      commit: suffix === "api" ? "e".repeat(40) : "f".repeat(40),
      tree: suffix === "api" ? "1".repeat(40) : "2".repeat(40),
      id: `${suffix}-tool`,
      version: "1.0.0",
      sha256: suffix === "api" ? "3".repeat(64) : "4".repeat(64),
    },
    actionIds: ["records.read", "records.create"],
    authHandle: `secret://${suffix}/credential`,
    schemaDigest: suffix === "api" ? "5".repeat(64) : "6".repeat(64),
    termsDigest: suffix === "api" ? "7".repeat(64) : "8".repeat(64),
    admissionState: "ADMITTED",
    packagePresence: true,
    liveState: "NOT_EXERCISED",
  });
  return {
    schema: ROUTE_REQUEST_SCHEMA,
    requestId: "route-request-001",
    tenantScope: "tenant-demo",
    actionId: "records.read",
    actionClass: "READ_ONLY",
    routeHint: null,
    api: subject("API", "api"),
    browser: subject("BROWSER", "browser"),
    policy: {
      browserFallbackAllowed: true,
      allowedFallbackReasons: ["API_ABSENT", "API_REFUSED", "API_NOT_ADMITTED", "API_UNSUPPORTED_ACTION"],
    },
    effectBinding: null,
    externalStates: {
      apiExecution: "NOT_EXERCISED",
      browserExecution: "NOT_EXERCISED",
      providerEffect: "NOT_EXERCISED",
      task: "NOT_EXERCISED",
      userOutcome: "NOT_EXERCISED",
      release: "NOT_EXERCISED",
    },
  };
}
