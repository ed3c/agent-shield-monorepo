import type {
  CommitObject,
  CredentialSource,
  ForgejoCleanupAccount,
  ForgejoOriginTransport,
  HelperPolicy,
  ManifestReport,
  MutationReport,
  RefResolution,
  RuntimeBindingRef,
} from "./types.ts";

export const COMMIT = "1".repeat(40);
export const TREE = "2".repeat(40);
export const RELEASE_ID = "agent-shield-module-set@0.1.0";
export const RELEASE_DIGEST = "3".repeat(64);
export const BINDING_DIGEST = "4".repeat(64);

// INT-FJ-003. The value the broker would hand over. The privacy control searches every
// serialized receipt for it, so a receipt that grows a token, a URL or a log field turns the
// eval red instead of turning it quiet.
export const PLANTED_SECRET = "planted-forgejo-token-fj-9d21" as const;

// A deterministic stand-in for a loopback Forgejo, its Git transport and the Keychain broker.
export class FakeForgejoOrigin implements ForgejoOriginTransport {
  serviceUp = true;
  repositoryPresent = true;

  binding: RuntimeBindingRef | null = {
    profileId: "authoring-origin-read",
    canonicalSha256: BINDING_DIGEST,
    ownerRepository: "ed3c/runtime-env",
  };

  helperChain: CredentialSource[] = ["keychain-broker"];
  helperResetBeforeApply = true;
  childEnvironmentKeys: string[] = ["PATH", "HOME"];

  authenticated = true;
  refused = false;
  authSource: CredentialSource = "keychain-broker";

  refKind: RefResolution["kind"] = "commit";
  resolvedCommit: string | null = null;

  fetches = true;
  fetchedCommit: string | null = null;
  fetchedTree: string | null = null;

  readsManifest = true;
  manifestReleaseId: string | null = null;
  manifestDigest: string | null = null;

  originRefsWritten = 0;
  consumerWorkingTreeChanged = false;

  retainedClones = 0;
  retainedProcesses = 0;
  retainedCredentialStreams = 0;
  retainedLeases = 0;

  readonly #secret = PLANTED_SECRET;

  probe(): { serviceUp: boolean; repositoryPresent: boolean } {
    void this.#secret;
    return { serviceUp: this.serviceUp, repositoryPresent: this.repositoryPresent };
  }

  runtimeBinding(): RuntimeBindingRef | null {
    return this.binding;
  }

  helperPolicy(): HelperPolicy {
    return {
      chain: this.helperChain,
      resetBeforeApply: this.helperResetBeforeApply,
      childEnvironmentKeys: this.childEnvironmentKeys,
    };
  }

  authenticate(): { authenticated: boolean; refused: boolean; source: CredentialSource } {
    return { authenticated: this.authenticated, refused: this.refused, source: this.authSource };
  }

  resolveRef(ref: string): RefResolution | null {
    if (ref === "absent") return null;
    return { kind: this.refKind, commit: this.resolvedCommit ?? COMMIT };
  }

  fetchCommit(commit: string): CommitObject | null {
    if (!this.fetches) return null;
    return { commit: this.fetchedCommit ?? commit, tree: this.fetchedTree ?? TREE };
  }

  readReleaseManifest(commit: string): ManifestReport | null {
    void commit;
    if (!this.readsManifest) return null;
    return {
      releaseId: this.manifestReleaseId ?? RELEASE_ID,
      releaseDigest: this.manifestDigest ?? RELEASE_DIGEST,
    };
  }

  mutationReport(): MutationReport {
    return {
      originRefsWritten: this.originRefsWritten,
      consumerWorkingTreeChanged: this.consumerWorkingTreeChanged,
    };
  }

  cleanupAccount(): ForgejoCleanupAccount {
    return {
      clones: this.retainedClones,
      processes: this.retainedProcesses,
      credentialStreams: this.retainedCredentialStreams,
      leases: this.retainedLeases,
    };
  }
}
