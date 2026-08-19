import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  const root = mkdtempSync(join(tmpdir(), "inception-a2-"));
  const workspace = join(root, contract.workspaceLease.workspaceName);
  const probeScript = new URL("./local-fixture-probe.ts", import.meta.url).pathname;

  let stdout = "";
  let artifact = new Uint8Array();
  let childExit: number | null = null;

  try {
    mkdirSync(workspace, { recursive: false });
    const input = {
      schema: "agent-shield/inception-local-fixture-input/v1",
      leaseId: contract.workspaceLease.leaseId,
      workspaceName: contract.workspaceLease.workspaceName,
    };
    writeFileSync(
      join(workspace, "probe-input.json"),
      JSON.stringify(input),
      { encoding: "utf8", flag: "wx" },
    );

    const child = spawnSync("bun", [probeScript], {
      cwd: workspace,
      env: {
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        TMPDIR: root,
      },
      encoding: "utf8",
      timeout: contract.workload.timeoutSeconds * 1000,
      maxBuffer: contract.workload.resources.outputBytes,
      shell: false,
    });

    childExit = child.status;
    stdout = typeof child.stdout === "string" ? child.stdout : "";
    const stderr = typeof child.stderr === "string" ? child.stderr : "";

    assert(child.error === undefined, `local fixture spawn failed: ${String(child.error)}`);
    assert(child.signal === null, `local fixture child terminated by ${String(child.signal)}`);
    assert(childExit === 0, `local fixture child exited ${String(childExit)}: ${stderr}`);
    assert(
      stdout.length + stderr.length <= contract.workload.resources.outputBytes,
      "local fixture output exceeded the contract bound",
    );

    artifact = new Uint8Array(readFileSync(join(workspace, "probe-output.json")));
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
    rmSync(root, { recursive: true, force: true });
  }

  const cleanup: CleanupReadback = {
    pathResidue: existsSync(root) ? 1 : 0,
    processResidue: childExit === null ? 1 : 0,
    portResidue: 0,
    indexResidue: 0,
    containerResidue: 0,
    mountResidue: 0,
    artifactResidue: existsSync(join(workspace, "probe-output.json")) ? 1 : 0,
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
