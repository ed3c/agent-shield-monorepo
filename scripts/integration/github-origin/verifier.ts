import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import { validateOriginLifecycle } from "./state-machine.ts";
import {
  ORIGIN_RECEIPT_SCHEMA,
  type GitHubOriginTransport,
  type OriginIdentity,
  type OriginReceipt,
  type OriginState,
  type RefKind,
} from "./types.ts";

const GIT_OID = /^[a-f0-9]{40}$/;
const SHA_256 = /^[a-f0-9]{64}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

// INT-GH-002. Refs that can move under the same string. A lightweight tag is included on
// purpose: it is a plain ref, repointable with one force-push, and it is the one people assume
// is immutable because it is called a tag.
const MUTABLE_REF_KINDS = new Set<RefKind>(["branch", "lightweight-tag"]);

export function fail(message: string): never {
  throw new Error(`invalid origin contract: ${message}`);
}

// INT-GH-001. Exact origin identity, and a tracked URL that carries no credential.
//
// The URL is validated and then dropped -- it is never stored on the receipt, because userinfo
// is the one place a token reaches a URL and a field that does not exist cannot leak.
export function assertOriginIdentity(identity: OriginIdentity): OriginIdentity {
  if (identity.host !== "github.com") fail(`host ${identity.host} is not the distribution origin`);
  if (!NAME.test(identity.owner)) fail("owner is invalid");
  if (!NAME.test(identity.repository)) fail("repository is invalid");

  const fullName = `${identity.owner}/${identity.repository}`;
  // A fork advertises the same tree under a different identity, so "we cloned something that
  // had the right bytes" is not the same claim as "the distribution origin has them".
  if (identity.expectedFullName !== fullName) {
    fail(`the tracked repository is ${fullName} and the release names ${identity.expectedFullName}`);
  }

  const url = identity.trackedUrl;
  // Userinfo in an https URL is the classic embedded token. `@` alone is not enough to detect
  // it -- an ssh URL is `git@github.com:` -- so the two forms are checked separately.
  if (url.startsWith("https://")) {
    const authority = url.slice("https://".length).split("/")[0] ?? "";
    if (authority.includes("@")) fail("the tracked URL embeds credentials");
    if (authority !== "github.com") fail(`the tracked URL points at ${authority}`);
  } else if (url.startsWith("git@github.com:")) {
    // ssh: the credential is a key held by the agent and never appears in the URL.
  } else {
    fail("the tracked URL is neither an https nor an ssh GitHub remote");
  }
  if (!url.includes(fullName)) fail("the tracked URL does not name the admitted repository");
  return identity;
}

export function assertReleaseSubject(subject: ReleaseSubject): ReleaseSubject {
  if (!GIT_OID.test(subject.commit)) fail("the release commit is not a full object identifier");
  if (!GIT_OID.test(subject.tree)) fail("the release tree is not a full object identifier");
  if (!SHA_256.test(subject.releaseDigest)) fail("the release digest is not content-addressed");
  if (subject.releaseId.length === 0) fail("the release identifier is absent");
  if (!subject.repository.includes("/")) fail("the release repository is not an owner/name identity");
  return subject;
}

interface Cleanup {
  cleared: boolean;
  detail: string;
}

// INT-GH-007. Asked once, after every run. A clone left on disk is a copy of the release
// nobody is tracking, and an open credential-helper stream is a secret still reachable
// whatever the receipt says.
function cleanup(transport: GitHubOriginTransport): Cleanup {
  const account = transport.cleanupAccount();
  const leaks = [
    ["clones", account.clones],
    ["processes", account.processes],
    ["credential streams", account.credentialStreams],
  ] as const;
  const retained = leaks.filter(([, count]) => count > 0);
  if (retained.length === 0) return { cleared: true, detail: "no clone, process or credential stream was retained" };
  return { cleared: false, detail: `the run retained ${retained.map(([n, c]) => `${c} ${n}`).join(", ")}` };
}

