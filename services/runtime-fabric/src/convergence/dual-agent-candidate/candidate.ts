import { createHash } from "node:crypto";

export const DUAL_AGENT_RUNTIME_CANDIDATE_SCHEMA = "agent-shield/dual-agent-runtime-candidate/v1" as const;

export type CandidateOutcome = "HUMAN_REVIEW_PENDING";
export type LiveState = "NOT_EXERCISED" | "NOT_PERFORMED";

export interface CandidateSubject {
  atom: "ROUTE" | "GVISOR" | "LOCAL_SANDBOX";
  pr: number;
  head: string;
  tree: string;
  run: number;
  prState: "OPEN_DRAFT";
  evidenceCeiling: string;
}

export interface LocalSandboxCeiling {
  localProcess: "TARGETED_PUBLIC_CANARY";
  cleanupReadback: "TARGETED_PUBLIC_CANARY";
  networkIsolation: "NOT_EXERCISED";
  providerObservation: "NOT_EXERCISED";
  hardenedContainerIsolation: "NOT_EXERCISED";
}

export interface CandidateAuthority {
  sharedConvergenceIssue: 44;
  liveNetworkIssue: 95;
  routeLiveIssue: 161;
  gvisorLiveIssue: 173;
  sharedWriter: "PHASE3_RT90_ONLY";
  candidateWriteMode: "VERIFY_ONLY";
}

export interface CandidateBlocker {
  id: string;
  state: "BLOCKING";
}

export interface RuntimeCandidateInput {
  schema: typeof DUAL_AGENT_RUNTIME_CANDIDATE_SCHEMA;
  subjects: CandidateSubject[];
  localSandbox: LocalSandboxCeiling;
  authority: CandidateAuthority;
  retainedFailureRuns: number[];
  blockers: CandidateBlocker[];
  proposedSharedMutations: string[];
  liveClaims: {
    api: LiveState;
    browser: LiveState;
    runsc: LiveState;
    network: LiveState;
    providerObservation: LiveState;
    release: LiveState;
  };
  requestedOutcome: CandidateOutcome;
}

export interface RuntimeCandidateReceipt {
  schema: "agent-shield/dual-agent-runtime-candidate-receipt/v1";
  outcome: CandidateOutcome;
  candidateCount: number;
  subjectDigest: string;
  blockers: string[];
  evidenceCeiling: "NON_PROMOTING_RUNTIME_CONVERGENCE_CANDIDATE_ONLY";
  sharedMutationState: "FORBIDDEN";
  releaseState: "NOT_PERFORMED";
}

