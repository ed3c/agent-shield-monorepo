import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import { RealGitHubOriginTransport, type CommandResult, type CommandRunner } from "./real-origin.ts";
import { originReceiptRefusal, verifyGitHubOrigin } from "./verifier.ts";

const COMMIT = "1".repeat(40);
const TREE = "2".repeat(40);
const DIGEST = "3".repeat(64);
const RELEASE = "agent-shield-module-set@0.1.0";
const REPOSITORY = "ed3c/agent-shield-monorepo";
const URL = `https://github.com/${REPOSITORY}.git`;

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-GH-REAL ${message}`);
}

function result(stdout = "", status = 0): CommandResult {
  return { status, stdout, stderr: "" };
}

function successfulRunner(calls: string[]): CommandRunner {
  return (_command, args) => {
    const text = args.join(" ");
    calls.push(text);
    if (text.includes("ls-remote")) return result(`${COMMIT}\tHEAD\n`);
    if (text.includes("rev-parse FETCH_HEAD^{commit}")) return result(`${COMMIT}\n`);
    if (text.includes("rev-parse FETCH_HEAD^{tree}")) return result(`${TREE}\n`);
    if (text.includes("show") && text.includes("agent-shield-module-set.json")) {
      return result(JSON.stringify({ release: RELEASE, content_sha256: DIGEST }));
    }
    if (text.includes("rev-parse HEAD^{commit}")) return result(`${COMMIT}\n`);
    if (text.includes("rev-parse HEAD^{tree}")) return result(`${TREE}\n`);
    if (text.includes("remote get-url origin")) return result(`${URL}\n`);
    return result();
  };
}

function subject(): ReleaseSubject {
  return { repository: REPOSITORY, commit: COMMIT, tree: TREE, releaseId: RELEASE, releaseDigest: DIGEST };
}

function fullVerifierUsesRealTransportContract(): void {
  const calls: string[] = [];
  const transport = new RealGitHubOriginTransport(REPOSITORY, successfulRunner(calls));
  const expected = subject();
  const receipt = verifyGitHubOrigin({
    identity: {
      host: "github.com",
      owner: "ed3c",
      repository: "agent-shield-monorepo",
      trackedUrl: URL,
      expectedFullName: REPOSITORY,
    },
    subject: expected,
    ref: COMMIT,
    transport,
  }).receipt;

  ok(receipt.outcome === "RECEIPT_EMITTED", `a successful command contract reported ${receipt.outcome}`);
  ok(receipt.freshClone, "the successful command contract did not record a fresh clone");
  ok(receipt.cleanupCleared, "the successful command contract retained temporary repositories");
  ok(originReceiptRefusal(receipt, expected) === null, "the successful receipt was refused downstream");
  ok(calls.some((call) => call.includes(`fetch --no-tags --depth=1 origin ${COMMIT}`)), "the exact commit was never fetched");
  ok(calls.some((call) => call.includes("clone --no-checkout --no-local")), "the fresh network clone contract was not exercised");
  ok(calls.every((call) => !call.includes("x-access-token") && !call.includes("@github.com")), "a command embedded credentials");
}

function publicProbeFailureStaysAbsent(): void {
  const transport = new RealGitHubOriginTransport(REPOSITORY, () => result("", 128));
  const probe = transport.probe();
  ok(probe.reachable === false, "a failed anonymous probe was reported reachable");
  ok(probe.publiclyReadable === false, "a failed anonymous probe was reported publicly readable");
  ok(probe.authenticated === false, "the anonymous transport fabricated authentication");
}

fullVerifierUsesRealTransportContract();
publicProbeFailureStaysAbsent();
console.log("INT-GH-REAL GREEN: real transport command contract, exact commit, fresh clone, public anonymous evidence, cleanup");
