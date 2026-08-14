import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";

export const AUTHORING_RECEIPT_SCHEMA = "agent-shield/authoring-origin-receipt/v1" as const;

export type ForgejoState =
  | "UNRESOLVED"
  | "ORIGIN_IDENTITY_PINNED"
  | "RUNTIME_BINDING_VERIFIED"
  | "HELPER_POLICY_CHECKED"
  | "AUTHENTICATED"
  | "REF_FETCHED"
  | "COMMIT_VERIFIED"
  | "TREE_VERIFIED"
  | "RELEASE_MANIFEST_VERIFIED"
  | "RECEIPT_EMITTED"
  | "CLEANED"
  | "ORIGIN_ABSENT"
  | "SERVICE_UNREACHABLE"
  | "AUTH_ABSENT"
  | "AUTH_REFUSED"
  | "HELPER_POLICY_REFUSED"
  | "REF_ABSENT"
  | "COMMIT_MISMATCH"
  | "TREE_MISMATCH"
  | "MANIFEST_MISMATCH"
  | "FETCH_FAILED"
  | "FAILED_CLEANUP";

export type ForgejoOutcome = Extract<ForgejoState,
  | "CLEANED"
  | "ORIGIN_ABSENT"
  | "SERVICE_UNREACHABLE"
  | "AUTH_ABSENT"
  | "AUTH_REFUSED"
  | "HELPER_POLICY_REFUSED"
  | "REF_ABSENT"
  | "COMMIT_MISMATCH"
  | "TREE_MISMATCH"
  | "MANIFEST_MISMATCH"
  | "FETCH_FAILED"
  | "FAILED_CLEANUP">;

// INT-FJ-001. The authoring origin is a trusted-local service, not a public host. Its identity
// is a loopback address and a port, and "loopback" is checked rather than assumed from the
// word `localhost`: a hosts file can point that name anywhere.
export type LoopbackHost = "127.0.0.1" | "::1";

export interface AuthoringOriginIdentity {
  host: LoopbackHost;
  port: number;
  owner: string;
  repository: string;
  expectedFullName: string;
  // Read-only by construction. A canary that can push is a canary that can rewrite the thing it
  // is verifying, so the scope is part of the admitted identity rather than a runtime intention.
  scope: "read" | "write";
}

// INT-FJ-002. The credential chain, as an enumeration rather than a string.
//
// A plaintext store, a dotenv file and a shell fallback all "work"; they differ in whether the
// value can be read by anything other than the helper. Naming them makes refusing them a rule
// with one place to live, and makes a new fallback somebody adds a compile error rather than a
// silent third option.
export type CredentialSource = "keychain-broker" | "plaintext-store" | "dotenv" | "shell-fallback" | "none";

export interface HelperPolicy {
  // The chain as configured, in order. An approved chain is exactly one entry.
  chain: CredentialSource[];
  // Whether the helper was reset before the chain was applied. Without a reset, an inherited
  // global helper stays in the chain and nothing in the chain itself shows it.
  resetBeforeApply: boolean;
  // What the child process would inherit. Anything here is a value that escaped the helper.
  childEnvironmentKeys: string[];
}

export interface RuntimeBindingRef {
  profileId: string;
  canonicalSha256: string;
  // The workload the runtime-env repository owns. A binding whose owner is this repository is a
  // second canonical copy rather than a projection.
  ownerRepository: string;
}

export interface RefResolution {
  kind: "commit" | "annotated-tag" | "branch" | "lightweight-tag";
  commit: string;
}

export interface CommitObject {
  commit: string;
  tree: string;
}

export interface ManifestReport {
  releaseId: string;
  releaseDigest: string;
}

// INT-FJ-006. What the run did to the origin and to the working repository. Both must be
// untouched: a verifier that mutates the thing it verifies is measuring itself.
export interface MutationReport {
  originRefsWritten: number;
  consumerWorkingTreeChanged: boolean;
}

// INT-FJ-003 and INT-FJ-008. Every surface a credential can escape through, and every resource
// a run can leave behind.
export interface ForgejoCleanupAccount {
  clones: number;
  processes: number;
  credentialStreams: number;
  leases: number;
}

// Metadata only. As with the GitHub receipt there is no URL, token, host path or log field --
// and additionally no port, because a loopback port plus a repository name is the whole address
// of a private service.
export interface AuthoringOriginReceipt {
  schema: typeof AUTHORING_RECEIPT_SCHEMA;
  origin: "forgejo";
  repositoryFullName: string;
  subject: ReleaseSubject;
  lifecycle: ForgejoState[];
  outcome: ForgejoOutcome;
  credentialSource: CredentialSource | null;
  readOnly: boolean;
  cleanupCleared: boolean;
  detail: string;
}

// The authoring-origin boundary. The Forgejo service, the Git transport and the Keychain broker
// live on the far side; identity admission, binding verification, helper policy, immutability,
// digest comparison, read-only enforcement and cleanup accounting are owned here.
//
// No member returns a URL, a token, a host path or an environment value.
export interface ForgejoOriginTransport {
  probe(): { serviceUp: boolean; repositoryPresent: boolean };
  runtimeBinding(): RuntimeBindingRef | null;
  helperPolicy(): HelperPolicy;
  authenticate(): { authenticated: boolean; refused: boolean; source: CredentialSource };
  resolveRef(ref: string): RefResolution | null;
  fetchCommit(commit: string): CommitObject | null;
  readReleaseManifest(commit: string): ManifestReport | null;
  mutationReport(): MutationReport;
  cleanupAccount(): ForgejoCleanupAccount;
}
