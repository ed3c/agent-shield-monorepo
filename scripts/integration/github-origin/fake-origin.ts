import type {
  CloneReport,
  CommitObject,
  GitHubOriginTransport,
  ManifestReport,
  OriginCleanupAccount,
  RefKind,
  RefResolution,
} from "./types.ts";

export const COMMIT = "1".repeat(40);
export const TREE = "2".repeat(40);
export const RELEASE_ID = "agent-shield-module-set@0.1.0";
export const RELEASE_DIGEST = "3".repeat(64);

// INT-GH-005 and INT-GH-007. The token this fake origin would authenticate with. The privacy
// control searches every serialized receipt for it, so a receipt that grows a URL, a log or a
// helper field turns the eval red instead of turning it quiet.
export const PLANTED_TOKEN = "planted-origin-token-ghp-4c7e" as const;

// A deterministic stand-in for the GitHub API, Git transport and credential helper. Every field
// is a knob a negative control turns; nothing here touches the network.
export class FakeGitHubOrigin implements GitHubOriginTransport {
  reachable = true;
  authenticated = true;
  refused = false;

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

  // Present so that a receipt which grows a credential-bearing field has something to leak.
  readonly #token = PLANTED_TOKEN;

  probe(): { reachable: boolean; authenticated: boolean; refused: boolean } {
    void this.#token;
    return { reachable: this.reachable, authenticated: this.authenticated, refused: this.refused };
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
