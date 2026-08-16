import type { EvidenceState } from "../../../../packages/contracts/src/index.ts";

export const PRODUCT_CONVERGENCE_RECEIPT_SCHEMA = "agent-shield/product-convergence-receipt/v1" as const;
export const PRODUCT_REQUIRED_ISSUES = [45, 46, 47, 48, 49, 50, 51, 52] as const;

export type ProductConvergenceState =
  | "CHILDREN_PENDING"
  | "SUBJECTS_PINNED"
  | "ACTION_REGISTRY_RESOLVED"
  | "PLATFORM_MATRIX_RUNNING"
  | "AUTOMATION_MATRIX_RUNNING"
  | "SECURITY_STATE_CONTROLS_RUNNING"
  | "CLEANUP_CHECKED"
  | "RELEASE_RENDERED"
  | "HUMAN_REVIEW"
  | "ADMITTED"
  | "CHILD_ABSENT"
  | "SUBJECT_MISMATCH"
  | "ACTION_CONFLICT"
  | "PLATFORM_ABSENT"
  | "AUTH_FAIL"
  | "ACCESSIBILITY_FAIL"
  | "AUTOMATION_FAIL"
  | "PROJECTION_FAIL"
  | "CLEANUP_FAIL"
  | "RELEASE_DRIFT"
  | "HUMAN_REJECTED";

export type ProductConvergenceOutcome = Extract<ProductConvergenceState,
  | "HUMAN_REVIEW"
  | "ADMITTED"
  | "CHILD_ABSENT"
  | "SUBJECT_MISMATCH"
  | "ACTION_CONFLICT"
  | "PLATFORM_ABSENT"
  | "AUTH_FAIL"
  | "ACCESSIBILITY_FAIL"
  | "AUTOMATION_FAIL"
  | "PROJECTION_FAIL"
  | "CLEANUP_FAIL"
  | "RELEASE_DRIFT"
  | "HUMAN_REJECTED">;

export const PRODUCT_PLATFORMS = [
  "web",
  "terminal",
  "ios-simulator",
  "android-emulator",
  "ios-device",
  "android-device",
  "cloud-ios",
] as const;

export type ProductPlatform = (typeof PRODUCT_PLATFORMS)[number];
export type ProductRole = "contract" | "surface" | "bridge" | "automation" | "projection";
export type ProductTrustPlane = "none" | "in-app" | "external-mcp";

export const PRODUCT_OBSERVATION_STATES = [
  "waiting",
  "denied",
  "absent",
  "not-implemented",
  "not-exercised",
  "failed",
  "completed",
] as const;

export type ProductObservationState = (typeof PRODUCT_OBSERVATION_STATES)[number];

export interface ProductChildReceipt {
  issue: number;
  adapterId: string;
  interfaceVersion: string;
  subjectSha256: string;
  contractSha256: string;
  actionIds: string[];
  accessibilityIds: string[];
  platforms: ProductPlatform[];
  role: ProductRole;
  trustPlane: ProductTrustPlane;
  state: EvidenceState;
  observedStates: ProductObservationState[];
  authCleared: boolean;
  publicCapabilityOnly: boolean;
  genericToolExposed: boolean;
  listenerAuthenticated: boolean;
  artifactsAccounted: boolean;
  cleanupCleared: boolean;
}

export interface ExpectedProductChild {
  issue: number;
  adapterId: string;
  interfaceVersion: string;
  subjectSha256: string;
  platforms: ProductPlatform[];
  role: ProductRole;
  trustPlane: ProductTrustPlane;
}

export interface ProductModuleNode {
  id: string;
  provides: string[];
  requires: string[];
}

export interface ProposedProductStatus {
  platforms: Record<ProductPlatform, EvidenceState>;
  invalidatedModules: string[];
}

export interface ProductConvergenceReceipt {
  schema: typeof PRODUCT_CONVERGENCE_RECEIPT_SCHEMA;
  lifecycle: ProductConvergenceState[];
  outcome: ProductConvergenceOutcome;
  childCount: number;
  contractSha256: string;
  platforms: Record<ProductPlatform, EvidenceState>;
  invalidatedModules: string[];
  releaseDigest: string | null;
  detail: string;
}
