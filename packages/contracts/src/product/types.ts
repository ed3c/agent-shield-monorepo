import type { ArtifactRef, EvidenceState } from "../index.ts";

export const PRODUCT_ACTION_SCHEMA = "agent-shield/product-action/v1" as const;
export const PRODUCT_AUTOMATION_REQUEST_SCHEMA = "agent-shield/product-automation-request/v1" as const;
export const PRODUCT_ACTION_RECEIPT_SCHEMA = "agent-shield/product-action-receipt/v1" as const;

// Local JSON shapes. Each contract family in this package owns its own primitives rather
// than reaching into a sibling family's private layout; the runtime family restructured
// exactly those paths under #93.
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export interface JsonObject { [key: string]: JsonValue }

export type ProductSurface = "web" | "mobile" | "terminal" | "qa-automation";
export type ProductEnvironment = "local" | "cloud" | "local-cloud";
export type ProductActorKind = "human" | "agent";
export type ProductRiskClass = "read" | "write" | "privileged";

export type ProductRole =
  | "button"
  | "link"
  | "field"
  | "list"
  | "region"
  | "surface"
  | "terminal";

export type ProductState =
  | "UNRESOLVED"
  | "ACTION_VALIDATED"
  | "AUTH_CHECKED"
  | "RISK_CHECKED"
  | "ROUTED"
  | "EXECUTING"
  | "OBSERVING"
  | "COMPLETED"
  | "WAITING_FOR_HUMAN"
  | "WAITING_FOR_HARDWARE"
  | "DENIED"
  | "ABSENT_ADAPTER"
  | "NOT_IMPLEMENTED"
  | "NOT_EXERCISED"
  | "FAILED_ACTION"
  | "FAILED_PROVIDER"
  | "FAILED_OBSERVATION"
  | "FAILED_CLEANUP";

export type ProductOutcome = Extract<ProductState,
  | "COMPLETED"
  | "WAITING_FOR_HUMAN"
  | "WAITING_FOR_HARDWARE"
  | "DENIED"
  | "ABSENT_ADAPTER"
  | "NOT_IMPLEMENTED"
  | "NOT_EXERCISED"
  | "FAILED_ACTION"
  | "FAILED_PROVIDER"
  | "FAILED_OBSERVATION"
  | "FAILED_CLEANUP">;

// UX-FND-002. One stable platform-neutral identity per interactive target, so web, mobile
// and QA adapters address the same element without sharing a framework selector language.
export interface AccessibilityTarget {
  targetId: string;
  role: ProductRole;
  label: string;
}

// UX-FND-001. The catalog is the closed set of admitted actions. A caller selects an action
// ID and admitted argument keys; it never supplies a command, script, path or selector.
export interface ProductActionDefinition {
  id: string;
  version: string;
  surface: ProductSurface;
  target: AccessibilityTarget;
  allowedArgumentKeys: string[];
  requiredScopes: string[];
  riskClass: ProductRiskClass;
  humanAdmitRequired: boolean;
}

// UX-FND-003. Actor, scope, replay nonce and expiry bind every request.
export interface ProductAuthorization {
  actorKind: ProductActorKind;
  actorId: string;
  scopes: string[];
  nonce: string;
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
}

export interface ProductAction {
  schema: typeof PRODUCT_ACTION_SCHEMA;
  requestId: string;
  actionId: string;
  actionVersion: string;
  surface: ProductSurface;
  environment: ProductEnvironment;
  target: AccessibilityTarget;
  arguments: JsonObject;
  authorization: ProductAuthorization;
  exclusions: string[];
}

// UX-FND-006. Every projection is bounded in size, count, duration, rate and content type.
export interface ProjectionLimits {
  maxFrameBytes: number;
  maxFrames: number;
  maxDurationMs: number;
  maxFramesPerSecond: number;
  mediaTypes: string[];
}

export interface ProjectionFrame {
  sequence: number;
  capturedAtEpochMs: number;
  mediaType: string;
  bytes: number;
  sha256: string;
}

// UX-FND-005. Adapter absence, implementation absence and an unrun canary stay distinct:
// no combination of the first two can be read as live evidence.
export interface ProductAdapterSubject {
  id: string;
  version: string;
  sha256: string;
  implementation: "IMPLEMENTED" | "NOT_IMPLEMENTED";
  availability: "AVAILABLE" | "ABSENT" | "REFUSED_POLICY";
  liveEvidence: "PASS" | "FAIL" | "NOT_EXERCISED";
}

export interface ProductAutomationRequest {
  schema: typeof PRODUCT_AUTOMATION_REQUEST_SCHEMA;
  requestId: string;
  actionDigest: string;
  adapter: ProductAdapterSubject;
  projection: ProjectionLimits;
  artifactKinds: string[];
  exclusions: string[];
}

export interface ProductCleanupReceipt {
  state: "PASS" | "FAIL" | "NOT_EXERCISED";
  sessionClosed: boolean;
  projectionStopped: boolean;
  residue: string[];
  detail: string;
}

// UX-FND-007. The receipt binds the exact action digest, adapter, environment, the whole
// state transition trace, artifacts, cleanup and exclusions.
export interface ProductActionReceipt {
  schema: typeof PRODUCT_ACTION_RECEIPT_SCHEMA;
  requestId: string;
  actionDigest: string;
  adapter: ProductAdapterSubject;
  environment: ProductEnvironment;
  lifecycle: ProductState[];
  outcome: ProductOutcome;
  state: EvidenceState;
  frames: number;
  artifacts: ArtifactRef[];
  cleanup: ProductCleanupReceipt;
  exclusions: string[];
  detail: string;
}
