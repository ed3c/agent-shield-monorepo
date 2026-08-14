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

// INT-GH-001. The origin, as an identity rather than a URL.
//
// A URL is where the bytes came from and can carry a credential in its userinfo; an identity is
// which repository they are. Keeping them apart is what lets the receipt name the origin without
// ever holding a secret -- there is no URL field on the receipt at all.
export interface OriginIdentity {
  host: "github.com";
  owner: string;
  repository: string;
  // The tracked remote as configured. Validated and then discarded: it never reaches a receipt,
  // because this is the one field that can contain userinfo.
  trackedUrl: string;
  // A fork advertises the same tree under a different identity. Naming the expected upstream
  // makes "we cloned somebody's fork" a refusal rather than a green run.
  expectedFullName: string;
}

// INT-GH-002. A branch or a floating tag can move under the same string, so the ref this
// verifier accepts is either a commit object or an annotated tag that resolves to one. The kind
// is reported by the transport and checked here rather than inferred from the string's shape.
export type RefKind = "commit" | "annotated-tag" | "branch" | "lightweight-tag";

export interface RefResolution {
  kind: RefKind;
  commit: string;
}

export interface CommitObject {
  commit: string;
  tree: string;
}

// INT-GH-004. What the clone actually did. A clone that reused the owner's object store proves
// the bytes are on this machine, not that they are reachable from the origin -- which is the
// entire claim.
export interface CloneReport {
  commit: string;
  tree: string;
  usedLocalObjectCache: boolean;
  referenceRepository: string | null;
  // Set when the clone was made from a path rather than the network. `file://` and a bare path
  // both count: neither touched the distribution origin.
  clonedFromLocalPath: boolean;
}

export interface ManifestReport {
  releaseId: string;
  releaseDigest: string;
}

export interface OriginCleanupAccount {
  clones: number;
  processes: number;
  // A credential helper writes to a stream the child process inherits. One left open is a
  // credential still reachable, whatever the receipt says.
  credentialStreams: number;
}

// INT-GH-005 and INT-GH-007. Metadata only. There is deliberately no URL, no host path, no
// token and no log field on this type: a receipt that cannot hold a secret does not need to be
// scanned for one.
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

// The origin boundary. Network, Git and any credential helper live on the far side; identity
// admission, immutability, digest comparison, fresh-clone honesty, state separation and cleanup
// accounting are owned here.
//
// There is no member that returns a URL, a token or a host path. INT-GH-005's "no credential in
// logs or receipts" is a property of this interface's shape rather than of a redaction step.
export interface GitHubOriginTransport {
  probe(): { reachable: boolean; authenticated: boolean; refused: boolean };
  resolveRef(ref: string): RefResolution | null;
  fetchCommit(commit: string): CommitObject | null;
  freshClone(commit: string): CloneReport | null;
  readReleaseManifest(commit: string): ManifestReport | null;
  cleanupAccount(): OriginCleanupAccount;
}
