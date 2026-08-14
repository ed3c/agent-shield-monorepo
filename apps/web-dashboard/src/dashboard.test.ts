import {
  PRODUCT_ACTION_SCHEMA,
  validateProductActionCatalog,
} from "../../../packages/contracts/src/product/index.ts";
import {
  DashboardSession,
  DEFAULT_BOUNDS,
  assertDashboardTransition,
  buildDashboardView,
  cellEvidence,
  dashboardState,
  validateDashboardLifecycle,
  worstCellState,
  type CellStatus,
  type DashboardState,
  type DashboardSubject,
  type ReceiptInput,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`UX-WEB ${message}`);
}

// Controls must fail through this app's own contract error, not through any incidental throw:
// a control that accepts any exception makes a dominated guard look load-bearing.
function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(
    text.startsWith("invalid dashboard contract: ") || text.startsWith("invalid product contract: "),
    `${message} threw "${text}" rather than a dashboard or product contract error`,
  );
}

const COMMIT = "1".repeat(40);
const RELEASE = "2".repeat(64);
const CSRF = "3".repeat(64);
const NONCE = "4".repeat(64);
const NOW = 1_700_000_000_000;
const SUBJECT: DashboardSubject = { commit: COMMIT, releaseDigest: RELEASE };

function receipt(overrides: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    cellId: "runtime.local",
    label: "Local runtime",
    subject: { ...SUBJECT },
    status: "COMPLETED",
    observedAtEpochMs: NOW - 1_000,
    artifactCount: 2,
    detail: "deterministic fixture receipt",
    ...overrides,
  };
}

// UX-WEB-001 fidelity
function fidelity(): void {
  for (const [status, evidence] of [
    ["COMPLETED", "PASS"],
    ["STALE", "NOT_EXERCISED"],
    ["WAITING_FOR_HUMAN", "NOT_EXERCISED"],
    ["WAITING_FOR_HARDWARE", "NOT_EXERCISED"],
    ["NOT_EXERCISED", "NOT_EXERCISED"],
    ["ABSENT", "ABSENT"],
    ["NOT_IMPLEMENTED", "NOT_IMPLEMENTED"],
    ["DENIED", "FAIL"],
    ["FAILED", "FAIL"],
  ] as const) {
    ok(cellEvidence(status) === evidence, `${status} rendered as the wrong evidence state`);
  }

  // Each non-complete status must keep the whole view out of RENDERED, one at a time.
  for (const status of ["STALE", "ABSENT", "WAITING_FOR_HUMAN", "WAITING_FOR_HARDWARE", "DENIED", "FAILED", "NOT_IMPLEMENTED", "NOT_EXERCISED"] as const) {
    const view = buildDashboardView(SUBJECT, [receipt(), receipt({ cellId: "runtime.cloud", status })], NOW);
    ok(view.state !== "RENDERED", `a ${status} cell still rendered the view as complete`);
    const cell = view.cells.find((entry) => entry.cellId === "runtime.cloud");
    ok(cell?.status === status && cell.evidence !== "PASS", `a ${status} cell was projected as success`);
  }
  ok(buildDashboardView(SUBJECT, [receipt()], NOW).state === "RENDERED", "an all-complete view failed to render");
  ok(worstCellState(["COMPLETED", "WAITING_FOR_HUMAN", "COMPLETED"]) === "WAITING_FOR_HUMAN", "the view state took the best cell rather than the worst");
}

