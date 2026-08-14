import type { EvidenceState } from "../../../packages/contracts/src/index.ts";
import type { ProductActorKind } from "../../../packages/contracts/src/product/index.ts";

export const DASHBOARD_VIEW_SCHEMA = "agent-shield/dashboard-view/v1" as const;

export type DashboardState =
  | "UNINITIALIZED"
  | "LOADING_SUBJECT"
  | "VERIFYING_RECEIPTS"
  | "READY"
  | "ACTION_REQUESTED"
  | "AUTHORIZING"
  | "DISPATCHED"
  | "OBSERVING"
  | "RENDERED"
  | "STALE"
  | "ABSENT"
  | "NOT_IMPLEMENTED"
  | "NOT_EXERCISED"
  | "WAITING_FOR_HUMAN"
  | "WAITING_FOR_HARDWARE"
  | "DENIED"
  | "FAILED"
  | "DISCONNECTED";

export type DashboardOutcome = Extract<DashboardState,
  | "RENDERED"
  | "STALE"
  | "ABSENT"
  | "NOT_IMPLEMENTED"
  | "NOT_EXERCISED"
  | "WAITING_FOR_HUMAN"
  | "WAITING_FOR_HARDWARE"
  | "DENIED"
  | "FAILED"
  | "DISCONNECTED">;

// UX-WEB-002. Every receipt on screen must belong to one subject, and the subject digests are
// part of the view rather than hidden behind it.
export interface DashboardSubject {
  commit: string;
  releaseDigest: string;
}

export type CellStatus =
  | "COMPLETED"
  | "WAITING_FOR_HUMAN"
  | "WAITING_FOR_HARDWARE"
  | "DENIED"
  | "FAILED"
  | "ABSENT"
  | "NOT_IMPLEMENTED"
  | "NOT_EXERCISED"
  | "STALE";

export interface ReceiptInput {
  cellId: string;
  label: string;
  subject: DashboardSubject;
  status: CellStatus;
  observedAtEpochMs: number;
  artifactCount: number;
  detail: string;
}

// UX-WEB-005. Every cell carries a stable ID, a role and a status announcement. A cell whose
// announcement is missing is not renderable, so an evidence state cannot go unannounced.
export interface DashboardCell {
  cellId: string;
  label: string;
  role: "status" | "region";
  status: CellStatus;
  evidence: EvidenceState;
  announcement: string;
  detail: string;
  artifactCount: number;
  ageMs: number;
}

export interface OperatorIdentity {
  actorKind: ProductActorKind;
  actorId: string;
  scopes: string[];
  sessionCsrfToken: string;
}

export interface DashboardViewModel {
  schema: typeof DASHBOARD_VIEW_SCHEMA;
  subject: DashboardSubject;
  state: DashboardOutcome;
  cells: DashboardCell[];
  connected: boolean;
  detail: string;
}

export interface DashboardBounds {
  maxCells: number;
  maxDetailChars: number;
  maxArtifactsPerCell: number;
  maxReceiptAgeMs: number;
}

export const DEFAULT_BOUNDS: DashboardBounds = {
  maxCells: 64,
  maxDetailChars: 240,
  maxArtifactsPerCell: 16,
  maxReceiptAgeMs: 300_000,
};
