import type { EvidenceState } from "../index.ts";

// The four convergence issues -- #44 runtime, #53 product, #64 security, #75 release -- state
// the same five rules in their own vocabulary. This family is those rules once.
//
// What is deliberately NOT here: each phase's state machine. #44 has three route failures, #53
// has platform lanes, #64 has eleven evals and #75 has rollback states -- those are genuinely
// different and belong to their own leaves. The rules are what repeat.
export type ConvergencePhase = "runtime" | "product" | "security" | "release";

// CONV-001 in every phase. A child leaf's evidence, reduced to the fields the aggregate has to
// check. The convergence never re-derives a child's result; it checks that the evidence it was
// handed belongs to the child it claims to be from.
export interface ChildEvidence {
  issue: number;
  // Provider, adapter, carrier or origin -- whatever the phase's leaves are.
  ownerId: string;
  interfaceVersion: string;
  subjectSha256: string;
  // Capabilities in #44, action and accessibility IDs in #53, tools in #75. Whatever the phase
  // requires exactly one owner for.
  claims: string[];
  // Route, platform, carrier or origin. A phase-specific string rather than a union, because
  // the set differs per phase and the rules below do not care what it is called.
  lane: string;
  state: EvidenceState;
  cleanupCleared: boolean;
}

export interface ExpectedChild {
  issue: number;
  ownerId: string;
  interfaceVersion: string;
  subjectSha256: string;
}

// CONV-008 / CONV-011 / REL-010 in every phase. The module graph as the manifests record it.
export interface ModuleNode {
  id: string;
  provides: string[];
  requires: string[];
}

// CONV-009 / REL-008 in every phase. What the convergence proposes to write, as an input. The
// verifier's job is to decide whether the proposal is supported; a proposal nobody checked is
// how an unreceipted PASS reaches a status file.
export interface ProposedAggregate {
  lanes: Record<string, EvidenceState>;
  invalidatedModules: string[];
}

// REL-009. The Human receipt a promotion requires.
//
// #75 asks for promotion to be "impossible without an explicit approved Human receipt bound to
// exact head/lock/release", with forge, stale and wrong-author as its three controls. That is a
// checkable rule rather than a process note, so it lives here with the others.
export interface HumanAdmit {
  approverId: string;
  approvedAtEpochMs: number;
  // The exact subject the approval is bound to. An admit for another head is an admit for
  // another thing, however recent it is.
  headSha256: string;
  lockSha256: string;
  releaseDigest: string;
}

export interface AdmitExpectation {
  approvers: readonly string[];
  headSha256: string;
  lockSha256: string;
  releaseDigest: string;
  nowEpochMs: number;
  maxAdmitAgeMs: number;
}
