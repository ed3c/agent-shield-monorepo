# Smart-account validator and execution contracts

Issue #62 (Phase 5 / SEC-80). A minimal ERC-4337 v0.7 account with a session-limited low-risk
route and an owner-signed high-risk route bound to hardware/signing evidence and a policy epoch.

## No dependency is adopted, and that is a decision

#62 says "select and admit an exact permissively licensed smart-account/kernel version". There
are two ways to read that and they lead to different work:

1. Adopt a kernel (ZeroDev, Safe, Kernel). Every one of them is a dependency, and
   `docs/licensing/TECHNOLOGY_REVIEW_MATRIX.md` records `no contract/provider admitted` while
   `AGENTS.md` makes external dependencies deny-by-default. So route 1 cannot start before a
   Human/legal admission that does not exist.
2. Write minimal contracts against the ERC-4337 **interface**, which is a specification rather
   than a library. Nothing to admit, so SEC-AA-001's dependency gate does not apply to the
   contracts at all.

**This leaf takes route 2**, and says so rather than letting the choice pass as an
implementation detail. `IAccount.sol` is the specification transcribed, field for field — which
`contracts.test.ts` proves by asserting the resulting `validateUserOp` selector is the canonical
`0x19822f7c`. A transcription error anywhere in `PackedUserOperation` changes that selector.

If you would rather adopt a kernel, this leaf is what its validator would plug into, and the
admission still has to happen first.

The compiler is a separate question. `solc` is GPL-3.0, and a *declared* dependency on it would
be the unreviewed copyleft term SEC-AA-001 refuses. A build-time compiler is not a linked
dependency — the same reasoning that lets this repository use Bun and TypeScript without
declaring them. `bun add --no-save` keeps that true in the tree, and the eval suite fails if any
`dependencies`, `devDependencies` or `peerDependencies` field ever appears.

## Where this leaf stops

```text
UNDEPLOYED → DEPENDENCY_ADMITTED → COMPILED → STATIC_ANALYZED → TESTED → AUDIT_PENDING → …
                                                       ▲
                                                       └── this leaf ends here
```

`solc` compiles; it does not execute. So:

| Eval | State |
|---|---|
| SEC-AA-001 dependency/licence | **exercised** — no dependency exists, asserted rather than claimed |
| SEC-AA-002 reproducible compile | **exercised** — recompiled and diffed in `p5-smart-account.yml` |
| SEC-AA-005 fee transparency | **exercised** — statically, over the ABI and the source |
| SEC-AA-006 upgrade/admin | **exercised** — statically, over the ABI, opcodes and storage layout |
| SEC-AA-003 session boundary | **NOT_IMPLEMENTED at runtime** — the checks are asserted present, not observed firing |
| SEC-AA-004 high-risk boundary | same |
| SEC-AA-007 adversarial | **NOT_IMPLEMENTED** — reentrancy, replay and gas bounds need an EVM |
| SEC-AA-008 audit | **NOT_IMPLEMENTED** |

Reaching `TESTED` means admitting an EVM — `@ethereumjs/evm`, or a Foundry binary — into a
workspace that declares zero dependencies. That is the dependency-admission transaction again,
and it is a Human decision rather than something this leaf should take on its own.

`smartAccountState` records all of that, with a compile-time floor rejecting any widening to
`PASS`.

## What the static analysis can actually prove

More than it sounds like, because the subject is compiled output rather than source text:

- **Opcode census.** The deployed bytecode contains `CALL`, `SLOAD`, `SSTORE`, `STATICCALL` and
  nothing else of interest. No `DELEGATECALL` — so the account cannot execute foreign code in
  its own storage, whatever the source says. No `SELFDESTRUCT`, `CREATE`, `CREATE2`, `CALLCODE`
  or `ORIGIN`.
- **Storage layout.** Exactly two slots: `sessions` and `policyEpoch`. Everything else is
  `immutable` or `constant` and lives in code, so a new storage variable is a named failure.
- **Mutating ABI.** Exactly five state-changing functions, enumerated. Adding a sixth fails.
- **Absent admin surface.** No `upgradeTo`, `initialize`, `transferOwnership`, `setOwner`,
  `setEntryPoint`, `setFeeRecipient` or `setFeeBasisPoints`.
- **Live error surface.** Every custom error in the ABI must be thrown somewhere in the source.

The opcode scanner is itself checked, because it has one specific way to be wrong: `PUSH`
instructions carry immediate bytes, and a scanner that does not skip them reads operands as
instructions. `PUSH1 0xf4` would be reported as `DELEGATECALL` by a naive scan, which would make
the whole census meaningless. That case is a fixture.

## Design notes worth reading before changing anything

**Immutable everything.** SEC-AA-006 asks for least-privilege admin. The least privilege
available is no admin operation at all, so `entryPoint`, `owner`, `feeRecipient`,
`feeBasisPoints` and `feeCapWei` are constructor-set immutables. There is no ownership transfer
to protect, no upgrade slot to collide with, and no initializer to front-run. A compromised
owner is a redeployment.

**One authorisation path.** Every administrative operation is `onlySelf`, reachable only by the
account calling itself, which is reachable only through the owner validation route. So there is
one place authorisation is decided rather than one per function.

**The session counter advances during validation.** The EntryPoint charges for validation
whether or not the call later succeeds; incrementing after execution would let a reverting call
be retried without limit.

**Signature malleability is not optional.** For every valid `(r, s, v)` there is a second
`(r, -s mod n, v ^ 1)` recovering the same address. The upper half of the curve order is
refused, or one authorisation can be presented two different ways.

**Time bounds are returned, not compared.** The session route packs `validAfter`/`validUntil`
into `validationData` instead of reading `block.timestamp`, because `TIMESTAMP` is a banned
opcode under the ERC-4337 validation rules and a bundler would reject the operation.

## What the plant check found

Thirty plants, thirty red — across two families. Source-level plants edit the Solidity and
re-run the offline suite; compiled plants edit it, **recompile**, and then re-run, so they cover
rules that only exist in the ABI, the opcode census or the storage layout and that no source
grep could see.

The check found one defect before the suite was even finished: `SessionValueRefused` was
declared in the ABI and never thrown. The session route reports a refused value through
`validationData` rather than a revert, as ERC-4337 requires. A documented failure mode that
cannot happen is worse than an undocumented one, because an integrator will handle it. The error
was deleted and the "every declared error is thrown" rule added so it cannot come back.

## Exercising it

```bash
bun test contracts/analysis/contracts.test.ts   # offline, no compiler
bun contracts/analysis/compile.ts --check       # reproducibility, needs solc
```

The offline suite is what the repository-wide `bun test` runs, so `ci.yml` never reaches for a
compiler or the network. The reproducibility half lives in `.github/workflows/p5-smart-account.yml`,
which also plants three defects into the build and requires the gate to catch each one.

## Human boundary

Dependency and audit acceptance, admin/upgrade/fee policy, testnet deployment and any production
deployment require Human Admit and independent smart-contract review. No address in this
directory is deployed, and no deployment is claimed.
