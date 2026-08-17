import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import { RealGitHubOriginTransport } from "./real-origin.ts";
import { originReceiptRefusal, verifyGitHubOrigin } from "./verifier.ts";

const REPOSITORY = "ed3c/agent-shield-monorepo";
const GIT_OID = /^[a-f0-9]{40}$/;
const SHA_256 = /^[a-f0-9]{64}$/;

function git(args: readonly string[]): string {
  const result = spawnSync("git", [...args], { encoding: "utf8" });
  if (result.status !== 0 || typeof result.stdout !== "string") {
    throw new Error("live GitHub-origin runner could not inspect the checked-out subject");
  }
  return result.stdout.trim();
}

function localSubject(commit: string): ReleaseSubject {
  const head = git(["rev-parse", "HEAD^{commit}"]);
  if (head !== commit) throw new Error("workflow checkout does not match the requested immutable commit");

  const tree = git(["rev-parse", "HEAD^{tree}"]);
  if (!GIT_OID.test(tree)) throw new Error("checked-out tree is not a full object identifier");

  const manifest = JSON.parse(readFileSync("data/releases/agent-shield-module-set.json", "utf8")) as {
    release?: unknown;
    content_sha256?: unknown;
  };
  if (typeof manifest.release !== "string" || manifest.release.length === 0) {
    throw new Error("local release manifest has no release identifier");
  }
  if (typeof manifest.content_sha256 !== "string" || !SHA_256.test(manifest.content_sha256)) {
    throw new Error("local release manifest has no content-addressed digest");
  }

  return {
    repository: REPOSITORY,
    commit,
    tree,
    releaseId: manifest.release,
    releaseDigest: manifest.content_sha256,
  };
}

const commit = process.argv[2] ?? "";
if (!GIT_OID.test(commit)) {
  throw new Error("usage: bun scripts/integration/github-origin/live-runner.ts <40-hex-commit>");
}

const subject = localSubject(commit);
const transport = new RealGitHubOriginTransport(REPOSITORY);
const { receipt } = verifyGitHubOrigin({
  identity: {
    host: "github.com",
    owner: "ed3c",
    repository: "agent-shield-monorepo",
    trackedUrl: `https://github.com/${REPOSITORY}.git`,
    expectedFullName: REPOSITORY,
  },
  subject,
  ref: commit,
  transport,
});

const refusal = originReceiptRefusal(receipt, subject);
console.log(JSON.stringify(receipt, null, 2));
if (refusal !== null) throw new Error(`live GitHub-origin receipt refused: ${refusal}`);
