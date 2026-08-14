export {
  COMMIT,
  FakeGitHubOrigin,
  PLANTED_TOKEN,
  RELEASE_DIGEST,
  RELEASE_ID,
  TREE,
} from "./fake-origin.ts";
export { assertOriginTransition, isOriginOutcome, validateOriginLifecycle } from "./state-machine.ts";
export {
  assertOriginIdentity,
  assertReleaseSubject,
  fail,
  githubOriginState,
  originReceiptRefusal,
  verifyGitHubOrigin,
  type OriginVerificationRequest,
} from "./verifier.ts";
export { ORIGIN_RECEIPT_SCHEMA } from "./types.ts";
export type {
  CloneReport,
  CommitObject,
  GitHubOriginTransport,
  ManifestReport,
  OriginCleanupAccount,
  OriginIdentity,
  OriginOutcome,
  OriginReceipt,
  OriginState,
  RefKind,
  RefResolution,
} from "./types.ts";
