import type { EvidenceState } from "../../../packages/contracts/src/index.ts";
import type { CellStatus, DashboardOutcome, DashboardState } from "./types.ts";

const OUTCOMES = new Set<DashboardState>([
  "RENDERED", "STALE", "ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED",
  "WAITING_FOR_HUMAN", "WAITING_FOR_HARDWARE", "DENIED", "FAILED", "DISCONNECTED",
]);

const BLOCKED: readonly DashboardState[] = [
  "STALE", "ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED", "DENIED", "FAILED", "DISCONNECTED",
];

const TRANSITIONS: Readonly<Record<DashboardState, readonly DashboardState[]>> = {
  UNINITIALIZED: ["LOADING_SUBJECT", "ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED"],
  LOADING_SUBJECT: ["VERIFYING_RECEIPTS", "ABSENT", "STALE", "FAILED", "DISCONNECTED"],
  VERIFYING_RECEIPTS: ["READY", ...BLOCKED, "WAITING_FOR_HUMAN", "WAITING_FOR_HARDWARE"],
  READY: ["ACTION_REQUESTED", "RENDERED", ...BLOCKED],
  ACTION_REQUESTED: ["AUTHORIZING", "DENIED", "FAILED", "DISCONNECTED"],
  AUTHORIZING: ["DISPATCHED", "DENIED", "FAILED", "WAITING_FOR_HUMAN"],
  DISPATCHED: ["OBSERVING", "FAILED", "DISCONNECTED", "WAITING_FOR_HARDWARE", "WAITING_FOR_HUMAN"],
  OBSERVING: ["RENDERED", "FAILED", "DISCONNECTED", "STALE"],
  RENDERED: [],
  STALE: [],
  ABSENT: [],
  NOT_IMPLEMENTED: [],
  NOT_EXERCISED: [],
  WAITING_FOR_HUMAN: [],
  WAITING_FOR_HARDWARE: [],
  DENIED: [],
  FAILED: [],
  DISCONNECTED: [],
};

// Same construction-time invariant as the contract families: the "cannot continue past an
// outcome" rule lives in TRANSITIONS, and the two tables are asserted to agree here rather
// than re-checked per trace.
for (const [state, next] of Object.entries(TRANSITIONS) as [DashboardState, readonly DashboardState[]][]) {
  if (OUTCOMES.has(state) && next.length > 0) {
    throw new Error(`invalid dashboard contract: terminal outcome ${state} declares successors`);
  }
}
{
  const seen = new Set<DashboardState>(["UNINITIALIZED"]);
  const queue: DashboardState[] = ["UNINITIALIZED"];
  while (queue.length > 0) {
    for (const target of TRANSITIONS[queue.shift() as DashboardState]) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = (Object.keys(TRANSITIONS) as DashboardState[]).filter((state) => !seen.has(state));
  if (unreachable.length > 0) {
    throw new Error(`invalid dashboard contract: unreachable states ${unreachable.join(", ")}`);
  }
}

export function isDashboardOutcome(value: DashboardState): value is DashboardOutcome {
  return OUTCOMES.has(value);
}

export function assertDashboardTransition(from: DashboardState, to: DashboardState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid dashboard contract: illegal transition ${from} -> ${to}`);
  }
}

export function validateDashboardLifecycle(trace: readonly DashboardState[]): DashboardOutcome {
  if (trace.length < 2 || trace.length > 24) {
    throw new Error("invalid dashboard contract: lifecycle must contain between 2 and 24 states");
  }
  if (trace[0] !== "UNINITIALIZED") throw new Error("invalid dashboard contract: lifecycle must start at UNINITIALIZED");
  for (let index = 1; index < trace.length; index += 1) assertDashboardTransition(trace[index - 1], trace[index]);
  const terminal = trace[trace.length - 1];
  if (!isDashboardOutcome(terminal)) throw new Error("invalid dashboard contract: lifecycle did not reach an outcome");
  return terminal;
}

// UX-WEB-001. One cell status maps to exactly one evidence state, and only COMPLETED is PASS.
// Stale, absent, waiting and failure can never be rendered as success.
export function cellEvidence(status: CellStatus): EvidenceState {
  switch (status) {
    case "COMPLETED":
      return "PASS";
    case "ABSENT":
      return "ABSENT";
    case "NOT_IMPLEMENTED":
      return "NOT_IMPLEMENTED";
    case "NOT_EXERCISED":
    case "WAITING_FOR_HUMAN":
    case "WAITING_FOR_HARDWARE":
    case "STALE":
      return "NOT_EXERCISED";
    default:
      return "FAIL";
  }
}

// The view state is the worst cell state, not the best. A single stale, denied or failed cell
// keeps the whole view out of RENDERED.
const SEVERITY: Readonly<Record<CellStatus, number>> = {
  COMPLETED: 0,
  NOT_EXERCISED: 1,
  NOT_IMPLEMENTED: 2,
  WAITING_FOR_HARDWARE: 3,
  WAITING_FOR_HUMAN: 4,
  STALE: 5,
  ABSENT: 6,
  DENIED: 7,
  FAILED: 8,
};

const STATUS_TO_STATE: Readonly<Record<CellStatus, DashboardOutcome>> = {
  COMPLETED: "RENDERED",
  NOT_EXERCISED: "NOT_EXERCISED",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  WAITING_FOR_HARDWARE: "WAITING_FOR_HARDWARE",
  WAITING_FOR_HUMAN: "WAITING_FOR_HUMAN",
  STALE: "STALE",
  ABSENT: "ABSENT",
  DENIED: "DENIED",
  FAILED: "FAILED",
};

export function worstCellState(statuses: readonly CellStatus[]): DashboardOutcome {
  let worst: CellStatus = "COMPLETED";
  for (const status of statuses) if (SEVERITY[status] > SEVERITY[worst]) worst = status;
  return STATUS_TO_STATE[worst];
}
