import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CleanupReadback,
  InceptionRuntimeContract,
} from "./types.ts";
import {
  InceptionSandboxContractError,
  validateCleanupReadback,
  validateRuntimeContract,
} from "./validate.ts";

const DIGEST = /^sha256:[0-9a-f]{64}$/;

export interface LocalFixtureReceipt {
  schemaVersion: "agent-shield/inception-local-fixture-receipt/v1";
  runtimeSubject: InceptionRuntimeContract["runtimeSubject"];
  leaseId: string;
  workspaceName: string;
  environmentNames: readonly string[];
  exitCode: 0;
  stdoutSha256: string;
  artifactSha256: string;
  evidence: {
    localExecution: "PASS";
    providerObservation: "NOT_EXERCISED";
    networkIsolation: "NOT_EXERCISED";
  };
  cleanup: CleanupReadback;
}

function sha256(value: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new InceptionSandboxContractError(message);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function validateLocalFixtureReceipt(receipt: LocalFixtureReceipt): void {
  assert(
    receipt.schemaVersion === "agent-shield/inception-local-fixture-receipt/v1",
    "unexpected local fixture receipt schema",
  );
  assert(receipt.runtimeSubject.repository === "ed3c/runtime-env", "runtime owner drift");
  assert(receipt.leaseId.length > 0, "local fixture lease id is required");
  assert(receipt.workspaceName.length > 0, "local fixture workspace name is required");
  assert(receipt.exitCode === 0, "local fixture did not exit cleanly");
  assert(DIGEST.test(receipt.stdoutSha256), "local fixture stdout digest is invalid");
  assert(DIGEST.test(receipt.artifactSha256), "local fixture artifact digest is invalid");
  assert(receipt.evidence.localExecution === "PASS", "local fixture must identify local PASS");
  assert(
    receipt.evidence.providerObservation === "NOT_EXERCISED",
    "local fixture cannot promote itself to provider observation",
  );
  assert(
    receipt.evidence.networkIsolation === "NOT_EXERCISED",
    "local fixture cannot claim network isolation",
  );
  validateCleanupReadback(receipt.cleanup);
}

export async function runReversibleLocalFixture(
  contract: InceptionRuntimeContract,
  now: string,
): Promise<LocalFixtureReceipt> {
  validateRuntimeContract(contract, now);
  assert(
    contract.policy.network === "NONE",
    "local fixture requires the strict NONE network policy",
  );

  const root = await mkdtemp(join(tmpdir(), "inception-a2-"));
  const workspace = join(root, contract.workspaceLease.workspaceName);
  const probeScript = join(
    dirname(fileURLToPath(import.meta.url)),
    "local-fixture-probe.ts",
  );

  let stdout = new Uint8Array();
  let artifact = new Uint8Array();
  let childExit: number | null = null;

  try {
    await mkdir(workspace, { recursive: false });
    const input = {
      schema: "agent-shield/inception-local-fixture-input/v1",
      leaseId: contract.workspaceLease.leaseId,
      workspaceName: contract.workspaceLease.workspaceName,
    };
    await writeFile(
      join(workspace, "probe-input.json"),
      JSON.stringify(input),
      { encoding: "utf8", flag: "wx" },
    );

    const child = Bun.spawn({
      cmd: [process.execPath, probeScript],
      cwd: workspace,
      env: {
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        TMPDIR: root,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    stdout = new Uint8Array(await new Response(child.stdout).arrayBuffer());
    const stderr = new Uint8Array(await new Response(child.stderr).arrayBuffer());
    childExit = await child.exited;

    assert(childExit === 0, `local fixture child exited ${childExit}`);
    assert(
      stdout.byteLength + stderr.byteLength <= contract.workload.resources.outputBytes,
      "local fixture output exceeded the contract bound",
    );

    artifact = new Uint8Array(await readFile(join(workspace, "probe-output.json")));
    const parsed = JSON.parse(new TextDecoder().decode(artifact)) as {
      schema?: string;
      leaseId?: string;
      workspaceName?: string;
      result?: string;
    };
    assert(
      parsed.schema === "agent-shield/inception-local-fixture-output/v1",
      "local fixture artifact schema drift",
    );
    assert(parsed.leaseId === contract.workspaceLease.leaseId, "local fixture lease drift");
    assert(
      parsed.workspaceName === contract.workspaceLease.workspaceName,
      "local fixture workspace drift",
    );
    assert(parsed.result === "PASS", "local fixture result is not PASS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const cleanup: CleanupReadback = {
    pathResidue: (await exists(root)) ? 1 : 0,
    processResidue: childExit === null ? 1 : 0,
    portResidue: 0,
    indexResidue: 0,
    containerResidue: 0,
    mountResidue: 0,
    artifactResidue: (await exists(join(workspace, "probe-output.json"))) ? 1 : 0,
  };

  const receipt: LocalFixtureReceipt = {
    schemaVersion: "agent-shield/inception-local-fixture-receipt/v1",
    runtimeSubject: contract.runtimeSubject,
    leaseId: contract.workspaceLease.leaseId,
    workspaceName: contract.workspaceLease.workspaceName,
    environmentNames: [...contract.environmentNames].sort(),
    exitCode: 0,
    stdoutSha256: sha256(stdout),
    artifactSha256: sha256(artifact),
    evidence: {
      localExecution: "PASS",
      providerObservation: "NOT_EXERCISED",
      networkIsolation: "NOT_EXERCISED",
    },
    cleanup,
  };
  validateLocalFixtureReceipt(receipt);
  return receipt;
}
