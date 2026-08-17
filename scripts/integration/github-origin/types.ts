import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";

export const ORIGIN_RECEIPT_SCHEMA = "agent-shield/distribution-origin-receipt/v1" as const;

export type OriginState =
  | "UNRESOLVED"
  | "ORIGIN_IDENTITY_PINNED"
  | "REACHABILITY_CHECKED"
  | "REF_FETCHED"
  | "COMMIT_VERIFIED"
  | "TREE_VERIFIED"
  | "RELEASE_MANIFEST_VERIFIED"
  | "FRESH_CLONE_VERIFIED"
  | "RECEIPT_EMITTED"
  | "ORIGIN_ABSENT"
  | "AUTH_ABSENT"
  | "AUTH_REFUSED"
  | "REF_ABSENT"
  | "COMMIT_MISMATCH"
  | "TREE_MISMATCH"
  | "MANIFEST_MISMATCH"
  | "FETCH_FAILED"
  | "FRESH_CLONE_FAILED";

export type OriginOutcome = Extract<OriginState,
  | "RECEIPT_EMITTED"
  | "ORIGIN_ABSENT"
  | "AUTH_ABSENT"
  | "AUTH_REFUSED"
  | "REF_ABSENT"
  | "COMMIT_MISMATCH"
  | "TREE_MISMATCH"
  | "MANIFEST_MISMATCH"
  | "FETCH_FAILED"
  | "FRESH_CLONE_FAILED">;

export interface OriginIdentity {
  host: "github.com";
  owner: string;
  repository: string;
  trackedUrl: string;
  expectedFullName: string;
}

export type RefKind = "commit" | "annotated-tag" | "branch" | "lightweight-tag";
export interface RefResolution { kind: RefKind; commit: string; }
export interface CommitObject { commit: string; tree: string; }
export interface CloneReport {
  commit: string;
  tree: string;
  usedLocalObjectCache: boolean;
  referenceRepository: string | null;
  clonedFromLocalPath: boolean;
}
export interface ManifestReport { releaseId: string; releaseDigest: string; }
export interface OriginCleanupAccount { clones: number; processes: number; credentialStreams: number; }

export interface OriginReceipt {
  schema: typeof ORIGIN_RECEIPT_SCHEMA;
  origin: "github";
  repositoryFullName: string;
  subject: ReleaseSubject;
  lifecycle: OriginState[];
  outcome: OriginOutcome;
  refKind: RefKind | null;
  freshClone: boolean;
  cleanupCleared: boolean;
  detail: string;
}

export interface OriginProbe {
  reachable: boolean;
  authenticated: boolean;
  refused: boolean;
  // Public GitHub repositories can be honestly reachable without an authentication credential.
  // Optional keeps deterministic transports source-compatible; absence means "not established".
  publiclyReadable?: boolean;
}

export interface GitHubOriginTransport {
  probe(): OriginProbe;
  resolveRef(ref: string): RefResolution | null;
  fetchCommit(commit: string): CommitObject | null;
  freshClone(commit: string): CloneReport | null;
  readReleaseManifest(commit: string): ManifestReport | null;
  cleanupAccount(): OriginCleanupAccount;
}