export class RuntimeCandidateError extends Error {
  constructor(public readonly code: string, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const H40 = /^[0-9a-f]{40}$/;

const EXPECTED_SUBJECTS: Readonly<Record<CandidateSubject["atom"], Omit<CandidateSubject, "atom">>> = {
  ROUTE: {
    pr: 167,
    head: "c2272fcc026b8fca046fc8c7c449088eb2c41177",
    tree: "868f71efce8c412f7c543b66c60738d22aeba1f3",
    run: 32279588381,
    prState: "OPEN_DRAFT",
    evidenceCeiling: "COMPLETE_DETERMINISTIC_ROUTE_MATRIX_ONLY",
  },
  GVISOR: {
    pr: 178,
    head: "5820b69d3f5f73de44ba175a2d1f824e3665885e",
    tree: "2db898f637ab54f3da49fbe2522166ed1a089b01",
    run: 32283019825,
    prState: "OPEN_DRAFT",
    evidenceCeiling: "COMPLETE_DETERMINISTIC_GVISOR_MATRIX_ONLY",
  },
  LOCAL_SANDBOX: {
    pr: 154,
    head: "8ec782b78ec9e13f78f2faf14e6ffa722c1b78f2",
    tree: "51adf9791485d597849c026a3828ded0088b3805",
    run: 32262032532,
    prState: "OPEN_DRAFT",
    evidenceCeiling: "TARGETED_PUBLIC_LOCAL_PROCESS_AND_CLEANUP_CANARY_ONLY",
  },
};

const REQUIRED_FAILURE_RUNS = [32277516417, 32278264809] as const;
const REQUIRED_BLOCKERS = [
  "ROUTE_LIVE_161",
  "GVISOR_LIVE_173",
  "LIVE_NETWORK_95",
  "SHARED_CONVERGENCE_44",
  "LOCAL_PROVIDER_OBSERVATION",
] as const;

function refuse(code: string, detail = ""): never {
  throw new RuntimeCandidateError(code, detail);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function validateSubject(subject: CandidateSubject): void {
  const expected = EXPECTED_SUBJECTS[subject.atom];
  if (!expected) refuse("UNKNOWN_CANDIDATE_SUBJECT", subject.atom);
  if (!H40.test(subject.head) || subject.head !== expected.head) refuse("EXACT_HEAD_DRIFT", subject.atom);
  if (!H40.test(subject.tree) || subject.tree !== expected.tree) refuse("EXACT_TREE_DRIFT", subject.atom);
  if (subject.pr !== expected.pr || subject.run !== expected.run) refuse("EXACT_RUN_OR_PR_DRIFT", subject.atom);
  if (subject.prState !== "OPEN_DRAFT") refuse("DRAFT_AS_ADMITTED", subject.atom);
  if (subject.evidenceCeiling !== expected.evidenceCeiling) refuse("EVIDENCE_CEILING_WIDENING", subject.atom);
}

function validateAuthority(authority: CandidateAuthority): void {
  if (authority.sharedConvergenceIssue !== 44 || authority.sharedWriter !== "PHASE3_RT90_ONLY") {
    refuse("SHARED_WRITER_BYPASS");
  }
  if (authority.liveNetworkIssue !== 95) refuse("LIVE_NETWORK_OWNER_BYPASS");
  if (authority.routeLiveIssue !== 161 || authority.gvisorLiveIssue !== 173) refuse("LIVE_OWNER_DRIFT");
  if (authority.candidateWriteMode !== "VERIFY_ONLY") refuse("SHARED_WRITER_BYPASS");
}

function validateLocalSandbox(local: LocalSandboxCeiling): void {
  if (local.localProcess !== "TARGETED_PUBLIC_CANARY" || local.cleanupReadback !== "TARGETED_PUBLIC_CANARY") {
    refuse("LOCAL_CANARY_ERASED");
  }
  if (local.networkIsolation !== "NOT_EXERCISED") refuse("LOCAL_CANARY_AS_NETWORK_PASS");
  if (local.providerObservation !== "NOT_EXERCISED") refuse("LOCAL_CANARY_AS_PROVIDER_PASS");
  if (local.hardenedContainerIsolation !== "NOT_EXERCISED") refuse("LOCAL_CANARY_AS_GVISOR_PASS");
}

function validateFailures(runs: number[]): void {
  for (const required of REQUIRED_FAILURE_RUNS) {
    if (!runs.includes(required)) refuse("FAILURE_HISTORY_ERASED", String(required));
  }
}

function validateBlockers(blockers: CandidateBlocker[]): void {
  const ids = new Set(blockers.map((item) => item.id));
  for (const blocker of REQUIRED_BLOCKERS) {
    if (!ids.has(blocker)) refuse("MISSING_BLOCKER", blocker);
  }
  if (blockers.some((item) => item.state !== "BLOCKING")) refuse("BLOCKER_PROMOTED");
}

function validateLiveClaims(input: RuntimeCandidateInput): void {
  for (const [key, state] of Object.entries(input.liveClaims)) {
    if (key === "release") {
      if (state !== "NOT_PERFORMED") refuse("RELEASE_OR_STATUS_PROMOTION", key);
      continue;
    }
    if (state !== "NOT_EXERCISED") refuse("DETERMINISTIC_AS_LIVE", key);
  }
}

export function compileRuntimeCandidate(input: RuntimeCandidateInput): RuntimeCandidateReceipt {
  if (input.schema !== DUAL_AGENT_RUNTIME_CANDIDATE_SCHEMA) refuse("CANDIDATE_SCHEMA_DRIFT");
  if (input.subjects.length !== 3 || new Set(input.subjects.map((item) => item.atom)).size !== 3) {
    refuse("CANDIDATE_SUBJECT_SET_DRIFT");
  }
  for (const subject of input.subjects) validateSubject(subject);
  validateAuthority(input.authority);
  validateLocalSandbox(input.localSandbox);
  validateFailures(input.retainedFailureRuns);
  validateBlockers(input.blockers);
  validateLiveClaims(input);
  if (input.proposedSharedMutations.length !== 0) refuse("RELEASE_OR_STATUS_MUTATION_PROPOSED");
  if (input.requestedOutcome !== "HUMAN_REVIEW_PENDING") refuse("DRAFT_AS_ADMITTED");

  return {
    schema: "agent-shield/dual-agent-runtime-candidate-receipt/v1",
    outcome: "HUMAN_REVIEW_PENDING",
    candidateCount: input.subjects.length,
    subjectDigest: digest(input.subjects),
    blockers: input.blockers.map((item) => item.id).sort(),
    evidenceCeiling: "NON_PROMOTING_RUNTIME_CONVERGENCE_CANDIDATE_ONLY",
    sharedMutationState: "FORBIDDEN",
    releaseState: "NOT_PERFORMED",
  };
}

export function fixedCandidate(): RuntimeCandidateInput {
  return {
    schema: DUAL_AGENT_RUNTIME_CANDIDATE_SCHEMA,
    subjects: [
      { atom: "ROUTE", ...EXPECTED_SUBJECTS.ROUTE },
      { atom: "GVISOR", ...EXPECTED_SUBJECTS.GVISOR },
      { atom: "LOCAL_SANDBOX", ...EXPECTED_SUBJECTS.LOCAL_SANDBOX },
    ],
    localSandbox: {
      localProcess: "TARGETED_PUBLIC_CANARY",
      cleanupReadback: "TARGETED_PUBLIC_CANARY",
      networkIsolation: "NOT_EXERCISED",
      providerObservation: "NOT_EXERCISED",
      hardenedContainerIsolation: "NOT_EXERCISED",
    },
    authority: {
      sharedConvergenceIssue: 44,
      liveNetworkIssue: 95,
      routeLiveIssue: 161,
      gvisorLiveIssue: 173,
      sharedWriter: "PHASE3_RT90_ONLY",
      candidateWriteMode: "VERIFY_ONLY",
    },
    retainedFailureRuns: [...REQUIRED_FAILURE_RUNS],
    blockers: REQUIRED_BLOCKERS.map((id) => ({ id, state: "BLOCKING" })),
    proposedSharedMutations: [],
    liveClaims: {
      api: "NOT_EXERCISED",
      browser: "NOT_EXERCISED",
      runsc: "NOT_EXERCISED",
      network: "NOT_EXERCISED",
      providerObservation: "NOT_EXERCISED",
      release: "NOT_PERFORMED",
    },
    requestedOutcome: "HUMAN_REVIEW_PENDING",
  };
}
