import { createHash } from "node:crypto";
import {
  aggregateDigest,
  aggregateRefusal,
  childIdentityRefusal,
  claimUniquenessRefusal,
  humanAdmitRefusal,
  invalidatedBy as sharedInvalidatedBy,
  type AdmitExpectation,
  type ChildEvidence,
  type ExpectedChild,
  type HumanAdmit,
  type ModuleNode,
  type ProposedAggregate,
} from "../../../packages/contracts/src/convergence/index.ts";
import { validateReleaseConvergenceLifecycle } from "./state-machine.ts";
import {
  RELEASE_CONVERGENCE_RECEIPT_SCHEMA,
  RELEASE_LANES,
  RELEASE_REQUIRED_ISSUES,
  type AttestationPolicy,
  type ExpectedReleaseChild,
  type OriginEquivalenceLevel,
  type ProposedReleaseStatus,
  type ReleaseAttestation,
  type ReleaseChildReceipt,
  type ReleaseConvergenceControls,
  type ReleaseConvergenceOutcome,
  type ReleaseConvergenceReceipt,
  type ReleaseConvergenceState,
  type ReleaseDecision,
  type ReleaseLane,
  type ReleaseModuleNode,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const EVIDENCE_STATES = new Set(["PASS", "FAIL", "ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED"]);
const SAFE_TOOL = /^[a-z][a-z0-9_]{0,63}$/;
const EQUIVALENCE_RANK: Readonly<Record<OriginEquivalenceLevel, number>> = {
  none: 0,
  metadata: 1,
  artifact: 2,
  behavioral: 3,
};
const CONTROL_KEYS = [
  "deterministicCompositionCleared",
  "hostParityCleared",
  "carrierProxyFree",
  "mcpDefaultDenyCleared",
  "priorPinStable",
  "selectedPolicyTools",
  "achievedOriginEquivalence",
  "requiredOriginEquivalence",
  "orphanRemovalCleared",
  "rollbackTargetUnchanged",
  "rollbackControlsCleared",
  "residualGapsNamed",
] as const;

export function failReleaseConvergence(message: string): never {
  throw new Error(`invalid release convergence contract: ${message}`);
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function exactStringSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function assertSha256(value: string, name: string): void {
  if (!SHA_256.test(value)) failReleaseConvergence(`${name} must be a lowercase sha256 digest`);
}

function assertUniqueBoundedStrings(values: readonly string[], name: string, requireNonEmpty: boolean): void {
  if (requireNonEmpty && values.length === 0) failReleaseConvergence(`${name} must not be empty`);
  if (values.length > 128) failReleaseConvergence(`${name} has more than 128 entries`);
  if (new Set(values).size !== values.length) failReleaseConvergence(`${name} contains duplicates`);
  if (values.some((value) => value.length === 0 || value.length > 256 || /\p{Cc}/u.test(value))) {
    failReleaseConvergence(`${name} contains an invalid entry`);
  }
}

function assertTools(tools: readonly string[], name: string): void {
  assertUniqueBoundedStrings(tools, name, false);
  if (tools.some((tool) => !SAFE_TOOL.test(tool))) failReleaseConvergence(`${name} contains a non-portable tool name`);
}

function assertExactLanes(status: ProposedReleaseStatus): void {
  const actual = Object.keys(status.lanes).sort();
  const expected = [...RELEASE_LANES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failReleaseConvergence(`release status lanes are ${actual.join(", ") || "empty"}; expected ${expected.join(", ")}`);
  }
  for (const lane of RELEASE_LANES) {
    if (!EVIDENCE_STATES.has(status.lanes[lane])) {
      failReleaseConvergence(`status.lanes.${lane} is not an evidence state`);
    }
  }
}

function assertRequiredIssues(expected: readonly ExpectedReleaseChild[]): void {
  const actual = expected.map((child) => child.issue).sort((left, right) => left - right);
  const required = [...RELEASE_REQUIRED_ISSUES].sort((left, right) => left - right);
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    failReleaseConvergence(`expected child issues are ${actual.join(", ") || "empty"}; required ${required.join(", ")}`);
  }
}

function validateReleaseReceipt(receipt: ReleaseChildReceipt): void {
  if (!Number.isSafeInteger(receipt.issue) || receipt.issue <= 0) failReleaseConvergence("child issue must be a positive integer");
  if (!receipt.ownerId || !receipt.interfaceVersion) failReleaseConvergence(`child #${receipt.issue} has an empty identity`);
  assertSha256(receipt.subjectSha256, `child #${receipt.issue} subjectSha256`);
  assertSha256(receipt.headSha256, `child #${receipt.issue} headSha256`);
  assertSha256(receipt.lockSha256, `child #${receipt.issue} lockSha256`);
  assertSha256(receipt.compositionSha256, `child #${receipt.issue} compositionSha256`);
  if (!RELEASE_LANES.includes(receipt.lane)) failReleaseConvergence(`child #${receipt.issue} names an unknown release lane`);
  if (!EVIDENCE_STATES.has(receipt.state)) failReleaseConvergence(`child #${receipt.issue} has an invalid evidence state`);
  assertUniqueBoundedStrings(receipt.claims, `child #${receipt.issue} claims`, true);
}

function validateControls(controls: ReleaseConvergenceControls): void {
  const actual = Object.keys(controls).sort();
  const expected = [...CONTROL_KEYS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failReleaseConvergence(`release controls are ${actual.join(", ") || "empty"}; expected ${expected.join(", ")}`);
  }
  for (const key of CONTROL_KEYS) {
    if (key === "selectedPolicyTools" || key === "achievedOriginEquivalence" || key === "requiredOriginEquivalence") continue;
    if (typeof controls[key] !== "boolean") failReleaseConvergence(`controls.${key} must be boolean`);
  }
  assertTools(controls.selectedPolicyTools, "controls.selectedPolicyTools");
  if (!Object.hasOwn(EQUIVALENCE_RANK, controls.achievedOriginEquivalence)) {
    failReleaseConvergence("controls.achievedOriginEquivalence is invalid");
  }
  if (!Object.hasOwn(EQUIVALENCE_RANK, controls.requiredOriginEquivalence)) {
    failReleaseConvergence("controls.requiredOriginEquivalence is invalid");
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function duplicateIssue(values: readonly { issue: number }[]): number | null {
  const seen = new Set<number>();
  for (const value of values) {
    if (seen.has(value.issue)) return value.issue;
    seen.add(value.issue);
  }
  return null;
}

function toEvidence(receipt: ReleaseChildReceipt): ChildEvidence {
  return {
    issue: receipt.issue,
    ownerId: receipt.ownerId,
    interfaceVersion: receipt.interfaceVersion,
    subjectSha256: receipt.subjectSha256,
    claims: receipt.claims,
    lane: receipt.lane,
    state: receipt.state,
    cleanupCleared: receipt.cleanupCleared,
  };
}

function toExpected(child: ExpectedReleaseChild): ExpectedChild {
  return {
    issue: child.issue,
    ownerId: child.ownerId,
    interfaceVersion: child.interfaceVersion,
    subjectSha256: child.subjectSha256,
  };
}

function toProposal(status: ProposedReleaseStatus): ProposedAggregate {
  return { lanes: { ...status.lanes }, invalidatedModules: status.invalidatedModules };
}

function validateStatusShape(status: ProposedReleaseStatus): void {
  assertExactLanes(status);
  assertTools(status.publishedTools, "status.publishedTools");
  assertUniqueBoundedStrings(status.residualGaps, "status.residualGaps", true);
}

export function invalidatedReleaseModules(changed: string, modules: readonly ReleaseModuleNode[]): string[] {
  return sharedInvalidatedBy(changed, modules as readonly ModuleNode[]);
}

export function releaseChildRefusal(
  receipts: readonly ReleaseChildReceipt[],
  expected: readonly ExpectedReleaseChild[],
): { refusal: string; state: ReleaseConvergenceState } | null {
  assertRequiredIssues(expected);
  for (const receipt of receipts) validateReleaseReceipt(receipt);
  const duplicateExpected = duplicateIssue(expected);
  if (duplicateExpected !== null) failReleaseConvergence(`expected child #${duplicateExpected} is duplicated`);
  const duplicateReceipt = duplicateIssue(receipts);
  if (duplicateReceipt !== null) {
    return { refusal: `more than one receipt was supplied for child #${duplicateReceipt}`, state: "SUBJECT_MISMATCH" };
  }
  const refusal = childIdentityRefusal(receipts.map(toEvidence), expected.map(toExpected));
  if (refusal === null) return null;
  return {
    refusal: refusal.detail,
    state: refusal.kind === "absent" ? "CHILD_ABSENT" : "SUBJECT_MISMATCH",
  };
}

export function releaseClaimRefusal(receipts: readonly ReleaseChildReceipt[]): string | null {
  for (const receipt of receipts) {
    if (new Set(receipt.claims).size !== receipt.claims.length) return `child #${receipt.issue} repeats a release claim`;
  }
  return claimUniquenessRefusal(receipts.map(toEvidence));
}

export function releaseStatusRefusal(
  receipts: readonly ReleaseChildReceipt[],
  status: ProposedReleaseStatus,
  modules: readonly ReleaseModuleNode[],
  controls: ReleaseConvergenceControls,
): string | null {
  validateStatusShape(status);
  validateControls(controls);
  if (!exactStringSet(status.publishedTools, controls.selectedPolicyTools)) {
    return "published MCP tools do not exactly match the selected default-deny policy";
  }
  if (!controls.residualGapsNamed || status.residualGaps.length === 0) {
    return "provider/session/browser/device/security/production gaps are not explicitly named";
  }
  return aggregateRefusal(
    receipts.map(toEvidence),
    toProposal(status),
    modules as readonly ModuleNode[],
    "bettor-consumer",
  );
}

export function releaseConvergenceDigest(
  receipts: readonly ReleaseChildReceipt[],
  status: ProposedReleaseStatus,
  headSha256: string,
  lockSha256: string,
  compositionSha256: string,
  controls: ReleaseConvergenceControls,
): string {
  assertSha256(headSha256, "headSha256");
  assertSha256(lockSha256, "lockSha256");
  assertSha256(compositionSha256, "compositionSha256");
  validateStatusShape(status);
  validateControls(controls);
  const aggregate = aggregateDigest(receipts.map(toEvidence), toProposal(status));
  const releaseSpecific = receipts.map((receipt) => ({
    issue: receipt.issue,
    headSha256: receipt.headSha256,
    lockSha256: receipt.lockSha256,
    compositionSha256: receipt.compositionSha256,
    claims: sorted(receipt.claims),
    lane: receipt.lane,
    cleanupCleared: receipt.cleanupCleared,
  })).sort((left, right) => left.issue - right.issue);
  const canonicalControls = {
    ...controls,
    selectedPolicyTools: sorted(controls.selectedPolicyTools),
  };
  const canonicalStatus = {
    ...status,
    invalidatedModules: sorted(status.invalidatedModules),
    publishedTools: sorted(status.publishedTools),
    residualGaps: sorted(status.residualGaps),
  };
  return createHash("sha256")
    .update(canonical({ aggregate, headSha256, lockSha256, compositionSha256, canonicalControls, canonicalStatus, releaseSpecific }))
    .digest("hex");
}

export interface ReleaseConvergenceRequest {
  receipts: readonly ReleaseChildReceipt[];
  expected: readonly ExpectedReleaseChild[];
  modules: readonly ReleaseModuleNode[];
  status: ProposedReleaseStatus;
  headSha256: string;
  lockSha256: string;
  compositionSha256: string;
  controls: ReleaseConvergenceControls;
}

function expectedFor(issue: number, expected: readonly ExpectedReleaseChild[]): ExpectedReleaseChild {
  return expected.find((candidate) => candidate.issue === issue)
    ?? failReleaseConvergence(`receipt for unexpected child #${issue} reached lane validation`);
}

function firstFailed(receipts: readonly ReleaseChildReceipt[], lanes: readonly ReleaseLane[]): ReleaseChildReceipt | undefined {
  return receipts.find((receipt) => lanes.includes(receipt.lane) && receipt.state === "FAIL");
}

export function convergeRelease(request: ReleaseConvergenceRequest): { receipt: ReleaseConvergenceReceipt } {
  const { receipts, expected, modules, status, headSha256, lockSha256, compositionSha256, controls } = request;
  if (expected.length === 0) failReleaseConvergence("no expected children were pinned");
  if (modules.length === 0) failReleaseConvergence("the module graph is empty");
  assertSha256(headSha256, "headSha256");
  assertSha256(lockSha256, "lockSha256");
  assertSha256(compositionSha256, "compositionSha256");
  validateStatusShape(status);
  validateControls(controls);

  const lifecycle: ReleaseConvergenceState[] = ["CHILDREN_PENDING"];
  const done = (detail: string, digest: string | null = null): { receipt: ReleaseConvergenceReceipt } => {
    const snapshot = [...lifecycle];
    return {
      receipt: {
        schema: RELEASE_CONVERGENCE_RECEIPT_SCHEMA,
        lifecycle: snapshot,
        outcome: validateReleaseConvergenceLifecycle(snapshot),
        childCount: receipts.length,
        lanes: { ...status.lanes },
        invalidatedModules: sorted(status.invalidatedModules),
        publishedTools: sorted(status.publishedTools),
        residualGaps: sorted(status.residualGaps),
        headSha256,
        lockSha256,
        compositionSha256,
        releaseDigest: digest,
        detail,
      },
    };
  };

  const childRefused = releaseChildRefusal(receipts, expected);
  if (childRefused !== null) {
    lifecycle.push(childRefused.state);
    return done(childRefused.refusal);
  }
  lifecycle.push("SUBJECTS_PINNED");

  const mixedSubject = receipts.find((receipt) => {
    const pinned = expectedFor(receipt.issue, expected);
    return receipt.headSha256 !== headSha256
      || receipt.lockSha256 !== lockSha256
      || receipt.compositionSha256 !== compositionSha256
      || !SHA_256.test(receipt.headSha256)
      || !SHA_256.test(receipt.lockSha256)
      || !SHA_256.test(receipt.compositionSha256)
      || receipt.lane !== pinned.lane;
  });
  if (mixedSubject !== undefined) {
    lifecycle.push("SUBJECT_MISMATCH");
    return done(`child #${mixedSubject.issue} is bound to another head, lock, composition or evidence lane`);
  }
  const absent = receipts.find((receipt) => receipt.state === "ABSENT");
  if (absent !== undefined) {
    lifecycle.push("CHILD_ABSENT");
    return done(`child #${absent.issue} reports an absent mandatory integration subject`);
  }

  const claimRefused = releaseClaimRefusal(receipts);
  if (claimRefused !== null) {
    lifecycle.push("LOCK_CONFLICT");
    return done(claimRefused);
  }
  if (!controls.deterministicCompositionCleared) {
    lifecycle.push("LOCK_CONFLICT");
    return done("composition output depends on order, host state or another non-subject input");
  }
  if (!controls.mcpDefaultDenyCleared || !controls.priorPinStable) {
    lifecycle.push("LOCK_CONFLICT");
    return done("MCP default deny or the prior immutable consumer pin did not remain stable");
  }
  if (!exactStringSet(status.publishedTools, controls.selectedPolicyTools)) {
    lifecycle.push("LOCK_CONFLICT");
    return done("published MCP tools include a hidden/unselected tool or omit a selected one");
  }
  lifecycle.push("COMPOSITION_RESOLVED");

  const offlineFailed = firstFailed(receipts, ["offline"]);
  if (offlineFailed !== undefined) {
    lifecycle.push("OFFLINE_FAIL");
    return done(`child #${offlineFailed.issue} reports an offline composition failure`);
  }
  lifecycle.push("OFFLINE_VERIFIED");

  const claudeFailed = firstFailed(receipts, ["claude"]);
  if (claudeFailed !== undefined) {
    lifecycle.push("CLAUDE_FAIL");
    return done(`child #${claudeFailed.issue} reports a Claude carrier failure`);
  }
  lifecycle.push("CLAUDE_VERIFIED");

  const codexFailed = firstFailed(receipts, ["codex"]);
  if (codexFailed !== undefined || !controls.hostParityCleared || !controls.carrierProxyFree) {
    lifecycle.push("CODEX_FAIL");
    return done(
      codexFailed === undefined
        ? "Claude and Codex did not retain separate receipts over the same selected subject, or one carrier proxied the other"
        : `child #${codexFailed.issue} reports a Codex carrier failure`,
    );
  }
  lifecycle.push("CODEX_VERIFIED");

  const originFailed = firstFailed(receipts, ["github-origin", "forgejo-origin"]);
  if (originFailed !== undefined) {
    lifecycle.push("ORIGIN_FAIL");
    return done(`child #${originFailed.issue} reports an origin failure`);
  }
  lifecycle.push("ORIGINS_VERIFIED");

  const equivalenceFailed = firstFailed(receipts, ["equivalence"]);
  if (equivalenceFailed !== undefined
    || EQUIVALENCE_RANK[controls.achievedOriginEquivalence] < EQUIVALENCE_RANK[controls.requiredOriginEquivalence]) {
    lifecycle.push("EQUIVALENCE_FAIL");
    return done(
      equivalenceFailed === undefined
        ? `origin equivalence achieved ${controls.achievedOriginEquivalence}, below required ${controls.requiredOriginEquivalence}`
        : `child #${equivalenceFailed.issue} reports an origin-equivalence failure`,
    );
  }
  lifecycle.push("EQUIVALENCE_VERIFIED");

  const dirty = receipts.find((receipt) => !receipt.cleanupCleared);
  if (dirty !== undefined || !controls.orphanRemovalCleared) {
    lifecycle.push("CLEANUP_FAIL");
    return done(
      dirty === undefined
        ? "removing a module, Skill or runtime projection left an orphan"
        : `child #${dirty.issue} leaves a workspace, process, lease or projection residue`,
    );
  }
  if (!controls.rollbackTargetUnchanged || !controls.rollbackControlsCleared) {
    lifecycle.push("ROLLBACK_FAIL");
    return done("rollback target drifted from its lock or the exact rollback controls did not clear");
  }
  if (!controls.residualGapsNamed || status.residualGaps.length === 0) {
    lifecycle.push("LOCK_CONFLICT");
    return done("provider/session/browser/device/security/production gaps are not explicitly named");
  }
  lifecycle.push("REMOVAL_ROLLBACK_CONTROLS_VERIFIED");

  const statusRefused = releaseStatusRefusal(receipts, status, modules, controls);
  if (statusRefused !== null) {
    lifecycle.push("LOCK_CONFLICT");
    return done(statusRefused);
  }
  lifecycle.push("RELEASE_RECEIPT_RENDERED", "HUMAN_REVIEW");
  return done(
    "the exact reference composition and residual gaps are receipt-backed and await Human Admit",
    releaseConvergenceDigest(receipts, status, headSha256, lockSha256, compositionSha256, controls),
  );
}

export interface ReleaseDecisionRequest {
  receipt: ReleaseConvergenceReceipt;
  decision: ReleaseDecision;
  admit: HumanAdmit | null;
  approvers: readonly string[];
  nowEpochMs: number;
  maxAdmitAgeMs: number;
  attestationPolicy: AttestationPolicy;
  attestation: ReleaseAttestation | null;
  rollbackCleared: boolean;
}

function decided(
  receipt: ReleaseConvergenceReceipt,
  outcome: Exclude<ReleaseConvergenceOutcome, "HUMAN_REVIEW">,
  detail: string,
): { receipt: ReleaseConvergenceReceipt } {
  const lifecycle = [...receipt.lifecycle, outcome];
  return {
    receipt: {
      ...receipt,
      lifecycle,
      outcome: validateReleaseConvergenceLifecycle(lifecycle),
      lanes: { ...receipt.lanes },
      invalidatedModules: [...receipt.invalidatedModules],
      publishedTools: [...receipt.publishedTools],
      residualGaps: [...receipt.residualGaps],
      detail,
    },
  };
}

function attestationRefusal(attestation: ReleaseAttestation | null, receipt: ReleaseConvergenceReceipt): string | null {
  if (attestation === null) return "no release attestation was supplied";
  const actual = Object.keys(attestation).sort();
  const expected = ["artifactSha256", "headSha256", "lockSha256", "releaseDigest"].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) return "the attestation schema is not closed";
  if (!SHA_256.test(attestation.artifactSha256)) return "the attestation artifact is not content addressed";
  if (attestation.headSha256 !== receipt.headSha256) return "the attestation is bound to another head";
  if (attestation.lockSha256 !== receipt.lockSha256) return "the attestation is bound to another lock";
  if (attestation.releaseDigest !== receipt.releaseDigest) return "the attestation is bound to another release";
  return null;
}

export function adjudicateRelease(request: ReleaseDecisionRequest): { receipt: ReleaseConvergenceReceipt } {
  const {
    receipt,
    decision,
    admit,
    approvers,
    nowEpochMs,
    maxAdmitAgeMs,
    attestationPolicy,
    attestation,
    rollbackCleared,
  } = request;

  if (receipt.schema !== RELEASE_CONVERGENCE_RECEIPT_SCHEMA) failReleaseConvergence("receipt schema is unsupported");
  if (!["promote", "reject", "rollback"].includes(decision)) failReleaseConvergence("decision is invalid");
  if (!["optional", "required"].includes(attestationPolicy)) failReleaseConvergence("attestationPolicy is invalid");
  const observed = validateReleaseConvergenceLifecycle(receipt.lifecycle);
  if (observed !== receipt.outcome) failReleaseConvergence("receipt outcome does not match its lifecycle");
  if (receipt.outcome !== "HUMAN_REVIEW" || receipt.releaseDigest === null) {
    failReleaseConvergence("only a rendered HUMAN_REVIEW receipt can be adjudicated");
  }
  validateStatusShape({
    lanes: receipt.lanes,
    invalidatedModules: receipt.invalidatedModules,
    publishedTools: receipt.publishedTools,
    residualGaps: receipt.residualGaps,
  });
  assertSha256(receipt.headSha256, "receipt.headSha256");
  assertSha256(receipt.lockSha256, "receipt.lockSha256");
  assertSha256(receipt.compositionSha256, "receipt.compositionSha256");
  assertSha256(receipt.releaseDigest, "receipt.releaseDigest");

  if (decision === "reject") {
    return decided(receipt, "REJECTED", "the human reviewer explicitly rejected this release subject");
  }

  if (Object.values(receipt.lanes).some((state) => state !== "PASS")) {
    return decided(receipt, "HUMAN_REJECTED", "promotion or rollback was requested before every selected evidence lane reached PASS");
  }
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) {
    failReleaseConvergence("nowEpochMs must be a non-negative whole number of milliseconds");
  }
  if (!Number.isSafeInteger(maxAdmitAgeMs) || maxAdmitAgeMs <= 0) {
    failReleaseConvergence("maxAdmitAgeMs must be a positive whole number of milliseconds");
  }
  if (approvers.length === 0 || new Set(approvers).size !== approvers.length || approvers.some((id) => !id.trim())) {
    failReleaseConvergence("approvers must be a non-empty unique set of identities");
  }

  const expected: AdmitExpectation = {
    approvers,
    headSha256: receipt.headSha256,
    lockSha256: receipt.lockSha256,
    releaseDigest: receipt.releaseDigest,
    nowEpochMs,
    maxAdmitAgeMs,
  };
  const refused = humanAdmitRefusal(admit, expected);
  if (refused !== null) {
    return decided(receipt, "HUMAN_REJECTED", `Human Admit refused: ${refused}`);
  }

  const attestationProblem = attestationRefusal(attestation, receipt);
  if (attestationPolicy === "required" && attestationProblem !== null) {
    return decided(receipt, "ATTESTATION_REQUIRED_ABSENT", `required attestation refused: ${attestationProblem}`);
  }
  if (attestationPolicy === "optional" && attestation !== null && attestationProblem !== null) {
    return decided(receipt, "HUMAN_REJECTED", `supplied optional attestation refused: ${attestationProblem}`);
  }

  if (decision === "rollback") {
    if (!rollbackCleared) {
      return decided(receipt, "ROLLBACK_FAIL", "rollback did not clear removed tools, skills, workspaces, processes or leases");
    }
    return decided(receipt, "ROLLED_BACK", "an admitted human selected rollback and the exact removal controls cleared");
  }

  return decided(receipt, "PROMOTED", "an admitted human promoted the exact head, lock and release digest under the selected attestation policy");
}

export const releaseConvergenceState = {
  completeSameSubjectEvidence: "NOT_EXERCISED",
  deterministicComposition: "NOT_EXERCISED",
  claudeHostParity: "NOT_EXERCISED",
  codexHostParity: "NOT_EXERCISED",
  mcpDefaultDeny: "NOT_EXERCISED",
  githubOrigin: "NOT_EXERCISED",
  forgejoOrigin: "NOT_EXERCISED",
  originEquivalence: "NOT_EXERCISED",
  cleanupRemoval: "NOT_EXERCISED",
  rollbackControl: "NOT_EXERCISED",
  evidenceHonesty: "NOT_EXERCISED",
  humanAdmit: "NOT_EXERCISED",
  transitiveInvalidation: "NOT_EXERCISED",
  releaseAttestation: "ABSENT",
  productionRollout: "ABSENT",
} as const;