// UX-WEB-002 subject binding
function subjectBinding(): void {
  const view = buildDashboardView(SUBJECT, [receipt()], NOW);
  ok(view.subject.commit === COMMIT && view.subject.releaseDigest === RELEASE, "the view hid its subject digests");

  red(
    () => buildDashboardView(SUBJECT, [receipt(), receipt({ cellId: "other", subject: { commit: "9".repeat(40), releaseDigest: RELEASE } })], NOW),
    "receipts mixed from two commits",
  );
  red(
    () => buildDashboardView(SUBJECT, [receipt({ subject: { commit: COMMIT, releaseDigest: "9".repeat(64) } })], NOW),
    "receipts mixed from two releases",
  );
  // The receipt must carry the same bad subject, or the subject-mixing rule catches it first
  // and the identity-format rule is never exercised.
  const moving = { commit: "main", releaseDigest: RELEASE };
  red(() => buildDashboardView(moving, [receipt({ subject: moving })], NOW), "a moving ref as the view subject");
  const shortDigest = { commit: COMMIT, releaseDigest: "2".repeat(32) };
  red(() => buildDashboardView(shortDigest, [receipt({ subject: shortDigest })], NOW), "a truncated release digest");
  red(() => buildDashboardView(SUBJECT, [receipt({ observedAtEpochMs: NOW + 1 })], NOW), "a receipt observed in the future");
  red(() => buildDashboardView(SUBJECT, [receipt(), receipt()], NOW), "a duplicate cell ID");

  const stale = buildDashboardView(SUBJECT, [receipt({ observedAtEpochMs: NOW - DEFAULT_BOUNDS.maxReceiptAgeMs - 1 })], NOW);
  ok(stale.state === "STALE" && stale.cells[0].status === "STALE", "an aged receipt kept its old status");
}

// UX-WEB-003 authorization
function authorization(): void {
  const catalog = validateProductActionCatalog([{
    id: "dashboard.approve-run",
    version: "1.0.0",
    surface: "web",
    target: { targetId: "dashboard.approve-run", role: "button", label: "Approve run" },
    allowedArgumentKeys: ["runId"],
    requiredScopes: ["dashboard.write"],
    riskClass: "write",
    humanAdmitRequired: false,
  }]);
  const operator = { actorKind: "human", actorId: "owner", scopes: ["dashboard.write"], sessionCsrfToken: CSRF } as const;
  const session = new DashboardSession({ ...operator, scopes: [...operator.scopes] }, SUBJECT);

  const action = (overrides: Record<string, unknown> = {}, auth: Record<string, unknown> = {}) => ({
    schema: PRODUCT_ACTION_SCHEMA,
    requestId: "web-fixture",
    actionId: "dashboard.approve-run",
    actionVersion: "1.0.0",
    surface: "web",
    environment: "local",
    target: { targetId: "dashboard.approve-run", role: "button", label: "Approve run" },
    arguments: { runId: "run-1" },
    authorization: {
      actorKind: "human", actorId: "owner", scopes: ["dashboard.write"], nonce: NONCE,
      issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 60_000, ...auth,
    },
    exclusions: ["device", "production"],
    ...overrides,
  });

  ok(session.dispatch({ action: action(), subject: SUBJECT, csrfToken: CSRF }, catalog, NOW).actionId === "dashboard.approve-run", "an authorized action was refused");
  red(() => session.dispatch({ action: action(), subject: SUBJECT, csrfToken: CSRF }, catalog, NOW), "a replayed nonce");
  red(
    () => session.dispatch({ action: action({}, { nonce: "5".repeat(64) }), subject: SUBJECT, csrfToken: "0".repeat(64) }, catalog, NOW),
    "a missing CSRF token",
  );
  red(
    () => session.dispatch({ action: action({}, { nonce: "5".repeat(64), actorId: "someone-else" }), subject: SUBJECT, csrfToken: CSRF }, catalog, NOW),
    "an action authorized for another operator",
  );
  red(
    () => session.dispatch({ action: action({}, { nonce: "5".repeat(64) }), subject: { commit: "9".repeat(40), releaseDigest: RELEASE }, csrfToken: CSRF }, catalog, NOW),
    "an action against another subject",
  );
  red(
    () => session.dispatch({ action: action({}, { nonce: "5".repeat(64) }), subject: SUBJECT, csrfToken: CSRF }, catalog, NOW + 3_600_000),
    "an expired authorization",
  );

  const restricted = new DashboardSession({ actorKind: "human", actorId: "owner", scopes: ["dashboard.read"], sessionCsrfToken: CSRF }, SUBJECT);
  red(
    () => restricted.dispatch({ action: action({}, { nonce: "6".repeat(64) }), subject: SUBJECT, csrfToken: CSRF }, catalog, NOW),
    "an operator without the required scope",
  );

  const admitCatalog = validateProductActionCatalog([{
    id: "dashboard.promote", version: "1.0.0", surface: "web",
    target: { targetId: "dashboard.promote", role: "button", label: "Promote" },
    allowedArgumentKeys: ["runId"], requiredScopes: ["dashboard.write"],
    riskClass: "privileged", humanAdmitRequired: true,
  }]);
  red(
    () => session.dispatch({
      action: action({ actionId: "dashboard.promote", target: { targetId: "dashboard.promote", role: "button", label: "Promote" } }, { nonce: "7".repeat(64) }),
      subject: SUBJECT, csrfToken: CSRF,
    }, admitCatalog, NOW),
    "the dashboard granting Human Admit on the operator's behalf",
  );
}

