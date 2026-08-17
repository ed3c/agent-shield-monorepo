import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import { classifyOriginProbe } from "./probe-admission.ts";
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
const MUTABLE_REF_KINDS = new Set<RefKind>(["branch", "lightweight-tag"]);

export function fail(message: string): never {
  throw new Error(`invalid origin contract: ${message}`);
}

export function assertOriginIdentity(identity: OriginIdentity): OriginIdentity {
  if (identity.host !== "github.com") fail(`host ${identity.host} is not the distribution origin`);
  if (!NAME.test(identity.owner)) fail("owner is invalid");
  if (!NAME.test(identity.repository)) fail("repository is invalid");

  const fullName = `${identity.owner}/${identity.repository}`;
  if (identity.expectedFullName !== fullName) {
    fail(`the tracked repository is ${fullName} and the release names ${identity.expectedFullName}`);
  }

  const url = identity.trackedUrl;
  if (url.startsWith("https://")) {
    const authority = url.slice("https://".length).split("/")[0] ?? "";
    if (authority.includes("@")) fail("the tracked URL embeds credentials");
    if (authority !== "github.com") fail(`the tracked URL points at ${authority}`);
  } else if (!url.startsWith("git@github.com:")) {
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

function cleanup(transport: GitHubOriginTransport): Cleanup {
  const account = transport.cleanupAccount();
  const leaks = [
    ["clones", account.clones],
    ["processes", account.processes],
    ["credential streams", account.credentialStreams],
  ] as const;
  const retained = leaks.filter(([, count]) => count > 0);
  if (retained.length === 0) return { cleared: true, detail: "no clone, process or credential stream was retained" };
  return { cleared: false, detail: `the run retained ${retained.map(([name, count]) => `${count} ${name}`).join(", ")}` };
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
  ref: string;
  transport: GitHubOriginTransport;
}

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

  // INT-GH-005 / #146. Authentication and public readability are independent facts. A public
  // anonymous origin is admissible only when the transport explicitly observed public readability;
  // reachability alone cannot be promoted into authorization or public access.
  const probeAdmission = classifyOriginProbe(transport.probe());
  if (probeAdmission === "ORIGIN_ABSENT") {
    lifecycle.push("ORIGIN_ABSENT");
    return done("the distribution origin is not reachable");
  }
  if (probeAdmission === "AUTH_REFUSED") {
    lifecycle.push("AUTH_REFUSED");
    return done("the origin refused the presented authorization");
  }
  if (probeAdmission === "AUTH_ABSENT") {
    lifecycle.push("AUTH_ABSENT");
    return done("the origin is neither authenticated nor established as publicly readable");
  }
  lifecycle.push("REACHABILITY_CHECKED");

  const resolution = transport.resolveRef(ref);
  if (resolution === null) {
    lifecycle.push("REF_ABSENT");
    return done(`the origin has no ref ${ref}`);
  }
  refKind = resolution.kind;
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

export function originReceiptRefusal(value: OriginReceipt, subject: ReleaseSubject): string | null {
  if (value.schema !== ORIGIN_RECEIPT_SCHEMA) return "the receipt carries another schema";
  if (value.origin !== "github") return "the receipt is not a GitHub distribution-origin receipt";
  if (value.repositoryFullName !== subject.repository) return "the receipt names another repository";
  if (value.subject.commit !== subject.commit) return "the receipt names another commit";
  if (value.subject.tree !== subject.tree) return "the receipt names another tree";
  if (value.subject.releaseId !== subject.releaseId) return "the receipt names another release";
  if (value.subject.releaseDigest !== subject.releaseDigest) return "the receipt names another release digest";
  if (value.outcome !== "RECEIPT_EMITTED") return `the receipt reports ${value.outcome}`;
  if (!value.freshClone) return "the receipt reports no fresh clone";
  if (!value.cleanupCleared) return "the receipt reports retained resources";
  if (value.refKind === null || MUTABLE_REF_KINDS.has(value.refKind)) return "the receipt resolved a movable ref";
  return null;
}

export const githubOriginState = {
  distributionOriginReachability: "NOT_EXERCISED",
  freshCloneMaterialization: "NOT_EXERCISED",
  releaseManifestReachability: "NOT_EXERCISED",
  signedAttestation: "NOT_IMPLEMENTED",
  forgejoEquivalence: "NOT_IMPLEMENTED",
} as const;