function receipt(
  identity: OriginIdentity,
  subject: ReleaseSubject,
  lifecycle: OriginState[],
  detail: string,
  refKind: RefKind | null,
  freshClone: boolean,
  cleanupCleared: boolean,
): OriginReceipt {
  return {
    schema: ORIGIN_RECEIPT_SCHEMA,
    origin: "github",
    repositoryFullName: `${identity.owner}/${identity.repository}`,
    subject,
    lifecycle,
    outcome: validateOriginLifecycle(lifecycle),
    refKind,
    freshClone,
    cleanupCleared,
    detail,
  };
}

export interface OriginVerificationRequest {
  identity: OriginIdentity;
  subject: ReleaseSubject;
  // The ref the caller asked for. Refused unless the transport reports it as an immutable kind:
  // asking for `main` and getting whatever it points at today is the fallback INT-GH-002 forbids.
  ref: string;
  transport: GitHubOriginTransport;
}

// UNRESOLVED → ORIGIN_IDENTITY_PINNED → REACHABILITY_CHECKED → REF_FETCHED → COMMIT_VERIFIED
//           → TREE_VERIFIED → RELEASE_MANIFEST_VERIFIED → FRESH_CLONE_VERIFIED → RECEIPT_EMITTED
export function verifyGitHubOrigin(request: OriginVerificationRequest): { receipt: OriginReceipt } {
  const { identity, subject, ref, transport } = request;
  assertOriginIdentity(identity);
  assertReleaseSubject(subject);
  if (`${identity.owner}/${identity.repository}` !== subject.repository) {
    fail("the release subject names another repository than the origin identity");
  }

  const lifecycle: OriginState[] = ["UNRESOLVED"];
  let refKind: RefKind | null = null;
  const done = (detail: string, freshClone = false): { receipt: OriginReceipt } => {
    const cleared = cleanup(transport);
    return { receipt: receipt(identity, subject, lifecycle, detail, refKind, freshClone, cleared.cleared) };
  };

  lifecycle.push("ORIGIN_IDENTITY_PINNED");

  // INT-GH-005. Four distinct facts, and none of them is any of the others: the origin is not
  // there, nothing authenticated, something authenticated and was refused, or the fetch broke.
  const probe = transport.probe();
  if (!probe.reachable) {
    lifecycle.push("ORIGIN_ABSENT");
    return done("the distribution origin is not reachable");
  }
  if (probe.refused) {
    lifecycle.push("AUTH_REFUSED");
    return done("the origin refused the presented authorization");
  }
  if (!probe.authenticated) {
    lifecycle.push("AUTH_ABSENT");
    return done("no authorization was presented to a private origin");
  }
  lifecycle.push("REACHABILITY_CHECKED");

  const resolution = transport.resolveRef(ref);
  if (resolution === null) {
    lifecycle.push("REF_ABSENT");
    return done(`the origin has no ref ${ref}`);
  }
  refKind = resolution.kind;
  // A branch or a lightweight tag can be repointed, so resolving one proves what the origin
  // says today rather than what the release is. There is no fallback to `main` anywhere in this
  // function -- an absent immutable ref is the end of the run.
  if (MUTABLE_REF_KINDS.has(resolution.kind)) {
    lifecycle.push("REF_ABSENT");
    return done(`ref ${ref} resolved as a ${resolution.kind}, which can move under the same name`);
  }
  if (!GIT_OID.test(resolution.commit)) {
    lifecycle.push("REF_ABSENT");
    return done("the origin resolved the ref to a malformed object identifier");
  }
  lifecycle.push("REF_FETCHED");

  if (resolution.commit !== subject.commit) {
    lifecycle.push("COMMIT_MISMATCH");
    return done("the ref resolves to another commit than the release names");
  }

  const object = transport.fetchCommit(subject.commit);
  if (object === null) {
    lifecycle.push("FETCH_FAILED");
    return done("the commit object could not be fetched");
  }
  if (object.commit !== subject.commit) {
    lifecycle.push("COMMIT_MISMATCH");
    return done("the origin returned another commit object");
  }
  lifecycle.push("COMMIT_VERIFIED");

  // The tree is checked separately from the commit because a commit identity can be preserved
  // while the tree it points at is not what the release recorded -- which is the "same commit
  // label with mismatched artifact" control.
  if (object.tree !== subject.tree) {
    lifecycle.push("TREE_MISMATCH");
    return done("the commit points at another tree than the release names");
  }
  lifecycle.push("TREE_VERIFIED");

  const manifest = transport.readReleaseManifest(subject.commit);
  if (manifest === null) {
    lifecycle.push("FETCH_FAILED");
    return done("the release manifest could not be read from the origin");
  }
  if (manifest.releaseId !== subject.releaseId) {
    lifecycle.push("MANIFEST_MISMATCH");
    return done("the origin carries another release identifier at this commit");
  }
  if (manifest.releaseDigest !== subject.releaseDigest) {
    lifecycle.push("MANIFEST_MISMATCH");
    return done("the release manifest digest does not match the release subject");
  }
  lifecycle.push("RELEASE_MANIFEST_VERIFIED");

  // INT-GH-004. A clone that reused local objects proves the bytes are on this machine, which
  // is not the claim. Each of the three ways that happens is checked, because they are three
  // different mistakes and only one of them looks like a mistake.
  const clone = transport.freshClone(subject.commit);
  if (clone === null) {
    lifecycle.push("FRESH_CLONE_FAILED");
    return done("the fresh clone did not complete");
  }
  if (clone.usedLocalObjectCache) {
    lifecycle.push("FRESH_CLONE_FAILED");
    return done("the clone reused a local object cache");
  }
  if (clone.referenceRepository !== null) {
    lifecycle.push("FRESH_CLONE_FAILED");
    return done("the clone borrowed objects from a reference repository");
  }
  if (clone.clonedFromLocalPath) {
    lifecycle.push("FRESH_CLONE_FAILED");
    return done("the clone was made from a local path rather than the origin");
  }
  lifecycle.push("FRESH_CLONE_VERIFIED");

  // The clone is compared against the same subject rather than against the API's answer, so a
  // clone and an API that agree with each other but not with the release still fails.
  if (clone.commit !== subject.commit) {
    lifecycle.push("COMMIT_MISMATCH");
    return done("the fresh clone checked out another commit", true);
  }
  if (clone.tree !== subject.tree) {
    lifecycle.push("TREE_MISMATCH");
    return done("the fresh clone materialized another tree", true);
  }

  lifecycle.push("RECEIPT_EMITTED");
  return done("the release is reachable from the distribution origin", true);
}

