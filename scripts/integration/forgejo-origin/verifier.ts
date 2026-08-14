import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import { validateForgejoLifecycle } from "./state-machine.ts";
import {
  AUTHORING_RECEIPT_SCHEMA,
  type AuthoringOriginIdentity,
  type AuthoringOriginReceipt,
  type CredentialSource,
  type ForgejoOriginTransport,
  type ForgejoState,
  type HelperPolicy,
} from "./types.ts";

const GIT_OID = /^[a-f0-9]{40}$/;
const SHA_256 = /^[a-f0-9]{64}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

// INT-FJ-002. The only source that keeps the value inside the helper. Everything else in
// `CredentialSource` is a way for it to become readable by something that is not the helper.
const APPROVED_SOURCE: CredentialSource = "keychain-broker";

// INT-FJ-003. Environment names a credential reaches a child process through. Unlike a value
// scan this is a name scan, because the value is exactly what must never be here to be scanned.
const CREDENTIAL_ENVIRONMENT_KEYS = [
  "GIT_ASKPASS", "GIT_TOKEN", "FORGEJO_TOKEN", "GITEA_TOKEN",
  "GIT_CREDENTIAL_HELPER", "GH_TOKEN", "GITHUB_TOKEN",
];

// INT-FJ-004. Refs that can move under the same name.
const MUTABLE_REF_KINDS = new Set(["branch", "lightweight-tag"]);

export function fail(message: string): never {
  throw new Error(`invalid authoring origin contract: ${message}`);
}