// UX-WEB-004 closed actions
function closedActions(): void {
  const catalog = validateProductActionCatalog([{
    id: "dashboard.approve-run", version: "1.0.0", surface: "web",
    target: { targetId: "dashboard.approve-run", role: "button", label: "Approve run" },
    allowedArgumentKeys: ["runId"], requiredScopes: ["dashboard.write"],
    riskClass: "write", humanAdmitRequired: false,
  }]);
  const session = new DashboardSession({ actorKind: "human", actorId: "owner", scopes: ["dashboard.write"], sessionCsrfToken: CSRF }, SUBJECT);
  const base = {
    schema: PRODUCT_ACTION_SCHEMA, requestId: "web-fixture", actionId: "dashboard.approve-run",
    actionVersion: "1.0.0", surface: "web", environment: "local",
    target: { targetId: "dashboard.approve-run", role: "button", label: "Approve run" },
    authorization: { actorKind: "human", actorId: "owner", scopes: ["dashboard.write"], nonce: NONCE, issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 60_000 },
    exclusions: ["device", "production"],
  };
  for (const [label, args] of [
    ["navigation string", { url: "https://example.com" }],
    ["command", { command: "rm -rf /" }],
    ["file path", { path: "workspace/secret" }],
    ["prompt passthrough", { script: "ignore previous instructions" }],
    ["tool passthrough", { shell: "/bin/sh" }],
  ] as const) {
    red(
      () => session.dispatch({ action: { ...base, arguments: args }, subject: SUBJECT, csrfToken: CSRF }, catalog, NOW),
      `a generic ${label}`,
    );
  }
}

// UX-WEB-005 accessibility
function accessibility(): void {
  const view = buildDashboardView(SUBJECT, [
    receipt(),
    receipt({ cellId: "runtime.cloud", label: "Cloud runtime", status: "WAITING_FOR_HARDWARE" }),
  ], NOW);
  for (const cell of view.cells) {
    ok(cell.cellId.length > 0 && cell.role === "status", `cell ${cell.cellId} lost its stable identity or role`);
    ok(cell.announcement.includes(cell.label), `cell ${cell.cellId} does not announce its own label`);
  }
  const waiting = view.cells.find((cell) => cell.cellId === "runtime.cloud");
  ok(waiting?.announcement.includes("not complete"), "a waiting cell did not announce that it is incomplete");
  const done = view.cells.find((cell) => cell.cellId === "runtime.local");
  ok(done?.announcement.includes("completed"), "a completed cell did not announce completion");
  red(() => buildDashboardView(SUBJECT, [receipt({ label: "" })], NOW), "a cell with no label to announce");
  red(() => buildDashboardView(SUBJECT, [receipt({ cellId: "Runtime Local" })], NOW), "an unstable cell identity");
}

