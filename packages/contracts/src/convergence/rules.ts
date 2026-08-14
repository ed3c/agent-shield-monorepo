import { createHash } from "node:crypto";
import type { EvidenceState } from "../index.ts";
import type {
  AdmitExpectation,
  ChildEvidence,
  ExpectedChild,
  HumanAdmit,
  ModuleNode,
  ProposedAggregate,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;

export function fail(message: string): never {
  throw new Error(`invalid convergence contract: ${message}`);
}

// CONV-001. Every included evidence names the expected interface and immutable child subject.
//
// Returns a reason rather than a phase state: the phases disagree about which terminal an
// identity failure maps to (#44 splits CHILD_ABSENT from SUBJECT_MISMATCH), and that mapping is
// the leaf's to make. The rule is the same; the vocabulary is not.
export type IdentityRefusal = { kind: "absent" | "mismatch"; detail: string };

export function childIdentityRefusal(
  evidence: readonly ChildEvidence[],
  expected: readonly ExpectedChild[],
): IdentityRefusal | null {
  if (expected.length === 0) fail("no expected children were pinned");
  for (const child of expected) {
    const found = evidence.find((candidate) => candidate.issue === child.issue);
    if (found === undefined) return { kind: "absent", detail: `no evidence was supplied for child #${child.issue}` };
    if (found.ownerId !== child.ownerId) return { kind: "mismatch", detail: `child #${child.issue} reported owner ${found.ownerId}` };
    if (found.interfaceVersion !== child.interfaceVersion) {
      return { kind: "mismatch", detail: `child #${child.issue} reported interface ${found.interfaceVersion}` };
    }
    // A stale receipt is otherwise indistinguishable from a current one, which is why the
    // subject digest is compared and not merely required to be present.
    if (found.subjectSha256 !== child.subjectSha256) {
      return { kind: "mismatch", detail: `child #${child.issue} pinned another subject` };
    }
    if (!SHA_256.test(found.subjectSha256)) {
      return { kind: "mismatch", detail: `child #${child.issue} has an unaddressed subject` };
    }
  }
  for (const found of evidence) {
    if (!expected.some((child) => child.issue === found.issue)) {
      return { kind: "mismatch", detail: `evidence was supplied for unexpected child #${found.issue}` };
    }
  }
  return null;
}

// CONV-002 / REL-004. One owner per claim, detected before anything executes.
//
// #44 calls a claim a capability, #53 an action or accessibility ID, #75 a published tool. The
// collision is the same set operation in all three, and so is the shadowing it prevents.
export function claimUniquenessRefusal(evidence: readonly ChildEvidence[]): string | null {
  const owner = new Map<string, string>();
  for (const child of evidence) {
    if (child.claims.length === 0) return `child #${child.issue} claims nothing`;
    for (const claim of child.claims) {
      const existing = owner.get(claim);
      if (existing !== undefined && existing !== child.ownerId) {
        return `${claim} is claimed by ${existing} and ${child.ownerId}`;
      }
      owner.set(claim, child.ownerId);
    }
  }
  return null;
}

// CONV-008 / CONV-011 / REL-010. Which modules a change to one module invalidates.
//
// The control every phase names is restamping an unrelated module *solely because HEAD changed*.
// A commit touches the whole tree; evidence staleness follows the capability graph.
export function invalidatedBy(changed: string, modules: readonly ModuleNode[]): string[] {
  if (modules.length === 0) fail("the module graph is empty");
  const byId = new Map(modules.map((module) => [module.id, module]));
  if (!byId.has(changed)) fail(`module ${changed} is not in the graph`);

  const stale = new Set<string>([changed]);
  // A fixed point, not one hop: a dependent's dependents are stale too, and stopping at depth
  // one looks correct on a two-module graph and is wrong on the next one.
  for (let changedThisPass = true; changedThisPass; ) {
    changedThisPass = false;
    const provided = new Set([...stale].flatMap((id) => byId.get(id)?.provides ?? []));
    for (const module of modules) {
      if (stale.has(module.id)) continue;
      if (module.requires.some((capability) => provided.has(capability))) {
        stale.add(module.id);
        changedThisPass = true;
      }
    }
  }
  return [...stale].sort();
}

// CONV-009 / REL-008. The rule that matters most in every phase: a lane may be claimed PASS only
// when a child says PASS, and FAIL only when a child reports a failure.
//
// Both directions, because a fabricated failure is the same defect pointing the other way.
// Honest downgrades are admitted: the proposal may report less than the evidence supports.
export function aggregateRefusal(
  evidence: readonly ChildEvidence[],
  proposed: ProposedAggregate,
  modules: readonly ModuleNode[],
  rootModule: string,
): string | null {
  for (const [lane, claimed] of Object.entries(proposed.lanes)) {
    const supporting = evidence.filter((child) => child.lane === lane);
    if (claimed === "PASS") {
      if (supporting.length === 0) return `the proposal claims ${lane} PASS with no child evidence for that lane`;
      const dissent = supporting.find((child) => child.state !== "PASS");
      if (dissent !== undefined) return `the proposal claims ${lane} PASS while child #${dissent.issue} reports ${dissent.state}`;
    }
    if (claimed === "FAIL" && supporting.every((child) => child.state !== "FAIL")) {
      return `the proposal claims ${lane} FAIL with no child reporting a failure`;
    }
  }
  // A lane with evidence that the proposal does not mention at all is evidence nobody accounted
  // for -- the aggregate is supposed to be complete over its children.
  for (const child of evidence) {
    if (!(child.lane in proposed.lanes)) return `child #${child.issue} reports lane ${child.lane}, which the proposal omits`;
  }

  const computed = invalidatedBy(rootModule, modules);
  const declared = [...proposed.invalidatedModules].sort();
  if (JSON.stringify(declared) !== JSON.stringify(computed)) {
    return `the proposal invalidates ${declared.join(", ") || "nothing"} and the graph requires ${computed.join(", ")}`;
  }
  return null;
}

// REL-009. Promotion needs an explicit Human receipt bound to the exact subject.
//
// The three controls #75 names are forge, stale and wrong author, and each is a separate check
// because they are separate failures: an unknown approver is not an expired approval, and
// neither is an approval for a different release.
export function humanAdmitRefusal(admit: HumanAdmit | null, expected: AdmitExpectation): string | null {
  if (admit === null) return "no human admit was supplied";
  if (expected.approvers.length === 0) fail("no approver is admitted, so no admit could ever verify");
  if (!expected.approvers.includes(admit.approverId)) return `${admit.approverId} is not an admitted approver`;
  if (admit.headSha256 !== expected.headSha256) return "the admit is bound to another head";
  if (admit.lockSha256 !== expected.lockSha256) return "the admit is bound to another lock";
  if (admit.releaseDigest !== expected.releaseDigest) return "the admit is bound to another release";
  if (!Number.isSafeInteger(admit.approvedAtEpochMs)) return "the admit time is not a whole number of milliseconds";
  const age = expected.nowEpochMs - admit.approvedAtEpochMs;
  // A future-dated admit is a clock problem, not a fresh one. Treating it as fresh is how a
  // skewed machine gets an indefinitely valid approval.
  if (age < 0) return "the admit is dated in the future";
  if (age > expected.maxAdmitAgeMs) return "the admit is older than the admitted window";
  return null;
}

// CONV-009 / REL-002. The aggregate digest is a function of the evidence and the proposal, and
// of nothing else -- so two runs over the same inputs agree and any change moves it.
export function aggregateDigest(evidence: readonly ChildEvidence[], proposed: ProposedAggregate): string {
  const children = [...evidence]
    .map((child) => [child.issue, child.ownerId, child.interfaceVersion, child.subjectSha256, child.lane, child.state]
      .join("\u0000"))
    .sort();
  const lanes = Object.keys(proposed.lanes).sort().map((lane) => `${lane}=${proposed.lanes[lane] as EvidenceState}`);
  return createHash("sha256")
    .update([...children, ...lanes, ...[...proposed.invalidatedModules].sort()].join(""))
    .digest("hex");
}