// INT-FJ-001. A trusted-local authoring origin, read-only.
//
// `localhost` is not accepted as a host: a hosts file can point that name anywhere, and the
// whole reason this origin is trusted is that it is not on the network. The literal loopback
// addresses are the only thing that cannot be redirected.
export function assertAuthoringIdentity(identity: AuthoringOriginIdentity): AuthoringOriginIdentity {
  if (identity.host !== "127.0.0.1" && identity.host !== "::1") {
    fail(`host ${identity.host} is not a loopback address`);
  }
  if (!Number.isSafeInteger(identity.port) || identity.port < 1 || identity.port > 65_535) {
    fail("the authoring origin port is not a valid port number");
  }
  if (!NAME.test(identity.owner)) fail("owner is invalid");
  if (!NAME.test(identity.repository)) fail("repository is invalid");

  const fullName = `${identity.owner}/${identity.repository}`;
  if (identity.expectedFullName !== fullName) {
    fail(`the tracked repository is ${fullName} and the release names ${identity.expectedFullName}`);
  }
  // INT-FJ-006. A canary that can push can rewrite the thing it is verifying, so write scope is
  // refused at admission rather than merely unused.
  if (identity.scope !== "read") fail("the authoring-origin canary must be admitted read-only");
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

// INT-FJ-002 and INT-FJ-003. The helper chain, and what it lets escape.
export function helperPolicyRefusal(policy: HelperPolicy): string | null {
  // Without a reset, an inherited global helper stays in the chain and nothing in the chain
  // itself shows it -- the configuration reads exactly like a clean one.
  if (!policy.resetBeforeApply) return "the credential helper chain was not reset before the approved helper was applied";
  // Exactly one entry. A chain of two is a fallback, and a fallback is the thing that runs when
  // the approved helper is unavailable -- which is precisely when it must not.
  if (policy.chain.length > 1) return `the credential helper chain has ${policy.chain.length} entries, which is a fallback`;
  // There is deliberately no separate `chain.length === 0` rule. It was written first and the
  // plant check found it dead: `chain[0]` on an empty array is `undefined`, which never equals
  // the approved source, so this line already refuses an empty chain. The fallback below is
  // only so the refusal reads as a sentence rather than naming `undefined`.
  if (policy.chain[0] !== APPROVED_SOURCE) {
    return `the credential helper chain uses ${policy.chain[0] ?? "no helper at all"}`;
  }

  for (const key of policy.childEnvironmentKeys) {
    if (CREDENTIAL_ENVIRONMENT_KEYS.includes(key)) return `the child environment carries ${key}`;
  }
  return null;
}

interface Cleanup {
  cleared: boolean;
  detail: string;
}

function cleanup(transport: ForgejoOriginTransport): Cleanup {
  const account = transport.cleanupAccount();
  const leaks = [
    ["clones", account.clones],
    ["processes", account.processes],
    ["credential streams", account.credentialStreams],
    ["leases", account.leases],
  ] as const;
  const retained = leaks.filter(([, count]) => count > 0);
  if (retained.length === 0) return { cleared: true, detail: "no clone, process, credential stream or lease was retained" };
  return { cleared: false, detail: `the run retained ${retained.map(([n, c]) => `${c} ${n}`).join(", ")}` };
}

function receipt(
  identity: AuthoringOriginIdentity,
  subject: ReleaseSubject,
  lifecycle: ForgejoState[],
  detail: string,
  credentialSource: CredentialSource | null,
  readOnly: boolean,
  cleanupCleared: boolean,
): AuthoringOriginReceipt {
  return {
    schema: AUTHORING_RECEIPT_SCHEMA,
    origin: "forgejo",
    repositoryFullName: `${identity.owner}/${identity.repository}`,
    subject,
    lifecycle,
    outcome: validateForgejoLifecycle(lifecycle),
    credentialSource,
    readOnly,
    cleanupCleared,
    detail,
  };
}

export interface AuthoringVerificationRequest {
  identity: AuthoringOriginIdentity;
  subject: ReleaseSubject;
  ref: string;
  transport: ForgejoOriginTransport;
}

// UNRESOLVED → ORIGIN_IDENTITY_PINNED → RUNTIME_BINDING_VERIFIED → HELPER_POLICY_CHECKED
//           → AUTHENTICATED → REF_FETCHED → COMMIT_VERIFIED → TREE_VERIFIED
//           → RELEASE_MANIFEST_VERIFIED → RECEIPT_EMITTED → CLEANED
export function verifyForgejoOrigin(request: AuthoringVerificationRequest): { receipt: AuthoringOriginReceipt } {
  const { identity, subject, ref, transport } = request;
  assertAuthoringIdentity(identity);
  assertReleaseSubject(subject);
  if (`${identity.owner}/${identity.repository}` !== subject.repository) {
    fail("the release subject names another repository than the origin identity");
  }

  const lifecycle: ForgejoState[] = ["UNRESOLVED"];
  let source: CredentialSource | null = null;
  const done = (detail: string, readOnly = true): { receipt: AuthoringOriginReceipt } => {
    const cleared = cleanup(transport);
    return { receipt: receipt(identity, subject, lifecycle, detail, source, readOnly, cleared.cleared) };
  };

  // A service that is not running and a service that is running without this repository are
  // different facts: the first is an environment problem, the second says the release was never
  // pushed to the authoring origin.
  const probe = transport.probe();
  if (!probe.serviceUp) {
    lifecycle.push("SERVICE_UNREACHABLE");
    return done("the authoring origin service is not running");
  }
  if (!probe.repositoryPresent) {
    lifecycle.push("ORIGIN_ABSENT");
    return done("the authoring origin does not host this repository");
  }
  lifecycle.push("ORIGIN_IDENTITY_PINNED");

  // The runtime binding is a projection of a workload the runtime-env repository owns. A binding
  // whose owner is this repository is a second canonical copy, which is the drift #68's contract
  // exists to prevent.
  const binding = transport.runtimeBinding();
  if (binding === null) {
    lifecycle.push("HELPER_POLICY_REFUSED");
    return done("no runtime binding is resolved for the authoring origin");
  }
  if (!SHA_256.test(binding.canonicalSha256)) {
    lifecycle.push("HELPER_POLICY_REFUSED");
    return done("the runtime binding is not content-addressed");
  }
  if (binding.ownerRepository === subject.repository) {
    lifecycle.push("HELPER_POLICY_REFUSED");
    return done("the runtime binding names this repository as its canonical owner");
  }
  lifecycle.push("RUNTIME_BINDING_VERIFIED");

  const policyRefused = helperPolicyRefusal(transport.helperPolicy());
  if (policyRefused !== null) {
    lifecycle.push("HELPER_POLICY_REFUSED");
    return done(policyRefused);
  }
  lifecycle.push("HELPER_POLICY_CHECKED");

  const auth = transport.authenticate();
  source = auth.source;
  // Refusal outranks absence: something was presented and rejected, which invites a different
  // response from nothing being presented.
  if (auth.refused) {
    lifecycle.push("AUTH_REFUSED");
    return done("the authoring origin refused the brokered authorization");
  }
  if (!auth.authenticated) {
    lifecycle.push("AUTH_ABSENT");
    return done("the broker produced no authorization");
  }
  // The chain said keychain-broker; this is what actually answered. A chain that is configured
  // correctly and a helper that actually ran are two different claims.
  if (auth.source !== APPROVED_SOURCE) {
    lifecycle.push("HELPER_POLICY_REFUSED");
    return done(`the authorization came from ${auth.source} rather than the approved broker`);
  }
  lifecycle.push("AUTHENTICATED");

  const resolution = transport.resolveRef(ref);
  if (resolution === null) {
    lifecycle.push("REF_ABSENT");
    return done(`the authoring origin has no ref ${ref}`);
  }
  // INT-FJ-004. No fallback to GitHub and no fallback to a branch. The control is "a missing
  // Forgejo commit with a GitHub copy available", and there is no GitHub in this file at all.
  if (MUTABLE_REF_KINDS.has(resolution.kind)) {
    lifecycle.push("REF_ABSENT");
    return done(`ref ${ref} resolved as a ${resolution.kind}, which can move under the same name`);
  }
  if (resolution.commit !== subject.commit) {
    lifecycle.push("REF_ABSENT");
    return done("the ref resolves to another commit than the release names");
  }
  lifecycle.push("REF_FETCHED");

  const object = transport.fetchCommit(subject.commit);
  if (object === null) {
    lifecycle.push("FETCH_FAILED");
    return done("the commit object could not be fetched");
  }
  if (object.commit !== subject.commit) {
    lifecycle.push("COMMIT_MISMATCH");
    return done("the authoring origin returned another commit object");
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
    return done("the release manifest could not be read from the authoring origin");
  }
  if (manifest.releaseId !== subject.releaseId) {
    lifecycle.push("MANIFEST_MISMATCH");
    return done("the authoring origin carries another release identifier at this commit");
  }
  if (manifest.releaseDigest !== subject.releaseDigest) {
    lifecycle.push("MANIFEST_MISMATCH");
    return done("the release manifest digest does not match the release subject");
  }
  lifecycle.push("RELEASE_MANIFEST_VERIFIED");

  // INT-FJ-006. Checked after the read rather than before it: the claim is that this run wrote
  // nothing, and only a run that has finished reading can support it.
  const mutations = transport.mutationReport();
  const readOnly = mutations.originRefsWritten === 0 && !mutations.consumerWorkingTreeChanged;
  if (!readOnly) {
    lifecycle.push("FAILED_CLEANUP");
    return done(
      mutations.originRefsWritten > 0
        ? `the canary wrote ${mutations.originRefsWritten} refs to the authoring origin`
        : "the canary changed the consumer working tree",
      false,
    );
  }
  lifecycle.push("RECEIPT_EMITTED");

  const cleared = cleanup(transport);
  if (!cleared.cleared) {
    lifecycle.push("FAILED_CLEANUP");
    return { receipt: receipt(identity, subject, lifecycle, cleared.detail, source, true, false) };
  }
  lifecycle.push("CLEANED");
  return done("the release is reachable from the authoring origin");
}

// A receipt is checkable by a party that did not produce it.
export function authoringReceiptRefusal(
  value: AuthoringOriginReceipt,
  subject: ReleaseSubject,
): string | null {
  if (value.schema !== AUTHORING_RECEIPT_SCHEMA) return "the receipt carries another schema";
  if (value.origin !== "forgejo") return "the receipt is not a Forgejo authoring-origin receipt";
  if (value.repositoryFullName !== subject.repository) return "the receipt names another repository";
  if (value.subject.commit !== subject.commit) return "the receipt names another commit";
  if (value.subject.tree !== subject.tree) return "the receipt names another tree";
  if (value.subject.releaseId !== subject.releaseId) return "the receipt names another release";
  if (value.subject.releaseDigest !== subject.releaseDigest) return "the receipt names another release digest";
  if (value.outcome !== "CLEANED") return `the receipt reports ${value.outcome}`;
  if (value.credentialSource !== APPROVED_SOURCE) return `the receipt reports authorization from ${value.credentialSource}`;
  if (!value.readOnly) return "the receipt reports a run that wrote";
  if (!value.cleanupCleared) return "the receipt reports retained resources";
  return null;
}

export const forgejoOriginState = {
  authoringOriginReachability: "NOT_EXERCISED",
  brokeredAuthentication: "NOT_EXERCISED",
  releaseManifestReachability: "NOT_EXERCISED",
  githubEquivalence: "NOT_IMPLEMENTED",
  signedAttestation: "NOT_IMPLEMENTED",
} as const;