// INT-GH-006. Verification is a separate entry point from production: the party admitting a
// receipt is not the party that produced it, and a receipt that can only be checked by the code
// that made it is not a receipt.
export function originReceiptRefusal(
  value: OriginReceipt,
  subject: ReleaseSubject,
): string | null {
  if (value.schema !== ORIGIN_RECEIPT_SCHEMA) return "the receipt carries another schema";
  if (value.origin !== "github") return "the receipt is not a GitHub distribution-origin receipt";
  if (value.repositoryFullName !== subject.repository) return "the receipt names another repository";
  if (value.subject.commit !== subject.commit) return "the receipt names another commit";
  if (value.subject.tree !== subject.tree) return "the receipt names another tree";
  if (value.subject.releaseId !== subject.releaseId) return "the receipt names another release";
  if (value.subject.releaseDigest !== subject.releaseDigest) return "the receipt names another release digest";
  if (value.outcome !== "RECEIPT_EMITTED") return `the receipt reports ${value.outcome}`;
  // A receipt that reached RECEIPT_EMITTED without a fresh clone, or while leaking, describes a
  // run that did not satisfy the evals it claims to.
  if (!value.freshClone) return "the receipt reports no fresh clone";
  if (!value.cleanupCleared) return "the receipt reports retained resources";
  if (value.refKind === null || MUTABLE_REF_KINDS.has(value.refKind)) return "the receipt resolved a movable ref";
  return null;
}

// The evidence this verifier is allowed to claim. A deterministic run over a fake origin moves
// none of it, and the eval suite pins the type so widening a member to PASS fails to compile.
export const githubOriginState = {
  distributionOriginReachability: "NOT_EXERCISED",
  freshCloneMaterialization: "NOT_EXERCISED",
  releaseManifestReachability: "NOT_EXERCISED",
  signedAttestation: "NOT_IMPLEMENTED",
  forgejoEquivalence: "NOT_IMPLEMENTED",
} as const;
