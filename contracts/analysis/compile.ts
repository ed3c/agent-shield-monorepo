#!/usr/bin/env bun
// SEC-AA-002. Compile the admitted contract sources with an exact compiler and exact settings,
// and write the result as a content-addressed artifact.
//
// This script is the only thing in the repository that needs a compiler, and it is deliberately
// not part of `bun test`: the committed artifact is what the deterministic evals assert against,
// so the offline suite stays offline and the reproducibility check lives in its own workflow.
//
// Usage:
//   bun contracts/analysis/compile.ts                 write contracts/build/pinned.json
//   bun contracts/analysis/compile.ts --check         recompile and diff against the committed
//                                                     artifact, exit 1 on any difference

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The exact compiler. `solc` is published as an immutable npm version, and the compiler
// reports its own full identity including the commit -- which is what gets pinned, so a
// different build of the same nominal version is a mismatch rather than a silent substitution.
export const SOLC_VERSION = "0.8.28" as const;
export const SOLC_LONG_VERSION = "0.8.28+commit.7893614a.Emscripten.clang" as const;

// SEC-AA-002. Every setting that changes output. Optimizer runs, EVM version and the metadata
// hash mode are all part of the subject: flipping any of them produces different bytecode from
// identical source, which is exactly what the negative control does.
export const SOLC_SETTINGS = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "cancun",
  metadata: { bytecodeHash: "none", appendCBOR: false },
  outputSelection: {
    "*": {
      "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "evm.methodIdentifiers", "storageLayout"],
      "": ["ast"],
    },
  },
} as const;

export const SOURCES = ["src/IAccount.sol", "src/SessionAccount.sol"] as const;
export const ARTIFACT_PATH = "contracts/build/pinned.json";

export interface ContractArtifact {
  abi: unknown[];
  creationBytecodeSha256: string;
  deployedBytecodeSha256: string;
  deployedBytecodeBytes: number;
  methodIdentifiers: Record<string, string>;
  storageLayout: { slot: string; offset: number; label: string; type: string }[];
  opcodes: string[];
}

