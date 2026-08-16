import { createHash } from "node:crypto";
import {
  aggregateDigest,
  aggregateRefusal,
  childIdentityRefusal,
  claimUniquenessRefusal,
  invalidatedBy as sharedInvalidatedBy,
  type ChildEvidence,
  type ExpectedChild,
  type ModuleNode,
  type ProposedAggregate,
} from "../../../../packages/contracts/src/convergence/index.ts";
import { validateProductConvergenceLifecycle } from "./state-machine.ts";
import {
  PRODUCT_CONVERGENCE_RECEIPT_SCHEMA,
  PRODUCT_OBSERVATION_STATES,
  PRODUCT_PLATFORMS,
  PRODUCT_REQUIRED_ISSUES,
  type ExpectedProductChild,
  type ProductChildReceipt,
  type ProductConvergenceReceipt,
  type ProductConvergenceState,
  type ProductModuleNode,
  type ProductPlatform,
  type ProposedProductStatus,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const EVIDENCE_STATES = new Set(["PASS", "FAIL", "ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED"]);

export function failProductConvergence(message: string): never {
  throw new Error(`invalid product convergence contract: ${message}`);
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function exactStringSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function assertSha256(value: string, name: string): void {
  if (!SHA_256.test(value)) failProductConvergence(`${name} must be a lowercase sha256 digest`);
}

function assertExactPlatforms(status: ProposedProductStatus): void {
  const actual = Object.keys(status.platforms).sort();
  const expected = [...PRODUCT_PLATFORMS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failProductConvergence(`product status platforms are ${actual.join(", ") || "empty"}; expected ${expected.join(", ")}`);
  }
  for (const platform of PRODUCT_PLATFORMS) {
    if (!EVIDENCE_STATES.has(status.platforms[platform])) {
      failProductConvergence(`status.platforms.${platform} is not an evidence state`);
    }
  }
}

function assertRequiredIssues(expected: readonly ExpectedProductChild[]): void {
  const actual = expected.map((child) => child.issue).sort((left, right) => left - right);
  const required = [...PRODUCT_REQUIRED_ISSUES].sort((left, right) => left - right);
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    failProductConvergence(`expected child issues are ${actual.join(", ") || "empty"}; required ${required.join(", ")}`);
  }
}

function validateProductReceipt(receipt: ProductChildReceipt): void {
  if (!Number.isSafeInteger(receipt.issue) || receipt.issue <= 0) failProductConvergence("child issue must be a positive integer");
  if (!receipt.adapterId || !receipt.interfaceVersion) failProductConvergence(`child #${receipt.issue} has an empty identity`);
  assertSha256(receipt.subjectSha256, `child #${receipt.issue} subjectSha256`);
  assertSha256(receipt.contractSha256, `child #${receipt.issue} contractSha256`);
  if (!EVIDENCE_STATES.has(receipt.state)) failProductConvergence(`child #${receipt.issue} has an invalid evidence state`);
  if (new Set(receipt.actionIds).size !== receipt.actionIds.length) failProductConvergence(`child #${receipt.issue} repeats an action ID`);
  if (new Set(receipt.accessibilityIds).size !== receipt.accessibilityIds.length) failProductConvergence(`child #${receipt.issue} repeats an accessibility ID`);
  if (new Set(receipt.platforms).size !== receipt.platforms.length) failProductConvergence(`child #${receipt.issue} repeats a platform lane`);
  if (receipt.platforms.some((platform) => !PRODUCT_PLATFORMS.includes(platform))) {
    failProductConvergence(`child #${receipt.issue} names an unknown platform lane`);
  }
  if (receipt.observedStates.some((state) => !PRODUCT_OBSERVATION_STATES.includes(state))) {
    failProductConvergence(`child #${receipt.issue} names an unknown observation state`);
  }
}

function duplicateIssue(receipts: readonly { issue: number }[]): number | null {
  const seen = new Set<number>();
  for (const receipt of receipts) {
    if (seen.has(receipt.issue)) return receipt.issue;
    seen.add(receipt.issue);
  }
  return null;
}

function toIdentityEvidence(receipt: ProductChildReceipt): ChildEvidence {
  return {
    issue: receipt.issue,
    ownerId: receipt.adapterId,
    interfaceVersion: receipt.interfaceVersion,
    subjectSha256: receipt.subjectSha256,
    claims: [
      ...receipt.actionIds.map((id) => `action:${id}`),
      ...receipt.accessibilityIds.map((id) => `accessibility:${id}`),
    ],
    lane: receipt.platforms[0] ?? "absent",
    state: receipt.state,
    cleanupCleared: receipt.cleanupCleared,
  };
}

function toLaneEvidence(receipts: readonly ProductChildReceipt[]): ChildEvidence[] {
  return receipts.flatMap((receipt) => receipt.platforms.map((platform) => ({
    ...toIdentityEvidence(receipt),
    lane: platform,
  })));
}

function toExpected(child: ExpectedProductChild): ExpectedChild {
  return {
    issue: child.issue,
    ownerId: child.adapterId,
    interfaceVersion: child.interfaceVersion,
    subjectSha256: child.subjectSha256,
  };
}

function toProposal(status: ProposedProductStatus): ProposedAggregate {
  return { lanes: { ...status.platforms }, invalidatedModules: status.invalidatedModules };
}

export function invalidatedProductModules(changed: string, modules: readonly ProductModuleNode[]): string[] {
  return sharedInvalidatedBy(changed, modules as readonly ModuleNode[]);
}

export function productChildRefusal(
  receipts: readonly ProductChildReceipt[],
  expected: readonly ExpectedProductChild[],
): { refusal: string; state: ProductConvergenceState } | null {
  assertRequiredIssues(expected);
  for (const receipt of receipts) validateProductReceipt(receipt);
  const duplicateExpected = duplicateIssue(expected);
  if (duplicateExpected !== null) failProductConvergence(`expected child #${duplicateExpected} is duplicated`);
  const duplicateReceipt = duplicateIssue(receipts);
  if (duplicateReceipt !== null) {
    return { refusal: `more than one receipt was supplied for child #${duplicateReceipt}`, state: "SUBJECT_MISMATCH" };
  }
  const refusal = childIdentityRefusal(receipts.map(toIdentityEvidence), expected.map(toExpected));
  if (refusal === null) return null;
  return {
    refusal: refusal.detail,
    state: refusal.kind === "absent" ? "CHILD_ABSENT" : "SUBJECT_MISMATCH",
  };
}

export function productActionRefusal(receipts: readonly ProductChildReceipt[]): string | null {
  for (const receipt of receipts) {
    if (new Set(receipt.actionIds).size !== receipt.actionIds.length) return `child #${receipt.issue} repeats an action ID`;
    if (new Set(receipt.accessibilityIds).size !== receipt.accessibilityIds.length) return `child #${receipt.issue} repeats an accessibility ID`;
  }
  return claimUniquenessRefusal(receipts.map(toIdentityEvidence));
}

export function productStatusRefusal(
  receipts: readonly ProductChildReceipt[],
  status: ProposedProductStatus,
  modules: readonly ProductModuleNode[],
): string | null {
  assertExactPlatforms(status);
  return aggregateRefusal(
    toLaneEvidence(receipts),
    toProposal(status),
    modules as readonly ModuleNode[],
    "product-adapters",
  );
}

export function productReleaseDigest(
  receipts: readonly ProductChildReceipt[],
  status: ProposedProductStatus,
  contractSha256: string,
): string {
  assertSha256(contractSha256, "contractSha256");
  assertExactPlatforms(status);
  const aggregate = aggregateDigest(toLaneEvidence(receipts), toProposal(status));
  const productSpecific = receipts.map((receipt) => ({
    issue: receipt.issue,
    contractSha256: receipt.contractSha256,
    platforms: sorted(receipt.platforms),
    role: receipt.role,
    trustPlane: receipt.trustPlane,
    actions: sorted(receipt.actionIds),
    accessibility: sorted(receipt.accessibilityIds),
    observations: sorted(receipt.observedStates),
    authCleared: receipt.authCleared,
    publicCapabilityOnly: receipt.publicCapabilityOnly,
    genericToolExposed: receipt.genericToolExposed,
    listenerAuthenticated: receipt.listenerAuthenticated,
    artifactsAccounted: receipt.artifactsAccounted,
    cleanupCleared: receipt.cleanupCleared,
  })).sort((left, right) => left.issue - right.issue);
  return createHash("sha256")
    .update(JSON.stringify({ aggregate, contractSha256, productSpecific }))
    .digest("hex");
}

export interface ProductConvergenceRequest {
  receipts: readonly ProductChildReceipt[];
  expected: readonly ExpectedProductChild[];
  modules: readonly ProductModuleNode[];
  status: ProposedProductStatus;
  contractSha256: string;
}

function expectedFor(issue: number, expected: readonly ExpectedProductChild[]): ExpectedProductChild {
  return expected.find((candidate) => candidate.issue === issue)
    ?? failProductConvergence(`receipt for unexpected child #${issue} reached platform validation`);
}

function platformRefusal(
  receipts: readonly ProductChildReceipt[],
  expected: readonly ExpectedProductChild[],
): string | null {
  for (const receipt of receipts) {
    const pinned = expectedFor(receipt.issue, expected);
    if (new Set(receipt.platforms).size !== receipt.platforms.length) {
      return `child #${receipt.issue} repeats a platform lane`;
    }
    if (!exactStringSet(receipt.platforms, pinned.platforms)) {
      return `child #${receipt.issue} reports ${sorted(receipt.platforms).join("/") || "no platform"} instead of ${sorted(pinned.platforms).join("/")}`;
    }
    if (receipt.state === "ABSENT") return `child #${receipt.issue} reports an absent mandatory platform subject`;
  }
  const expectedPlatforms = new Set(expected.flatMap((child) => child.platforms));
  const observedPlatforms = new Set(receipts.flatMap((receipt) => receipt.platforms));
  for (const platform of expectedPlatforms) {
    if (!observedPlatforms.has(platform)) return `mandatory platform ${platform} has no receipt`;
  }
  return null;
}

function missingObservationState(receipt: ProductChildReceipt): string | null {
  if (receipt.role === "contract") return null;
  const observed = new Set(receipt.observedStates);
  return PRODUCT_OBSERVATION_STATES.find((state) => !observed.has(state)) ?? null;
}

export function convergeProduct(request: ProductConvergenceRequest): { receipt: ProductConvergenceReceipt } {
  const { receipts, expected, modules, status, contractSha256 } = request;
  if (expected.length === 0) failProductConvergence("no expected children were pinned");
  if (modules.length === 0) failProductConvergence("the module graph is empty");
  assertSha256(contractSha256, "contractSha256");
  assertExactPlatforms(status);

  const lifecycle: ProductConvergenceState[] = ["CHILDREN_PENDING"];
  const done = (detail: string, digest: string | null = null): { receipt: ProductConvergenceReceipt } => {
    const snapshot = [...lifecycle];
    return {
      receipt: {
        schema: PRODUCT_CONVERGENCE_RECEIPT_SCHEMA,
        lifecycle: snapshot,
        outcome: validateProductConvergenceLifecycle(snapshot),
        childCount: receipts.length,
        contractSha256,
        platforms: { ...status.platforms },
        invalidatedModules: [...status.invalidatedModules].sort(),
        releaseDigest: digest,
        detail,
      },
    };
  };

  const childRefused = productChildRefusal(receipts, expected);
  if (childRefused !== null) {
    lifecycle.push(childRefused.state);
    return done(childRefused.refusal);
  }
  lifecycle.push("SUBJECTS_PINNED");

  const mixedContract = receipts.find((receipt) => receipt.contractSha256 !== contractSha256 || !SHA_256.test(receipt.contractSha256));
  if (mixedContract !== undefined) {
    lifecycle.push("SUBJECT_MISMATCH");
    return done(`child #${mixedContract.issue} is bound to another or malformed product contract`);
  }

  const roleMismatch = receipts.find((receipt) => receipt.role !== expectedFor(receipt.issue, expected).role);
  if (roleMismatch !== undefined) {
    lifecycle.push("SUBJECT_MISMATCH");
    return done(`child #${roleMismatch.issue} reports another product role`);
  }

  const actionRefused = productActionRefusal(receipts);
  if (actionRefused !== null) {
    lifecycle.push("ACTION_CONFLICT");
    return done(actionRefused);
  }
  lifecycle.push("ACTION_REGISTRY_RESOLVED");

  const platformRefused = platformRefusal(receipts, expected);
  if (platformRefused !== null) {
    lifecycle.push("PLATFORM_ABSENT");
    return done(platformRefused);
  }
  lifecycle.push("PLATFORM_MATRIX_RUNNING", "AUTOMATION_MATRIX_RUNNING");

  const automation = receipts.find((receipt) => receipt.role === "automation");
  if (automation === undefined || automation.state === "FAIL" || !automation.publicCapabilityOnly || automation.genericToolExposed) {
    lifecycle.push("AUTOMATION_FAIL");
    return done("automation is absent, failed, bypasses public capabilities, or exposes a generic tool");
  }
  const projection = receipts.find(
    (receipt) => receipt.role === "projection" && (receipt.state === "FAIL" || !receipt.publicCapabilityOnly),
  );
  if (projection !== undefined) {
    lifecycle.push("PROJECTION_FAIL");
    return done(`child #${projection.issue} exposes a raw/private projection path or reports failure`);
  }
  const trustMismatch = receipts.find((receipt) => receipt.trustPlane !== expectedFor(receipt.issue, expected).trustPlane);
  if (trustMismatch !== undefined) {
    lifecycle.push("AUTH_FAIL");
    return done(`child #${trustMismatch.issue} reports another bridge trust plane`);
  }
  const inApp = receipts.filter((receipt) => receipt.trustPlane === "in-app");
  const external = receipts.filter((receipt) => receipt.trustPlane === "external-mcp");
  if (inApp.length !== 1 || external.length !== 1 || inApp[0]!.adapterId === external[0]!.adapterId) {
    lifecycle.push("AUTH_FAIL");
    return done("In-App and External MCP trust planes are not separate one-owner boundaries");
  }
  lifecycle.push("SECURITY_STATE_CONTROLS_RUNNING");

  const authFailure = receipts.find((receipt) => !receipt.authCleared || (receipt.trustPlane === "external-mcp" && !receipt.listenerAuthenticated));
  if (authFailure !== undefined) {
    lifecycle.push("AUTH_FAIL");
    return done(`child #${authFailure.issue} reports an unauthenticated action, listener or trust plane`);
  }
  const unsafeBridge = receipts.find(
    (receipt) => receipt.trustPlane !== "none" && (!receipt.publicCapabilityOnly || receipt.genericToolExposed),
  );
  if (unsafeBridge !== undefined) {
    lifecycle.push("AUTOMATION_FAIL");
    return done(`child #${unsafeBridge.issue} combines a trust plane with a raw or generic endpoint`);
  }
  const unfaithful = receipts.find((receipt) => {
    if (receipt.role === "contract") return false;
    return receipt.accessibilityIds.length === 0
      || new Set(receipt.accessibilityIds).size !== receipt.accessibilityIds.length
      || missingObservationState(receipt) !== null
      || receipt.state === "FAIL";
  });
  if (unfaithful !== undefined) {
    lifecycle.push("ACCESSIBILITY_FAIL");
    const missing = missingObservationState(unfaithful);
    return done(
      missing === null
        ? `child #${unfaithful.issue} does not preserve stable accessibility/state observations`
        : `child #${unfaithful.issue} does not distinguish ${missing}`,
    );
  }
  const dirty = receipts.find((receipt) => !receipt.artifactsAccounted || !receipt.cleanupCleared);
  if (dirty !== undefined) {
    lifecycle.push("CLEANUP_FAIL");
    return done(`child #${dirty.issue} leaves an unaccounted artifact, report, socket, process, port, device or lease`);
  }
  lifecycle.push("CLEANUP_CHECKED", "RELEASE_RENDERED");

  const statusRefused = productStatusRefusal(receipts, status, modules);
  if (statusRefused !== null) {
    lifecycle.push("RELEASE_DRIFT");
    return done(statusRefused);
  }

  lifecycle.push("HUMAN_REVIEW");
  return done(
    "the product aggregate truthfully preserves exact subjects, platforms and trust planes and awaits Human Admit",
    productReleaseDigest(receipts, status, contractSha256),
  );
}

export const productConvergenceState = {
  childSubjectClosure: "NOT_EXERCISED",
  actionRegistry: "NOT_EXERCISED",
  stateFidelity: "NOT_EXERCISED",
  platformSeparation: "NOT_EXERCISED",
  automationBoundary: "NOT_EXERCISED",
  bridgeBoundary: "NOT_EXERCISED",
  cleanupAccounting: "NOT_EXERCISED",
  transitiveInvalidation: "NOT_EXERCISED",
  deterministicRelease: "NOT_EXERCISED",
  cloudIos: "NOT_IMPLEMENTED",
  physicalDeviceRuns: "NOT_EXERCISED",
  storeApproval: "ABSENT",
} as const;
