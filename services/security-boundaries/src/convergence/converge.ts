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
import { validateSecurityConvergenceLifecycle } from "./state-machine.ts";
import {
  SECURITY_CONVERGENCE_RECEIPT_SCHEMA,
  SECURITY_LANES,
  SECURITY_REQUIRED_ISSUES,
  type ExpectedSecurityChild,
  type ProposedSecurityStatus,
  type SecurityChildReceipt,
  type SecurityConvergenceControls,
  type SecurityConvergenceReceipt,
  type SecurityConvergenceState,
  type SecurityLane,
  type SecurityModuleNode,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const EVIDENCE_STATES = new Set(["PASS", "FAIL", "ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED"]);
const CONTROL_KEYS = [
  "ceremonyAdmitSha256",
  "lowRiskSessionLimitsCleared",
  "highRiskHardwareEnforced",
  "replayAndStalenessCleared",
  "compromisedComponentCleared",
  "threatModelMeasured",
  "lostSubjectRecoveryCleared",
  "automaticUnsafeRecoveryDisabled",
  "ledgerChainConsistencyCleared",
  "confirmationStatesDistinct",
  "adversarialInputsCleared",
  "secrecyPrivacyCleared",
  "cleanupRevocationCleared",
  "auditScopesRecorded",
  "residualRisksRecorded",
  "claimLanguageCleared",
] as const;

export function failSecurityConvergence(message: string): never {
  throw new Error(`invalid security convergence contract: ${message}`);
}

function assertSha256(value: string, name: string): void {
  if (!SHA_256.test(value)) failSecurityConvergence(`${name} must be a lowercase sha256 digest`);
}

function assertExactLanes(status: ProposedSecurityStatus): void {
  const actual = Object.keys(status.lanes).sort();
  const expected = [...SECURITY_LANES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failSecurityConvergence(`security status lanes are ${actual.join(", ") || "empty"}; expected ${expected.join(", ")}`);
  }
  for (const lane of SECURITY_LANES) {
    if (!EVIDENCE_STATES.has(status.lanes[lane])) {
      failSecurityConvergence(`status.lanes.${lane} is not an evidence state`);
    }
  }
}

function assertRequiredIssues(expected: readonly ExpectedSecurityChild[]): void {
  const actual = expected.map((child) => child.issue).sort((left, right) => left - right);
  const required = [...SECURITY_REQUIRED_ISSUES].sort((left, right) => left - right);
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    failSecurityConvergence(`expected child issues are ${actual.join(", ") || "empty"}; required ${required.join(", ")}`);
  }
}

function validateSecurityReceipt(receipt: SecurityChildReceipt): void {
  if (!Number.isSafeInteger(receipt.issue) || receipt.issue <= 0) failSecurityConvergence("child issue must be a positive integer");
  if (!receipt.providerId || !receipt.interfaceVersion) failSecurityConvergence(`child #${receipt.issue} has an empty identity`);
  assertSha256(receipt.subjectSha256, `child #${receipt.issue} subjectSha256`);
  assertSha256(receipt.ceremonySha256, `child #${receipt.issue} ceremonySha256`);
  if (!SECURITY_LANES.includes(receipt.lane)) failSecurityConvergence(`child #${receipt.issue} names an unknown security lane`);
  if (!EVIDENCE_STATES.has(receipt.state)) failSecurityConvergence(`child #${receipt.issue} has an invalid evidence state`);
  if (receipt.capabilities.length === 0) failSecurityConvergence(`child #${receipt.issue} claims no capability`);
  if (new Set(receipt.capabilities).size !== receipt.capabilities.length) {
    failSecurityConvergence(`child #${receipt.issue} repeats a capability`);
  }
}