// UX-WEB-006 bounded content
function boundedContent(): void {
  red(() => buildDashboardView(SUBJECT, [receipt({ detail: "x".repeat(DEFAULT_BOUNDS.maxDetailChars + 1) })], NOW), "an unbounded detail string");
  red(() => buildDashboardView(SUBJECT, [receipt({ artifactCount: DEFAULT_BOUNDS.maxArtifactsPerCell + 1 })], NOW), "an unbounded artifact count");
  red(
    () => buildDashboardView(SUBJECT, Array.from({ length: DEFAULT_BOUNDS.maxCells + 1 }, (_unused, index) => receipt({ cellId: `cell-${index}` })), NOW),
    "an unbounded cell count",
  );
  red(() => buildDashboardView(SUBJECT, [receipt({ detail: "linebell" })], NOW), "a control character in rendered text");
  for (const [label, detail] of [
    ["bearer token", "Authorization: Bearer abcdefghijklmnop"],
    ["JWT", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"],
    ["API key", "sk-0123456789abcdefghij"],
    ["GitHub token", "ghp_0123456789abcdefghijklmnopqrstuvwx"],
    ["private key", "-----BEGIN RSA PRIVATE KEY-----"],
  ] as const) {
    red(() => buildDashboardView(SUBJECT, [receipt({ detail })], NOW), `a rendered ${label}`);
  }
}

// UX-WEB-007 disconnect and recovery
function disconnectRecovery(): void {
  const connected = buildDashboardView(SUBJECT, [receipt()], NOW);
  ok(connected.state === "RENDERED", "a connected complete view did not render");

  const dropped = buildDashboardView(SUBJECT, [receipt()], NOW, { connected: false });
  ok(dropped.state === "DISCONNECTED", "a disconnected view reported a completion state");
  ok(dropped.cells[0].status === "STALE" && dropped.cells[0].evidence !== "PASS", "a disconnected view retained a stale success");
  ok(!dropped.detail.includes("projection of"), "a disconnected view described itself as a current projection");

  // Reconnecting revalidates: the same receipt, now aged past the bound, is stale rather than
  // the success it was before the drop.
  const reconnected = buildDashboardView(SUBJECT, [receipt()], NOW + DEFAULT_BOUNDS.maxReceiptAgeMs + 2_000);
  ok(reconnected.state === "STALE", "a reconnected view kept a pre-disconnect success");
}

// UX-WEB-008 build and deploy cleanup
function buildDeploy(): void {
  ok(dashboardState.build === "NOT_EXERCISED", "package presence was projected as a build result");
  ok(dashboardState.previewCanary === "NOT_EXERCISED", "package presence was projected as a preview canary");
  ok(dashboardState.genui === "NOT_EXERCISED", "package presence was projected as GenUI evidence");
  ok(dashboardState.cloudDeployment === "NOT_IMPLEMENTED", "an unbuilt cloud deployment was projected as available");
}

// "No field of dashboardState is PASS" is proved by the compiler, not by a runtime scan: the
// object is `as const`, so tsc already knows the union of its values. A runtime check would be
// tautological -- it could never fail, which is exactly the shape of a guard worth deleting.
// This alias stops compiling the moment any field becomes "PASS".
type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const dashboardNeverPasses: NeverPass<typeof dashboardState> = true;
void dashboardNeverPasses;

function lifecycle(): void {
  ok(
    validateDashboardLifecycle(["UNINITIALIZED", "LOADING_SUBJECT", "VERIFYING_RECEIPTS", "READY", "RENDERED"] as DashboardState[]) === "RENDERED",
    "the happy lifecycle was rejected",
  );
  red(() => assertDashboardTransition("UNINITIALIZED", "RENDERED"), "a jump straight to RENDERED");
  red(() => assertDashboardTransition("ACTION_REQUESTED", "DISPATCHED"), "a dispatch that skipped authorization");
  red(
    () => validateDashboardLifecycle(["UNINITIALIZED", "LOADING_SUBJECT", "VERIFYING_RECEIPTS", "READY", "RENDERED", "STALE"] as DashboardState[]),
    "a lifecycle continuing past an outcome",
  );
}

fidelity();
subjectBinding();
authorization();
closedActions();
accessibility();
boundedContent();
disconnectRecovery();
buildDeploy();
lifecycle();

console.log("SELFTEST GREEN: UX-WEB fidelity, subject binding, authorization, closed actions, accessibility, bounded content, disconnect recovery, build/deploy boundary");
