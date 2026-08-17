import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CloneReport,
  CommitObject,
  GitHubOriginTransport,
  ManifestReport,
  OriginCleanupAccount,
  OriginProbe,
  RefResolution,
} from "./types.ts";

const GIT_OID = /^[a-f0-9]{40}$/;
const PUBLIC_GITHUB = /^https:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\.git$/;

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: readonly string[]) => CommandResult;

function defaultCommandRunner(command: string, args: readonly string[]): CommandResult {
  const result = spawnSync(command, [...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

function cleanOid(value: string): string | null {
  const oid = value.trim();
  return GIT_OID.test(oid) ? oid : null;
}

function gitArgs(args: readonly string[]): string[] {
  return ["-c", "credential.helper=", "-c", "credential.interactive=never", ...args];
}

/**
 * Real transport for the public GitHub distribution origin used by #145.
 *
 * It never accepts a credential-bearing URL, never follows a branch fallback, and never exposes
 * command stderr/stdout in the receipt. Temporary repositories are owned by this transport and
 * are removed by cleanupAccount(), which is invoked by the verifier on every terminal path.
 */
export class RealGitHubOriginTransport implements GitHubOriginTransport {
  readonly #url: string;
  readonly #run: CommandRunner;
  #fetchRoot: string | null = null;
  #fetchRepo: string | null = null;
  readonly #cloneRoots = new Set<string>();

  constructor(repositoryFullName: string, run: CommandRunner = defaultCommandRunner) {
    const url = `https://github.com/${repositoryFullName}.git`;
    if (!PUBLIC_GITHUB.test(url) || url.includes("@github.com")) {
      throw new Error("invalid public GitHub origin identity");
    }
    this.#url = url;
    this.#run = run;
  }

  probe(): OriginProbe {
    const result = this.#run("git", gitArgs(["ls-remote", "--exit-code", this.#url, "HEAD"]));
    return {
      reachable: result.status === 0,
      authenticated: false,
      refused: false,
      publiclyReadable: result.status === 0,
    };
  }

  resolveRef(ref: string): RefResolution | null {
    if (!GIT_OID.test(ref)) return null;
    if (!this.#ensureFetched(ref)) return null;
    const resolved = this.#gitInFetchRepo(["rev-parse", "FETCH_HEAD^{commit}"]);
    const commit = resolved === null ? null : cleanOid(resolved.stdout);
    return commit === ref ? { kind: "commit", commit } : null;
  }

  fetchCommit(commit: string): CommitObject | null {
    if (!GIT_OID.test(commit) || !this.#ensureFetched(commit)) return null;
    const resolved = this.#gitInFetchRepo(["rev-parse", "FETCH_HEAD^{commit}"]);
    const tree = this.#gitInFetchRepo(["rev-parse", "FETCH_HEAD^{tree}"]);
    if (resolved === null || tree === null) return null;
    const fetchedCommit = cleanOid(resolved.stdout);
    const fetchedTree = cleanOid(tree.stdout);
    if (fetchedCommit === null || fetchedTree === null) return null;
    return { commit: fetchedCommit, tree: fetchedTree };
  }

  readReleaseManifest(commit: string): ManifestReport | null {
    if (!GIT_OID.test(commit) || !this.#ensureFetched(commit)) return null;
    const shown = this.#gitInFetchRepo(["show", `${commit}:data/releases/agent-shield-module-set.json`]);
    if (shown === null) return null;
    try {
      const value = JSON.parse(shown.stdout) as { release?: unknown; content_sha256?: unknown };
      if (typeof value.release !== "string" || typeof value.content_sha256 !== "string") return null;
      return { releaseId: value.release, releaseDigest: value.content_sha256 };
    } catch {
      return null;
    }
  }

  freshClone(commit: string): CloneReport | null {
    if (!GIT_OID.test(commit)) return null;
    const root = mkdtempSync(join(tmpdir(), "agent-shield-gh-clone-"));
    const clone = join(root, "repo");
    this.#cloneRoots.add(root);

    const cloned = this.#run("git", gitArgs(["clone", "--no-checkout", "--no-local", "--filter=blob:none", this.#url, clone]));
    if (cloned.status !== 0) return null;
    if (this.#run("git", gitArgs(["-C", clone, "fetch", "--no-tags", "--depth=1", "origin", commit])).status !== 0) return null;
    if (this.#run("git", gitArgs(["-C", clone, "checkout", "--detach", commit])).status !== 0) return null;

    const head = this.#run("git", gitArgs(["-C", clone, "rev-parse", "HEAD^{commit}"]));
    const tree = this.#run("git", gitArgs(["-C", clone, "rev-parse", "HEAD^{tree}"]));
    const remote = this.#run("git", gitArgs(["-C", clone, "remote", "get-url", "origin"]));
    if (head.status !== 0 || tree.status !== 0 || remote.status !== 0) return null;

    const clonedCommit = cleanOid(head.stdout);
    const clonedTree = cleanOid(tree.stdout);
    if (clonedCommit === null || clonedTree === null) return null;

    const alternatePath = join(clone, ".git", "objects", "info", "alternates");
    const referenceRepository = existsSync(alternatePath)
      ? String(readFileSync(alternatePath, "utf8")).trim() || "present"
      : null;
    const remoteUrl = remote.stdout.trim();

    return {
      commit: clonedCommit,
      tree: clonedTree,
      usedLocalObjectCache: referenceRepository !== null,
      referenceRepository,
      clonedFromLocalPath: !PUBLIC_GITHUB.test(remoteUrl),
    };
  }

  cleanupAccount(): OriginCleanupAccount {
    let retainedClones = 0;
    const roots = [...this.#cloneRoots];
    if (this.#fetchRoot !== null) roots.push(this.#fetchRoot);

    for (const root of roots) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        retainedClones += 1;
      }
    }

    this.#cloneRoots.clear();
    this.#fetchRoot = null;
    this.#fetchRepo = null;
    return { clones: retainedClones, processes: 0, credentialStreams: 0 };
  }

  #ensureFetched(commit: string): boolean {
    if (this.#fetchRepo === null) {
      this.#fetchRoot = mkdtempSync(join(tmpdir(), "agent-shield-gh-fetch-"));
      this.#fetchRepo = join(this.#fetchRoot, "repo");
      if (this.#run("git", gitArgs(["init", this.#fetchRepo])).status !== 0) return false;
      if (this.#run("git", gitArgs(["-C", this.#fetchRepo, "remote", "add", "origin", this.#url])).status !== 0) return false;
    }
    return this.#run("git", gitArgs(["-C", this.#fetchRepo, "fetch", "--no-tags", "--depth=1", "origin", commit])).status === 0;
  }

  #gitInFetchRepo(args: readonly string[]): CommandResult | null {
    if (this.#fetchRepo === null) return null;
    const result = this.#run("git", gitArgs(["-C", this.#fetchRepo, ...args]));
    return result.status === 0 ? result : null;
  }
}
