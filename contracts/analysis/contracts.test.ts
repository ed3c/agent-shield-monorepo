import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ARTIFACT_PATH,
  SOLC_LONG_VERSION,
  SOLC_SETTINGS,
  SOURCES,
  opcodesOf,
  type PinnedArtifact,
} from "./compile.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SEC-AA ${message}`);
}

// This suite is deliberately offline. It asserts static properties of the *committed* build
// artifact, so `bun test` never reaches for a compiler and never touches the network. The
// reproducibility half -- recompiling and diffing -- lives in `.github/workflows/p5-smart-account.yml`,
// because that is the half that genuinely needs solc.
const ROOT = join(import.meta.dir, "../..");
const artifact = JSON.parse(readFileSync(join(ROOT, ARTIFACT_PATH), "utf8")) as PinnedArtifact;
const SUBJECT = "src/SessionAccount.sol:SessionAccount";
const account = artifact.contracts[SUBJECT];

interface AbiEntry {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: { type: string; name: string }[];
  outputs?: { type: string }[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function source(relative: string): string {
  return readFileSync(join(ROOT, "contracts", relative), "utf8");
}

// SEC-AA-001. The dependency claim, checked rather than asserted in prose.
//
// `docs/licensing/TECHNOLOGY_REVIEW_MATRIX.md` records `no contract/provider admitted`, and
// `AGENTS.md` makes external dependencies deny-by-default. These contracts are written against
// the ERC-4337 interface, which is a specification rather than a library -- so there is nothing
// to admit. That is only true while every import stays relative and the workspace stays
// dependency-free, which is what this checks.
function dependencyClosure(): void {
  ok(account !== undefined, `the artifact does not contain ${SUBJECT}`);

  for (const relative of SOURCES) {
    const text = source(relative);
    const imports = [...text.matchAll(/^\s*import\s[^;]*?["']([^"']+)["']/gm)].map((m) => m[1] as string);
    for (const specifier of imports) {
      ok(specifier.startsWith("./") || specifier.startsWith("../"), `${relative} imports ${specifier}, which is a package rather than a sibling source`);
    }
    // A licence identifier on every file, because a file without one is a file whose terms are
    // whatever the reader assumes.
    ok(/^\/\/ SPDX-License-Identifier: MIT$/m.test(text), `${relative} has no MIT SPDX identifier`);
    // An exact pragma. `^0.8.28` would let a future compiler produce different bytecode from
    // the same source, which is the whole property SEC-AA-002 is about.
    ok(/^pragma solidity 0\.8\.28;$/m.test(text), `${relative} does not pin an exact compiler pragma`);
  }

  const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, unknown>;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    ok(manifest[field] === undefined, `the workspace declares ${field}, so SEC-AA-001 admission applies after all`);
  }
}

// SEC-AA-002. The offline half of reproducibility: the committed artifact describes the
// committed sources, compiled by the named compiler with the named settings.
//
// This cannot prove the bytecode is what solc produces -- only a recompile can, and that is the
// workflow's job. It can prove the artifact is not stale, which is the failure that happens
// every time somebody edits a contract and forgets.
function artifactFreshness(): void {
  ok(artifact.schema === "agent-shield/solidity-build/v1", "the artifact schema is not the admitted one");
  ok(artifact.solcLongVersion === SOLC_LONG_VERSION, `the artifact was built by ${artifact.solcLongVersion}`);
  ok(artifact.settingsSha256 === sha256(JSON.stringify(SOLC_SETTINGS)), "the artifact was built with other compiler settings");

  for (const relative of SOURCES) {
    const recorded = artifact.sourcesSha256[relative];
    ok(recorded !== undefined, `the artifact does not record ${relative}`);
    ok(recorded === sha256(source(relative)), `${relative} has changed since the artifact was built`);
  }
  ok(Object.keys(artifact.sourcesSha256).length === SOURCES.length, "the artifact records sources the build does not compile");

  // Settings that are load-bearing for reproducibility, asserted individually so that changing
  // one is a named failure rather than an opaque digest mismatch.
  ok(SOLC_SETTINGS.optimizer.enabled, "the optimizer setting is not pinned on");
  ok(SOLC_SETTINGS.optimizer.runs === 200, "the optimizer run count is not pinned");
  ok(SOLC_SETTINGS.evmVersion === "cancun", "the EVM version is not pinned");
  // Metadata carries absolute source paths and compiler details. Leaving it in makes the
  // bytecode depend on where the repository happened to be checked out.
  ok(SOLC_SETTINGS.metadata.bytecodeHash === "none", "the metadata hash is embedded in the bytecode");
  ok(SOLC_SETTINGS.metadata.appendCBOR === false, "CBOR metadata is appended to the bytecode");
}

// SEC-AA-006. Upgrade and admin surface, as a property of the compiled contract.
function upgradeAndAdmin(): void {
  // The opcode census is the strongest statement available without an EVM: a contract whose
  // deployed bytecode contains no DELEGATECALL cannot execute foreign code in its own storage,
  // whatever its source says.
  const forbidden = ["DELEGATECALL", "CALLCODE", "SELFDESTRUCT", "CREATE", "CREATE2", "ORIGIN"];
  for (const opcode of forbidden) {
    ok(account.opcodes.includes(opcode) === false, `the deployed bytecode contains ${opcode}`);
  }
  // And the ones that must be present, so a future contract that silently loses its state or
  // its outbound call is caught rather than passing by absence.
  for (const opcode of ["CALL", "SLOAD", "SSTORE"]) {
    ok(account.opcodes.includes(opcode), `the deployed bytecode has no ${opcode}`);
  }

  const abi = account.abi as AbiEntry[];
  const functions = abi.filter((entry) => entry.type === "function");
  const mutating = functions.filter((entry) => entry.stateMutability !== "view" && entry.stateMutability !== "pure");

  // Every name a proxy or an owner-transfer pattern would introduce. Their absence is what
  // makes "immutable owner" true of the deployment and not only of the source.
  for (const name of ["upgradeTo", "upgradeToAndCall", "initialize", "transferOwnership", "setOwner", "setEntryPoint", "setFeeRecipient", "setFeeBasisPoints"]) {
    ok(functions.some((entry) => entry.name === name) === false, `the ABI exposes ${name}`);
  }

  // The mutating surface is enumerated exactly. A new external state-changing function is a new
  // authorisation question, and it should not be possible to add one without this failing.
  const expected = ["validateUserOp", "execute", "openSession", "closeSession", "advancePolicyEpoch"];
  const actual = mutating.map((entry) => entry.name).sort();
  ok(JSON.stringify(actual) === JSON.stringify([...expected].sort()), `the mutating ABI is ${actual.join(", ")}`);

  // Storage is two slots. Immutables and constants live in code, so anything appearing here
  // that is not a session map or the epoch is state somebody added without saying so.
  const layout = account.storageLayout.map((slot) => `${slot.slot}:${slot.label}`);
  ok(JSON.stringify(layout) === JSON.stringify(["0:sessions", "1:policyEpoch"]), `the storage layout is ${layout.join(", ")}`);
}

// SEC-AA-005. Fee transparency.
function feeTransparency(): void {
  const abi = account.abi as AbiEntry[];
  const functions = abi.filter((entry) => entry.type === "function");

  // Every fee parameter is publicly readable, so a deployment's fee terms can be read off the
  // chain rather than taken from a document.
  for (const name of ["feeRecipient", "feeBasisPoints", "feeCapWei", "MAX_FEE_BASIS_POINTS"]) {
    const entry = functions.find((candidate) => candidate.name === name);
    ok(entry !== undefined, `the ABI does not expose ${name}`);
    ok(entry.stateMutability === "view" || entry.stateMutability === "pure", `${name} is not a read-only accessor`);
  }
  // A fee that moves is a fee nobody can quote. The absence of setters was checked above; this
  // is the other half -- the payment is observable.
  ok(abi.some((entry) => entry.type === "event" && entry.name === "FeePaid"), "fee payment emits no event");

  const text = source("src/SessionAccount.sol");
  ok(/uint16 public constant MAX_FEE_BASIS_POINTS = 100;/.test(text), "the fee ceiling is not a compile-time constant");
  ok(/if \(feeBasisPoints_ > MAX_FEE_BASIS_POINTS\) revert FeeTooHigh\(\);/.test(text), "the fee ceiling is not enforced at construction");
  ok(/if \(fee > feeCapWei\) fee = feeCapWei;/.test(text), "the absolute fee cap is not applied");
  ok(/if \(feeBasisPoints == 0\) return;/.test(text), "there is no path that disables the fee entirely");
}

// SEC-AA-003 and SEC-AA-004, to the extent a static check can reach them. The runtime half is
// NOT_EXERCISED and recorded as such below.
function validationSurface(): void {
  // The canonical ERC-4337 v0.7 selector. Getting this right is not cosmetic: the EntryPoint
  // calls this exact selector, and it is derived from the full PackedUserOperation layout -- so
  // a matching selector proves the struct was transcribed correctly, field for field.
  const selector = account.methodIdentifiers["validateUserOp((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes),bytes32,uint256)"];
  ok(selector === "19822f7c", `validateUserOp has selector ${selector}, not the ERC-4337 v0.7 selector 19822f7c`);
  ok(account.methodIdentifiers["execute(address,uint256,bytes)"] === "b61d27f6", "execute does not carry the conventional selector");

  const text = source("src/SessionAccount.sol");
  // SEC-AA-003. Each session dimension #62 names has to appear as a check, and each is grepped
  // for its own rule so that deleting one is a named failure.
  for (const [dimension, pattern] of [
    ["target", /if \(target != session\.target\) return _SIG_FAILED;/],
    ["function", /if \(selector != session\.selector\) return _SIG_FAILED;/],
    ["value", /if \(value > session\.maxValueWei\) return _SIG_FAILED;/],
    ["rate", /if \(session\.usedCalls >= session\.maxCalls\) return _SIG_FAILED;/],
    ["time", /_packValidationData\(0, session\.validUntil, session\.validAfter\)/],
  ] as const) {
    ok(pattern.test(text), `the session route does not bound ${dimension}`);
  }
  // The rate counter is written during validation, not after execution. A reverting call that
  // did not consume budget can be retried without limit.
  ok(/session\.usedCalls \+= 1;/.test(text), "the session call counter is never advanced");

  // SEC-AA-004 and SEC-AA-007. Signature malleability: for every valid (r, s, v) there is a
  // second (r, -s mod n, v ^ 1) recovering the same address, so the upper half of the curve
  // order has to be refused or one authorisation has two valid credentials.
  ok(/0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0/.test(text), "the signature s-value upper bound is not enforced");
  ok(/if \(v != 27 && v != 28\) return _SIG_FAILED;/.test(text), "the recovery identifier is not constrained");
  ok(/if \(claimedEpoch != policyEpoch\) return _SIG_FAILED;/.test(text), "evidence is not bound to the policy epoch");
  ok(/if \(evidenceDigest == bytes32\(0\)\) return _SIG_FAILED;/.test(text), "an absent evidence digest is accepted");
  // The signature covers the evidence and the epoch, so re-presenting a valid signature with
  // different evidence changes the signed message rather than reusing it.
  ok(/keccak256\(abi\.encode\(userOpHash, evidenceDigest, claimedEpoch\)\)/.test(text), "the signature does not cover the evidence and epoch");

  // Both routes must be reachable and neither may fall through to the other.
  ok(/if \(uint8\(userOp\.signature\[0\]\) == 0\) \{/.test(text), "the two validation routes are not separated by a route tag");
}

// Every declared error must actually be revertible. A custom error in the ABI that no path
// throws is a documented failure mode that cannot happen -- which is worse than undocumented,
// because an integrator will handle it. The plant check found one: `SessionValueRefused`, which
// the session route reports through validationData rather than a revert, per ERC-4337.
function errorSurfaceIsLive(): void {
  const text = source("src/SessionAccount.sol");
  const declared = (account.abi as AbiEntry[]).filter((entry) => entry.type === "error").map((entry) => entry.name as string);
  ok(declared.length > 0, "the contract declares no custom errors");
  for (const name of declared) {
    ok(text.includes(`revert ${name}()`), `error ${name} is declared and never thrown`);
  }
}

// The opcode scanner is itself load-bearing, and it is easy to get wrong in one specific way:
// PUSH instructions carry immediate bytes that must be skipped, or the operands get read as
// instructions and the scan invents opcodes that are not there.
function opcodeScannerIsSound(): void {
  // PUSH1 0xf4 -- the immediate is the DELEGATECALL byte. A scanner that does not skip
  // immediates reports DELEGATECALL here, which would make the whole census meaningless.
  ok(opcodesOf("60f4").includes("DELEGATECALL") === false, "the scanner reads PUSH immediates as instructions");
  // PUSH32 followed by a real DELEGATECALL: 32 immediate bytes then 0xf4.
  ok(opcodesOf(`7f${"00".repeat(32)}f4`).includes("DELEGATECALL"), "the scanner loses instructions after a PUSH32");
  ok(opcodesOf("f4").includes("DELEGATECALL"), "the scanner does not recognise a bare DELEGATECALL");
  ok(opcodesOf("ff").includes("SELFDESTRUCT"), "the scanner does not recognise SELFDESTRUCT");
  ok(opcodesOf("0x5b5b5b").length === 0, "the scanner invents opcodes");
}

// The evidence boundary. A compiler is not an EVM: nothing here executes a single instruction.
export const smartAccountState = {
  reproducibleCompile: "NOT_EXERCISED",
  staticSurface: "NOT_EXERCISED",
  sessionEnforcementAtRuntime: "NOT_IMPLEMENTED",
  adversarialExecution: "NOT_IMPLEMENTED",
  independentAudit: "NOT_IMPLEMENTED",
  deployment: "NOT_IMPLEMENTED",
} as const;

function evidenceBoundary(): void {
  // `reproducibleCompile` and `staticSurface` are NOT_EXERCISED here and moved to a real state
  // by `.github/workflows/p5-smart-account.yml`, which is the only thing that runs a compiler.
  ok(smartAccountState.reproducibleCompile === "NOT_EXERCISED", "a reproducible compile was claimed offline");
  ok(smartAccountState.staticSurface === "NOT_EXERCISED", "a static surface run was claimed offline");
  // These three need an EVM, an auditor and a chain respectively. None is present.
  ok(smartAccountState.sessionEnforcementAtRuntime === "NOT_IMPLEMENTED", "runtime session enforcement was claimed");
  ok(smartAccountState.adversarialExecution === "NOT_IMPLEMENTED", "adversarial execution was claimed");
  ok(smartAccountState.independentAudit === "NOT_IMPLEMENTED", "an audit was claimed");
  ok(smartAccountState.deployment === "NOT_IMPLEMENTED", "a deployment was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const smartAccountNeverPasses: NeverPass<typeof smartAccountState> = true;
void smartAccountNeverPasses;

dependencyClosure();
artifactFreshness();
upgradeAndAdmin();
feeTransparency();
validationSurface();
errorSurfaceIsLive();
opcodeScannerIsSound();
evidenceBoundary();

console.log("SEC-AA GREEN: dependency closure, artifact freshness, upgrade/admin surface, fee transparency, validation surface, live error surface, scanner soundness");
