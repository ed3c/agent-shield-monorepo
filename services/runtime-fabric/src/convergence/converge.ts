import {
  aggregateDigest,
  aggregateRefusal,
  childIdentityRefusal,
  claimUniquenessRefusal,
  invalidatedBy as sharedInvalidatedBy,
  type ChildEvidence,
  type ExpectedChild as SharedExpectedChild,
  type ModuleNode as SharedModuleNode,
  type ProposedAggregate,
} from "../../../../packages/contracts/src/convergence/index.ts";
import { validateConvergenceLifecycle } from "./state-machine.ts";
import {
  CONVERGENCE_RECEIPT_SCHEMA,
  type ChildReceipt,
  type ConvergenceReceipt,
  type ConvergenceState,
  type ExpectedChild,
  type ModuleNode,
  type ProposedStatus,
  type RouteState,
  type RuntimeRoute,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const ROUTES: readonly RuntimeRoute[] = ["local", "cloud", "hybrid"];

export function fail(message: string): never {
  throw new Error(`invalid convergence contract: ${message}`);
}

// The five rules below are the shared convergence contract, not Phase 3 logic. #44, #53, #64 and
// #75 state them in their own vocabulary and mean the same thing, so they live in
// `packages/contracts/src/convergence/` and this leaf supplies only the Phase 3 subjects and the
// Phase 3 terminal mapping.
//
// What stays here: the state machine, which is genuinely per-phase -- #44 has three route
// failures, #53 has platform lanes, #75 has rollback states.

function toEvidence(receipt: ChildReceipt): ChildEvidence {
  return {
    issue: receipt.issue,
    ownerId: receipt.providerId,
    interfaceVersion: receipt.interfaceVersion,
    subjectSha256: receipt.providerSubjectSha256,
    claims: receipt.capabilities,
    lane: receipt.route,
    state: receipt.state,
    cleanupCleared: receipt.cleanupCleared,
  };
}

function toExpected(child: ExpectedChild): SharedExpectedChild {
  return {
    issue: child.issue,
    ownerId: child.providerId,
    interfaceVersion: child.interfaceVersion,
    subjectSha256: child.providerSubjectSha256,
  };
}

function toProposal(status: ProposedStatus): ProposedAggregate {
  return { lanes: { ...status.routes }, invalidatedModules: status.invalidatedModules };
}

export function invalidatedBy(changed: string, modules: readonly ModuleNode[]): string[] {
  return sharedInvalidatedBy(changed, modules as readonly SharedModuleNode[]);
}

// RT-CONV-001. The shared rule reports `absent` or `mismatch`; Phase 3 maps those to its own
// two terminals, which is the part that does not generalise.
export function childRefusal(
  receipts: readonly ChildReceipt[],
  expected: readonly ExpectedChild[],
): { refusal: string; state: ConvergenceState } | null {
  const refusal = childIdentityRefusal(receipts.map(toEvidence), expected.map(toExpected));
  if (refusal === null) return null;
  return { refusal: refusal.detail, state: refusal.kind === "absent" ? "CHILD_ABSENT" : "SUBJECT_MISMATCH" };
}

// RT-CONV-002.
export function capabilityRefusal(receipts: readonly ChildReceipt[]): string | null {
  return claimUniquenessRefusal(receipts.map(toEvidence));
}

// RT-CONV-009.
export function releaseDigest(receipts: readonly ChildReceipt[], status: ProposedStatus): string {
  return aggregateDigest(receipts.map(toEvidence), toProposal(status));
}

export function statusRefusal(
  receipts: readonly ChildReceipt[],
  status: ProposedStatus,
  modules: readonly ModuleNode[],
): string | null {
  return aggregateRefusal(receipts.map(toEvidence), toProposal(status), modules as readonly SharedModuleNode[], "runtime-fabric");
}

export interface ConvergenceRequest {
  receipts: readonly ChildReceipt[];
  expected: readonly ExpectedChild[];
  modules: readonly ModuleNode[];
  status: ProposedStatus;
}

// CHILDREN_PENDING → SUBJECTS_PINNED → REGISTRY_RESOLVED → MATRIX_RUNNING
//                 → CONTROLS_RUNNING → CLEANUP_CHECKED → RELEASE_RENDERED → HUMAN_REVIEW
//
// The run ends at HUMAN_REVIEW by construction. #44 owns promotion and promotion is Human
// Admit, so there is no path from a deterministic run to ADMITTED.
export function converge(request: ConvergenceRequest): { receipt: ConvergenceReceipt } {
  const { receipts, expected, modules, status } = request;
  if (expected.length === 0) fail("no expected children were pinned");
  if (modules.length === 0) fail("the module graph is empty");

  const lifecycle: ConvergenceState[] = ["CHILDREN_PENDING"];
  const done = (detail: string, digest: string | null = null): { receipt: ConvergenceReceipt } => ({
    receipt: {
      schema: CONVERGENCE_RECEIPT_SCHEMA,
      lifecycle,
      outcome: validateConvergenceLifecycle(lifecycle),
      childCount: receipts.length,
      routes: { ...status.routes },
      invalidatedModules: [...status.invalidatedModules].sort(),
      releaseDigest: digest,
      detail,
    },
  });

  const childRefused = childRefusal(receipts, expected);
  if (childRefused !== null) {
    lifecycle.push(childRefused.state);
    return done(childRefused.refusal);
  }
  lifecycle.push("SUBJECTS_PINNED");

  const capabilityRefused = capabilityRefusal(receipts);
  if (capabilityRefused !== null) {
    lifecycle.push("CAPABILITY_CONFLICT");
    return done(capabilityRefused);
  }
  lifecycle.push("REGISTRY_RESOLVED", "MATRIX_RUNNING");

  // A route whose own children report a failure fails here, before any aggregate is rendered.
  // The three route failures are distinct states because the phase's rollback subject differs:
  // a cloud failure and a hybrid failure are not the same investigation.
  for (const route of ROUTES) {
    const failed = receipts.find((receipt) => receipt.route === route && receipt.state === "FAIL");
    if (failed !== undefined) {
      lifecycle.push(route === "local" ? "LOCAL_FAIL" : route === "cloud" ? "CLOUD_FAIL" : "HYBRID_FAIL");
      return done(`child #${failed.issue} reports a ${route} failure`);
    }
  }
  lifecycle.push("CONTROLS_RUNNING");

  const uncleaned = receipts.find((receipt) => !receipt.cleanupCleared);
  if (uncleaned !== undefined) {
    lifecycle.push("CLEANUP_FAIL");
    return done(`child #${uncleaned.issue} reports uncleared residue`);
  }
  lifecycle.push("CLEANUP_CHECKED", "RELEASE_RENDERED");

  const statusRefused = statusRefusal(receipts, status, modules);
  if (statusRefused !== null) {
    lifecycle.push("RELEASE_DRIFT");
    return done(statusRefused);
  }
  lifecycle.push("HUMAN_REVIEW");
  return done("the aggregate is supported by its child receipts and awaits Human Admit", releaseDigest(receipts, status));
}

// What this leaf may claim. The four deterministic evals are exercised; the five that need the
// merged provider leaves are not, and the eval suite pins the type so widening any of them to
// PASS fails to compile.
export const runtimeConvergenceState = {
  childIdentity: "NOT_EXERCISED",
  capabilityUniqueness: "NOT_EXERCISED",
  transitiveInvalidation: "NOT_EXERCISED",
  deterministicRelease: "NOT_EXERCISED",
  localIndependence: "NOT_IMPLEMENTED",
  cloudIndependence: "NOT_IMPLEMENTED",
  hybridProtocol: "NOT_IMPLEMENTED",
  policyPtyComposition: "NOT_IMPLEMENTED",
  crossProviderCleanup: "NOT_IMPLEMENTED",
} as const;