function validateControls(controls: SecurityConvergenceControls): void {
  const actual = Object.keys(controls).sort();
  const expected = [...CONTROL_KEYS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failSecurityConvergence(`security controls are ${actual.join(", ") || "empty"}; expected ${expected.join(", ")}`);
  }
  for (const key of CONTROL_KEYS) {
    if (key === "ceremonyAdmitSha256") continue;
    if (typeof controls[key] !== "boolean") failSecurityConvergence(`controls.${key} must be boolean`);
  }
  if (controls.ceremonyAdmitSha256 !== null && !SHA_256.test(controls.ceremonyAdmitSha256)) {
    failSecurityConvergence("controls.ceremonyAdmitSha256 must be null or a lowercase sha256 digest");
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

function toEvidence(receipt: SecurityChildReceipt): ChildEvidence {
  return {
    issue: receipt.issue,
    ownerId: receipt.providerId,
    interfaceVersion: receipt.interfaceVersion,
    subjectSha256: receipt.subjectSha256,
    claims: receipt.capabilities,
    lane: receipt.lane,
    state: receipt.state,
    cleanupCleared: receipt.cleanupCleared,
  };
}

function toExpected(child: ExpectedSecurityChild): ExpectedChild {
  return {
    issue: child.issue,
    ownerId: child.providerId,
    interfaceVersion: child.interfaceVersion,
    subjectSha256: child.subjectSha256,
  };
}

function toProposal(status: ProposedSecurityStatus): ProposedAggregate {
  return { lanes: { ...status.lanes }, invalidatedModules: status.invalidatedModules };
}

export function invalidatedSecurityModules(changed: string, modules: readonly SecurityModuleNode[]): string[] {
  return sharedInvalidatedBy(changed, modules as readonly ModuleNode[]);
}

export function securityChildRefusal(
  receipts: readonly SecurityChildReceipt[],
  expected: readonly ExpectedSecurityChild[],
): { refusal: string; state: SecurityConvergenceState } | null {
  assertRequiredIssues(expected);
  for (const receipt of receipts) validateSecurityReceipt(receipt);
  const duplicateExpected = duplicateIssue(expected);
  if (duplicateExpected !== null) failSecurityConvergence(`expected child #${duplicateExpected} is duplicated`);
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

export function securityCapabilityRefusal(receipts: readonly SecurityChildReceipt[]): string | null {
  for (const receipt of receipts) {
    if (new Set(receipt.capabilities).size !== receipt.capabilities.length) {
      return `child #${receipt.issue} repeats a capability`;
    }
  }
  return claimUniquenessRefusal(receipts.map(toEvidence));
}

export function securityStatusRefusal(
  receipts: readonly SecurityChildReceipt[],
  status: ProposedSecurityStatus,
  modules: readonly SecurityModuleNode[],
): string | null {
  assertExactLanes(status);
  return aggregateRefusal(
    receipts.map(toEvidence),
    toProposal(status),
    modules as readonly ModuleNode[],
    "security-boundaries",
  );
}

export function securityReleaseDigest(
  receipts: readonly SecurityChildReceipt[],
  status: ProposedSecurityStatus,
  ceremonySha256: string,
  controls: SecurityConvergenceControls,
): string {
  assertSha256(ceremonySha256, "ceremonySha256");
  assertExactLanes(status);
  validateControls(controls);
  const aggregate = aggregateDigest(receipts.map(toEvidence), toProposal(status));
  const securitySpecific = receipts.map((receipt) => ({
    issue: receipt.issue,
    ceremonySha256: receipt.ceremonySha256,
    capabilities: [...receipt.capabilities].sort(),
    lane: receipt.lane,
    cleanupCleared: receipt.cleanupCleared,
  })).sort((left, right) => left.issue - right.issue);
  return createHash("sha256")
    .update(canonical({ aggregate, ceremonySha256, controls, securitySpecific }))
    .digest("hex");
}

export interface SecurityConvergenceRequest {
  receipts: readonly SecurityChildReceipt[];
  expected: readonly ExpectedSecurityChild[];
  modules: readonly SecurityModuleNode[];
  status: ProposedSecurityStatus;
  ceremonySha256: string;
  controls: SecurityConvergenceControls;
}

function expectedFor(issue: number, expected: readonly ExpectedSecurityChild[]): ExpectedSecurityChild {
  return expected.find((candidate) => candidate.issue === issue)
    ?? failSecurityConvergence(`receipt for unexpected child #${issue} reached lane validation`);
}

function laneFailure(lane: SecurityLane): SecurityConvergenceState {
  const failures: Record<SecurityLane, SecurityConvergenceState> = {
    policy: "POLICY_FAIL",
    hardware: "HARDWARE_FAIL",
    signing: "SIGNING_FAIL",
    ledger: "LEDGER_FAIL",
    contract: "CONTRACT_FAIL",
    testnet: "TESTNET_FAIL",
  };
  return failures[lane];
}

export function convergeSecurity(request: SecurityConvergenceRequest): { receipt: SecurityConvergenceReceipt } {
  const { receipts, expected, modules, status, ceremonySha256, controls } = request;
  if (expected.length === 0) failSecurityConvergence("no expected children were pinned");
  if (modules.length === 0) failSecurityConvergence("the module graph is empty");
  assertSha256(ceremonySha256, "ceremonySha256");
  assertExactLanes(status);
  validateControls(controls);

  const lifecycle: SecurityConvergenceState[] = ["CHILDREN_PENDING"];
  const done = (detail: string, digest: string | null = null): { receipt: SecurityConvergenceReceipt } => {
    const snapshot = [...lifecycle];
    return {
      receipt: {
        schema: SECURITY_CONVERGENCE_RECEIPT_SCHEMA,
        lifecycle: snapshot,
        outcome: validateSecurityConvergenceLifecycle(snapshot),
        childCount: receipts.length,
        ceremonySha256,
        lanes: { ...status.lanes },
        invalidatedModules: [...status.invalidatedModules].sort(),
        releaseDigest: digest,
        detail,
      },
    };
  };

  const childRefused = securityChildRefusal(receipts, expected);
  if (childRefused !== null) {
    lifecycle.push(childRefused.state);
    return done(childRefused.refusal);
  }
  lifecycle.push("SUBJECTS_PINNED");

  const mixedSubject = receipts.find((receipt) => {
    const pinned = expectedFor(receipt.issue, expected);
    return receipt.ceremonySha256 !== ceremonySha256
      || !SHA_256.test(receipt.ceremonySha256)
      || receipt.lane !== pinned.lane;
  });
  if (mixedSubject !== undefined) {
    lifecycle.push("SUBJECT_MISMATCH");
    return done(`child #${mixedSubject.issue} is bound to another ceremony or security lane`);
  }
  const absent = receipts.find((receipt) => receipt.state === "ABSENT");
  if (absent !== undefined) {
    lifecycle.push("CHILD_ABSENT");
    return done(`child #${absent.issue} reports an absent mandatory security subject`);
  }

  const capabilityRefused = securityCapabilityRefusal(receipts);
  if (capabilityRefused !== null) {
    lifecycle.push("CAPABILITY_CONFLICT");
    return done(capabilityRefused);
  }
  lifecycle.push("CAPABILITIES_RESOLVED", "CEREMONY_PRECHECK");

  if (controls.ceremonyAdmitSha256 === null || !SHA_256.test(controls.ceremonyAdmitSha256)) {
    lifecycle.push("CEREMONY_REFUSED");
    return done("the test ceremony has no exact Human-approved receipt");
  }
  if (!controls.replayAndStalenessCleared) {
    lifecycle.push("CEREMONY_REFUSED");
    return done("expired, replayed, revoked or wrong-epoch ceremony evidence remained admissible");
  }
  if (!controls.lowRiskSessionLimitsCleared) {
    lifecycle.push("POLICY_FAIL");
    return done("the low-risk route widened session authority beyond policy");
  }
  if (!controls.highRiskHardwareEnforced) {
    lifecycle.push("HARDWARE_FAIL");
    return done("the high-risk route bypassed its Secure Enclave and NFC evidence boundary");
  }
  lifecycle.push("E2E_REFERENCE_RUNNING");

  for (const lane of SECURITY_LANES) {
    const failed = receipts.find((receipt) => receipt.lane === lane && receipt.state === "FAIL");
    if (failed !== undefined) {
      lifecycle.push(laneFailure(lane));
      return done(`child #${failed.issue} reports a ${lane} failure`);
    }
  }
  lifecycle.push("ADVERSARIAL_SUITE_RUNNING");

  if (!controls.adversarialInputsCleared) {
    lifecycle.push("POLICY_FAIL");
    return done("an invalid policy/evidence/share/signature/contract, timeout, partition or reorg control stayed green");
  }
  if (!controls.compromisedComponentCleared) {
    lifecycle.push("SIGNING_FAIL");
    return done("one compromised client, node or provider could authorize the end-to-end operation");
  }
  if (!controls.threatModelMeasured || !controls.secrecyPrivacyCleared) {
    lifecycle.push("AUDIT_GAP");
    return done("the threat model is unmeasured or a secret/key/shard/NFC/device/session/token crossed an evidence boundary");
  }
  if (!controls.ledgerChainConsistencyCleared) {
    lifecycle.push("LEDGER_FAIL");
    return done("intent, workflow, operation, ledger and testnet receipts do not reconcile");
  }
  if (!controls.confirmationStatesDistinct) {
    lifecycle.push("TESTNET_FAIL");
    return done("included, confirmed and recorded states were collapsed");
  }
  lifecycle.push("RECOVERY_SUITE_RUNNING");

  if (!controls.lostSubjectRecoveryCleared || !controls.automaticUnsafeRecoveryDisabled) {
    lifecycle.push("RECOVERY_FAIL");
    return done("lost-device/card recovery did not revoke and re-provision safely or allowed automatic unsafe recovery");
  }
  const dirty = receipts.find((receipt) => !receipt.cleanupCleared);
  if (dirty !== undefined || !controls.cleanupRevocationCleared) {
    lifecycle.push("CLEANUP_FAIL");
    return done(
      dirty === undefined
        ? "security cleanup/revocation controls did not clear"
        : `child #${dirty.issue} leaves a process, lease, session, credential, artifact or stale authority`,
    );
  }
  lifecycle.push("CLEANUP_REVOCATION_CHECKED", "RESIDUAL_RISK_REVIEWED");

  if (!controls.auditScopesRecorded || !controls.residualRisksRecorded || !controls.claimLanguageCleared) {
    lifecycle.push("AUDIT_GAP");
    return done("audit scopes/findings/limitations or residual risks are absent, or claim language is absolute/unmeasured");
  }
  lifecycle.push("RELEASE_RENDERED");

  const statusRefused = securityStatusRefusal(receipts, status, modules);
  if (statusRefused !== null) {
    lifecycle.push("AUDIT_GAP");
    return done(`release evidence is dishonest: ${statusRefused}`);
  }

  lifecycle.push("HUMAN_REVIEW");
  return done(
    "the test/reference security aggregate is exact and awaits Human Admit; it grants no production custody or mainnet authority",
    securityReleaseDigest(receipts, status, ceremonySha256, controls),
  );
}

export const securityConvergenceState = {
  childSubjectClosure: "NOT_EXERCISED",
  routeMatrix: "NOT_EXERCISED",
  replayStaleness: "NOT_EXERCISED",
  compromisedComponent: "NOT_EXERCISED",
  lostSubjectRecovery: "NOT_EXERCISED",
  ledgerChainConsistency: "NOT_EXERCISED",
  adversarialControls: "NOT_EXERCISED",
  secrecyPrivacyScan: "NOT_EXERCISED",
  cleanupRevocation: "NOT_EXERCISED",
  auditResidualRisk: "NOT_EXERCISED",
  deterministicRelease: "NOT_EXERCISED",
  nativeHardware: "NOT_IMPLEMENTED",
  thresholdSigning: "NOT_IMPLEMENTED",
  smartAccount: "NOT_IMPLEMENTED",
  testnetSubmission: "NOT_IMPLEMENTED",
  productionCustody: "ABSENT",
  mainnetAuthority: "ABSENT",
} as const;
