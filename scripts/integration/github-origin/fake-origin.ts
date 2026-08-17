import type {
  CloneReport,
  CommitObject,
  GitHubOriginTransport,
  ManifestReport,
  OriginCleanupAccount,
  OriginProbe,
  RefKind,
  RefResolution,
} from "./types.ts";

export const COMMIT = "1".repeat(40);
export const TREE = "2".repeat(40);
export const RELEASE_ID = "agent-shield-module-set@0.1.0";
export const RELEASE_DIGEST = "3".repeat(64);
export const PLANTED_TOKEN = "planted-origin-token-ghp-4c7e" as const;

export class FakeGitHubOrigin implements GitHubOriginTransport {
  reachable = true;
  authenticated = true;
  refused = false;
  publiclyReadable: boolean | undefined = undefined;

  refKind: RefKind = "commit";
  resolvedCommit: string | null = null;

  fetches = true;
  fetchedCommit: string | null = null;
  fetchedTree: string | null = null;

  clones = true;
  cloneUsedLocalObjectCache = false;
  cloneReferenceRepository: string | null = null;
  cloneFromLocalPath = false;
  clonedCommit: string | null = null;
  clonedTree: string | null = null;

  readsManifest = true;
  manifestReleaseId: string | null = null;
  manifestDigest: string | null = null;

  retainedClones = 0;
  retainedProcesses = 0;
  retainedCredentialStreams = 0;

  readonly #token = PLANTED_TOKEN;

  probe(): OriginProbe {
    void this.#token;
    return {
      reachable: this.reachable,
      authenticated: this.authenticated,
      refused: this.refused,
      publiclyReadable: this.publiclyReadable,
    };
  }

  resolveRef(ref: string): RefResolution | null {
    if (ref === "absent") return null;
    return { kind: this.refKind, commit: this.resolvedCommit ?? COMMIT };
  }

  fetchCommit(commit: string): CommitObject | null {
    if (!this.fetches) return null;
    return { commit: this.fetchedCommit ?? commit, tree: this.fetchedTree ?? TREE };
  }

  freshClone(commit: string): CloneReport | null {
    if (!this.clones) return null;
    return {
      commit: this.clonedCommit ?? commit,
      tree: this.clonedTree ?? TREE,
      usedLocalObjectCache: this.cloneUsedLocalObjectCache,
      referenceRepository: this.cloneReferenceRepository,
      clonedFromLocalPath: this.cloneFromLocalPath,
    };
  }

  readReleaseManifest(commit: string): ManifestReport | null {
    void commit;
    if (!this.readsManifest) return null;
    return {
      releaseId: this.manifestReleaseId ?? RELEASE_ID,
      releaseDigest: this.manifestDigest ?? RELEASE_DIGEST,
    };
  }

  cleanupAccount(): OriginCleanupAccount {
    return {
      clones: this.retainedClones,
      processes: this.retainedProcesses,
      credentialStreams: this.retainedCredentialStreams,
    };
  }
}