export interface PinnedArtifact {
  schema: "agent-shield/solidity-build/v1";
  solcLongVersion: string;
  settingsSha256: string;
  sourcesSha256: Record<string, string>;
  contracts: Record<string, ContractArtifact>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// The opcode set of the deployed bytecode. Enough to answer "does this contract contain
// DELEGATECALL" without a disassembler: PUSH1..PUSH32 carry immediates that must be skipped or
// their operand bytes get read as instructions, which is how a naive scan invents opcodes.
export function opcodesOf(deployedHex: string): string[] {
  const NAMES: Record<number, string> = {
    0xf1: "CALL", 0xf2: "CALLCODE", 0xf4: "DELEGATECALL", 0xfa: "STATICCALL",
    0xf0: "CREATE", 0xf5: "CREATE2", 0xff: "SELFDESTRUCT", 0x32: "ORIGIN",
    0x55: "SSTORE", 0x54: "SLOAD", 0x42: "TIMESTAMP", 0x43: "NUMBER",
  };
  const bytes = deployedHex.replace(/^0x/, "");
  const seen: string[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const op = Number.parseInt(bytes.slice(i, i + 2), 16);
    if (Number.isNaN(op)) break;
    const name = NAMES[op];
    if (name !== undefined && !seen.includes(name)) seen.push(name);
    if (op >= 0x60 && op <= 0x7f) i += (op - 0x5f) * 2;
  }
  return seen.sort();
}

export async function compile(root: string): Promise<PinnedArtifact> {
  // Imported here rather than at module scope so that importing this file for its constants --
  // which the offline eval suite does -- never reaches for a compiler.
  const solc = (await import(`solc`)).default as {
    version(): string;
    compile(input: string): string;
  };

  const longVersion = solc.version();
  if (longVersion !== SOLC_LONG_VERSION) {
    throw new Error(`invalid solidity build: compiler is ${longVersion}, expected ${SOLC_LONG_VERSION}`);
  }

  const sources: Record<string, { content: string }> = {};
  const sourcesSha256: Record<string, string> = {};
  for (const relative of SOURCES) {
    const content = readFileSync(join(root, "contracts", relative), "utf8");
    sources[relative] = { content };
    sourcesSha256[relative] = sha256(content);
  }

  const output = JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity",
    sources,
    settings: SOLC_SETTINGS,
  }))) as {
    errors?: { severity: string; formattedMessage: string }[];
    contracts: Record<string, Record<string, {
      abi: unknown[];
      evm: {
        bytecode: { object: string };
        deployedBytecode: { object: string };
        methodIdentifiers: Record<string, string>;
      };
      storageLayout: { storage: { slot: string; offset: number; label: string; type: string }[] };
    }>>;
  };

  // Warnings are not tolerated. A warning is the compiler saying it noticed something and
  // guessed; on a contract holding funds that is not an acceptable trade.
  const problems = (output.errors ?? []).filter((error) => error.severity !== "info");
  if (problems.length > 0) {
    throw new Error(`invalid solidity build: ${problems.map((p) => p.formattedMessage).join("\n")}`);
  }

  const contracts: Record<string, ContractArtifact> = {};
  for (const [file, entries] of Object.entries(output.contracts)) {
    for (const [name, entry] of Object.entries(entries)) {
      // Interfaces compile to empty bytecode and have nothing to pin.
      if (entry.evm.deployedBytecode.object.length === 0) continue;
      contracts[`${file}:${name}`] = {
        abi: entry.abi,
        creationBytecodeSha256: sha256(entry.evm.bytecode.object),
        deployedBytecodeSha256: sha256(entry.evm.deployedBytecode.object),
        deployedBytecodeBytes: entry.evm.deployedBytecode.object.length / 2,
        methodIdentifiers: entry.evm.methodIdentifiers,
        storageLayout: entry.storageLayout?.storage ?? [],
        opcodes: opcodesOf(entry.evm.deployedBytecode.object),
      };
    }
  }

  return {
    schema: "agent-shield/solidity-build/v1",
    solcLongVersion: longVersion,
    settingsSha256: sha256(JSON.stringify(SOLC_SETTINGS)),
    sourcesSha256,
    contracts,
  };
}

if (import.meta.main) {
  const root = process.cwd();
  const built = await compile(root);
  const rendered = `${JSON.stringify(built, null, 2)}\n`;
  const target = join(root, ARTIFACT_PATH);

  if (process.argv.includes("--check")) {
    const committed = readFileSync(target, "utf8");
    if (committed !== rendered) {
      const a = JSON.parse(committed) as PinnedArtifact;
      console.error("The compiled artifact does not match the committed one.");
      console.error(`  compiler   committed=${a.solcLongVersion} built=${built.solcLongVersion}`);
      console.error(`  settings   committed=${a.settingsSha256.slice(0, 16)} built=${built.settingsSha256.slice(0, 16)}`);
      for (const [name, contract] of Object.entries(built.contracts)) {
        const before = a.contracts[name];
        if (before === undefined) { console.error(`  ${name}: absent from the committed artifact`); continue; }
        if (before.deployedBytecodeSha256 !== contract.deployedBytecodeSha256) {
          console.error(`  ${name}: deployed bytecode ${before.deployedBytecodeSha256.slice(0, 16)} -> ${contract.deployedBytecodeSha256.slice(0, 16)}`);
        }
      }
      process.exit(1);
    }
    console.log(`PASS solidity build reproduced ${built.solcLongVersion}`);
  } else {
    writeFileSync(target, rendered);
    console.log(`PASS solidity build ${built.solcLongVersion} -> ${ARTIFACT_PATH}`);
    for (const [name, contract] of Object.entries(built.contracts)) {
      console.log(`  ${name} deployed=${contract.deployedBytecodeBytes}B sha256=${contract.deployedBytecodeSha256.slice(0, 16)}`);
    }
  }
}
