export const DOCS_GATE_RECEIPT_SCHEMA = "agent-shield/docs-gate-receipt/v1" as const;

export type GateId =
  | "DOC-GATE-001"
  | "DOC-GATE-002"
  | "DOC-GATE-003"
  | "DOC-GATE-004"
  | "DOC-GATE-005"
  | "DOC-GATE-006"
  | "DOC-GATE-007";

export type EvidenceState = "PASS" | "FAIL" | "ABSENT" | "NOT_IMPLEMENTED" | "NOT_EXERCISED";

export interface Finding {
  gate: GateId;
  subject: string;
  detail: string;
}

// The validator reads a model, never the filesystem. That is what makes it deterministic
// (DOC-GATE-007), network-free and residue-free (DOC-GATE-010) -- and testable at all.
export interface DocumentRef {
  id: string;
  // Every reference this document makes. A reference that resolves to no declared ID is a
  // broken link whether it points at an intent, a source, an issue, an eval or a state.
  references: string[];
}

export interface NormativeTopic {
  topic: string;
  ssotId: string;
  projectionIds: string[];
}

export interface GovernedDirectory {
  path: string;
  hasNearestReadme: boolean;
  // A directory may be excluded from the README rule, but only with a recorded reviewer and
  // the release the exclusion was reviewed against. A stale exclusion is not an exclusion.
  exclusion: { reviewedBy: string; reviewedAtRelease: string } | null;
}

export interface EvalPacket {
  id: string;
  subject: string;
  preconditions: string;
  action: string;
  observable: string;
  negativeControl: string;
  artifact: string;
  statesAndExits: string;
  cleanup: string;
  exclusions: string;
  owner: string;
  rollback: string;
}

export interface EvidenceClaim {
  subject: string;
  state: EvidenceState;
  // What the claim rests on. Prose, package presence and a bare hash cannot carry a lane to
  // PASS; only an executed receipt can.
  basis: "executed-receipt" | "prose" | "package-presence" | "hash-only" | "none";
  lane: "documentation" | "provider" | "device" | "browser" | "chain";
}

export interface PullRequestPacket {
  number: number;
  branch: string;
  baseBranch: string;
  issueId: string;
  allowedPaths: string[];
}

export interface AdmittedStackEdge {
  branch: string;
  parentBranch: string;
  issueId: string;
}

export interface GeneratedArtifact {
  path: string;
  declaredDigest: string;
  // Recomputed from the inputs the artifact claims to summarize. A stale generated file is
  // one whose declared digest no longer matches what its inputs produce.
  recomputedDigest: string;
}

export interface DocsModel {
  releaseId: string;
  documents: DocumentRef[];
  declaredIds: string[];
  topics: NormativeTopic[];
  directories: GovernedDirectory[];
  evals: EvalPacket[];
  claims: EvidenceClaim[];
  pullRequests: PullRequestPacket[];
  admittedStack: AdmittedStackEdge[];
  generated: GeneratedArtifact[];
  currentRelease: string;
}

export interface DocsGateReceipt {
  schema: typeof DOCS_GATE_RECEIPT_SCHEMA;
  releaseId: string;
  gates: Record<GateId, EvidenceState>;
  // DOC-GATE-010. The GitHub metadata lane is separately named and reports NOT_EXERCISED
  // when no token or network was supplied, rather than being folded into a pass.
  githubMetadataLane: EvidenceState;
  findings: Finding[];
  state: EvidenceState;
  detail: string;
}
