import { cellEvidence, worstCellState } from "./state-machine.ts";
import {
  DASHBOARD_VIEW_SCHEMA,
  DEFAULT_BOUNDS,
  type CellStatus,
  type DashboardBounds,
  type DashboardCell,
  type DashboardSubject,
  type DashboardViewModel,
  type ReceiptInput,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_CELL_ID = /^[a-z0-9][a-z0-9.:_-]{0,127}$/;

export function fail(message: string): never {
  throw new Error(`invalid dashboard contract: ${message}`);
}

// UX-WEB-006. Rendered text is bounded and stripped of control characters, and anything that
// looks like a bearer credential is refused rather than truncated -- a truncated secret is
// still a leaked prefix.
const CREDENTIAL_SHAPE = /(?:bearer\s+[A-Za-z0-9._-]{8,}|eyJ[A-Za-z0-9._-]{16,}|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

export function boundedText(value: string, name: string, maxChars: number): string {
  if (value.length === 0) fail(`${name} must not be empty`);
  if (/\p{Cc}/u.test(value)) fail(`${name} contains control characters`);
  if (CREDENTIAL_SHAPE.test(value)) fail(`${name} contains credential-shaped content`);
  if (value.length > maxChars) fail(`${name} exceeds ${maxChars} characters`);
  return value;
}

export function assertSubject(subject: DashboardSubject, name = "subject"): DashboardSubject {
  if (!GIT_OID.test(subject.commit)) fail(`${name}.commit must be a full 40-hex object ID`);
  if (!SHA_256.test(subject.releaseDigest)) fail(`${name}.releaseDigest must be a sha256 digest`);
  return subject;
}

function announcement(cell: Pick<DashboardCell, "label" | "status" | "ageMs">): string {
  const seconds = Math.floor(cell.ageMs / 1000);
  switch (cell.status) {
    case "COMPLETED":
      return `${cell.label}: completed, observed ${seconds}s ago`;
    case "STALE":
      return `${cell.label}: stale, last observed ${seconds}s ago and not refreshed`;
    case "WAITING_FOR_HUMAN":
      return `${cell.label}: waiting for a human decision, not complete`;
    case "WAITING_FOR_HARDWARE":
      return `${cell.label}: waiting for hardware, not complete`;
    case "DENIED":
      return `${cell.label}: denied`;
    case "FAILED":
      return `${cell.label}: failed`;
    case "ABSENT":
      return `${cell.label}: absent, no subject exists`;
    case "NOT_IMPLEMENTED":
      return `${cell.label}: not implemented`;
    default:
      return `${cell.label}: not exercised, no live evidence`;
  }
}

// UX-WEB-002 and UX-WEB-007. Every receipt must belong to the one subject the view claims, and
// a receipt older than the freshness bound becomes STALE rather than keeping its old status.
// A disconnected view revalidates rather than retaining a previous success.
export function buildDashboardView(
  subject: DashboardSubject,
  receipts: readonly ReceiptInput[],
  nowEpochMs: number,
  options: { connected?: boolean; bounds?: DashboardBounds } = {},
): DashboardViewModel {
  const bounds = options.bounds ?? DEFAULT_BOUNDS;
  const connected = options.connected ?? true;
  assertSubject(subject);
  if (receipts.length === 0) fail("a dashboard view requires at least one receipt");
  if (receipts.length > bounds.maxCells) fail(`a dashboard view renders at most ${bounds.maxCells} cells`);

  const seen = new Set<string>();
  const cells: DashboardCell[] = receipts.map((receipt) => {
    if (!SAFE_CELL_ID.test(receipt.cellId)) fail(`cell ID ${receipt.cellId} is invalid`);
    if (seen.has(receipt.cellId)) fail(`cell ID ${receipt.cellId} is not unique`);
    seen.add(receipt.cellId);
    assertSubject(receipt.subject, `cell ${receipt.cellId} subject`);
    if (receipt.subject.commit !== subject.commit || receipt.subject.releaseDigest !== subject.releaseDigest) {
      fail(`cell ${receipt.cellId} belongs to a different subject than the view`);
    }
    if (!Number.isSafeInteger(receipt.observedAtEpochMs) || receipt.observedAtEpochMs <= 0) {
      fail(`cell ${receipt.cellId} has no observation time`);
    }
    if (receipt.observedAtEpochMs > nowEpochMs) fail(`cell ${receipt.cellId} was observed in the future`);
    if (!Number.isSafeInteger(receipt.artifactCount) || receipt.artifactCount < 0 || receipt.artifactCount > bounds.maxArtifactsPerCell) {
      fail(`cell ${receipt.cellId} exceeds the admitted artifact bound`);
    }

    const ageMs = nowEpochMs - receipt.observedAtEpochMs;
    // A view that lost its connection cannot keep showing a previous success, and an aged
    // receipt is stale no matter what it used to say.
    const stale = ageMs > bounds.maxReceiptAgeMs || (!connected && receipt.status === "COMPLETED");
    const status: CellStatus = stale ? "STALE" : receipt.status;
    const label = boundedText(receipt.label, `cell ${receipt.cellId} label`, 64);
    const cell: DashboardCell = {
      cellId: receipt.cellId,
      label,
      role: "status",
      status,
      evidence: cellEvidence(status),
      announcement: announcement({ label, status, ageMs }),
      detail: boundedText(receipt.detail, `cell ${receipt.cellId} detail`, bounds.maxDetailChars),
      artifactCount: receipt.artifactCount,
      ageMs,
    };
    // UX-WEB-005. A cell with no announcement cannot be rendered: the state would exist on
    // screen without being announced to assistive technology.
    if (cell.announcement.length === 0) fail(`cell ${cell.cellId} has no status announcement`);
    return cell;
  });

  const state = connected ? worstCellState(cells.map((cell) => cell.status)) : "DISCONNECTED";
  return {
    schema: DASHBOARD_VIEW_SCHEMA,
    subject,
    state,
    cells: cells.sort((left, right) => (left.cellId < right.cellId ? -1 : left.cellId > right.cellId ? 1 : 0)),
    connected,
    detail: connected
      ? `projection of ${cells.length} receipt(s) at ${subject.commit.slice(0, 12)}`
      : "disconnected; the last projection is not a current result",
  };
}
