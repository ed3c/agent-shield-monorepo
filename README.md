# Agent Shield Monorepo

Agent Shield is a Bun + TypeScript modular product skeleton and the reference external consumer for `bettor-arena`. The repository turns a broad source architecture into explicit contracts, state machines, provider boundaries, molecular implementation issues, and falsifiable receipts.

The documentation and Git-governance foundation is merged. Git Town v24.0.0 has an admitted macOS arm64 artifact and the repository wrappers have exercised parent-first rebase/publication, lease serialization, semantic-conflict preservation, background lifecycle, and process-group cleanup. Linux execution is still `ABSENT`; upstream release attestation is `NOT_EXERCISED`; a promoted Worker image is `NOT_IMPLEMENTED`.

The next product/provider work is split into eval-first Phase 3–6 terminal issues. This README indexes that work; it does not claim those providers are implemented.

## Laws without examples

1. Bun + TypeScript are the primary product and control-plane stack; Bash is limited to bounded Git/process orchestration.
2. Modules communicate through typed contracts, packets, immutable artifacts, capabilities, or receipts—not private source paths.
3. `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, `NOT_EXERCISED`, blocked states, cleanup, and Human Admit are separate facts.
4. Source prose, diagrams, package names, licenses, hashes, and one platform's success never prove another live capability.
5. Secrets, browser/device sessions, host paths, and mutable owner checkouts never enter Git, portable bundles, MCP payloads, or receipts.
6. Every implementation issue defines state transitions, data flow, evals, disagreement controls, path ownership, rollback, and Human-owned operations before code.
7. Git Town manages feature-branch ancestry; Git commit/tree identity, one writer lease, isolated worktrees, and explicit PR parentage remain canonical.
8. Source repair uses Git ancestry and content identity. Timestamp-based `newest`, `prefer-cloud`, or `prefer-beta` overwrite is forbidden.
9. Human Admit owns semantic conflict resolution, merge, policy/key/permission expansion, release promotion, destructive recovery, and production settlement.

## Exact current-state snapshot

Snapshot basis for issue [#37](https://github.com/ed3c/agent-shield-monorepo/issues/37): `main` commit `30e020616d8a20847b197f259ff8692a1af46bde`, tree `a2c9fa53a271aaf1c9c7b2fea0cff187e16640a6`.

| Plane | Current executable/evidence state | Next admitted work |
|---|---|---|
| Document ingest | local UTF-8 deterministic `PASS`; PDF/cloud `NOT_IMPLEMENTED` | parser/provider issue must be created separately |
| Research routing | raw-primary `external-verify` route `PASS`; signed-in routes `NOT_EXERCISED`/`NOT_IMPLEMENTED` | environment-specific browser/provider issues |
| Runtime fabric | disposable local Git worktree `PASS`; Apple Container/OpenShell-tmux `NOT_EXERCISED`; E2B `NOT_IMPLEMENTED` | [#38–#44](https://github.com/ed3c/agent-shield-monorepo/issues/38) |
| Product adapters | contracts present; Expo/Maestro/WDA/scrcpy `NOT_EXERCISED`; In-App bridge/cloud iOS `NOT_IMPLEMENTED` | [#45–#53](https://github.com/ed3c/agent-shield-monorepo/issues/45) |
| Security boundaries | intent validation/reference threshold present; OPA/workflow/broker/ledger/hardware/MPC/account/settlement `NOT_IMPLEMENTED` | [#54–#64](https://github.com/ed3c/agent-shield-monorepo/issues/54) |
| Bettor consumer | deterministic subject/bootstrap contracts present; live Claude/Codex/Forgejo/origin equivalence `NOT_EXERCISED` | [#65–#75](https://github.com/ed3c/agent-shield-monorepo/issues/65) |
| Git Town Worker | macOS GT-LIVE-002..005 and macOS portion of GT-LIVE-006 `PASS`; Linux `ABSENT`; attestation `NOT_EXERCISED`; image promotion `NOT_IMPLEMENTED` | keep states separate; no product-state promotion |

Machine-readable current product/provider states remain in [`data/status/integration.json`](data/status/integration.json). Git Town receipts are host-owned and summarized in [`scripts/git-town/README.md`](scripts/git-town/README.md).

## Directory → state machine → data flow

| Directory/plane | State-machine owner | Core flow | Current terminal issues |
|---|---|---|---|
| `docs/`, `third_party/` | provenance/admission | source → claim class → decision → requirement/eval | [#37](https://github.com/ed3c/agent-shield-monorepo/issues/37) |
| `packages/contracts/` | canonical typed boundary | closed request → validation → typed state/receipt | [#38](https://github.com/ed3c/agent-shield-monorepo/issues/38), [#45](https://github.com/ed3c/agent-shield-monorepo/issues/45), [#54](https://github.com/ed3c/agent-shield-monorepo/issues/54), [#65](https://github.com/ed3c/agent-shield-monorepo/issues/65) |
| `services/document-ingest/` | document-ingest | bytes → media/provider route → digest/artifact receipt | future parser/provider issue |
| `services/research-orchestrator/` | research-orchestrator | workflow request → route selection → evidence/artifact reference | future browser/provider issue |
| `services/runtime-fabric/` | runtime-fabric | runtime request → provider lifecycle → artifacts → cleanup | [#38–#44](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md#phase-3--runtime-fabric) |
| `apps/`, `services/mobile-automation/` | product-adapters | typed action → product/QA/provider state → observable receipt | [#45–#53](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md#phase-4--product-and-mobile-automation) |
| `services/intent-ledger/`, `services/security-boundaries/` | security-boundaries | intent → risk route → evidence/signing/ledger/submission states | [#54–#64](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md#phase-5--security-hardware-and-testnet-settlement) |
| `packages/agent-shield-sdk/`, bettor scripts | bettor-consumer | immutable release → closure/bindings/surfaces → canaries/origins → Human Admit | [#65–#75](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md#phase-6--bettor-arena-reference-consumer) |
| `scripts/git-town/` | Git-management harness | task packet → worktree/lease → dry-run/sync → eval → optional guarded publish → PR/Human merge | current mechanism merged; product stacks use it |
| `.arena/`, `data/` | module/release control plane | manifests/status/receipts → deterministic release projection | convergence issue in each phase |

The canonical transition details are in [`docs/state-machines/README.md`](docs/state-machines/README.md). The bidirectional directory/issue/eval index is [`docs/traceability/STATE_MACHINE_INDEX.md`](docs/traceability/STATE_MACHINE_INDEX.md).

## Harness narratives

- **Source-claim Harness:** source `S-001` proposes E2B, OpenShell/tmux, hot sync, mobile automation, hardware brakes, MPC/TSS, smart accounts, and settlement. The repository preserves those claims but keeps each provider in `NOT_IMPLEMENTED` or `NOT_EXERCISED` until its terminal issue produces an exact receipt.
- **Runtime Harness:** local, cloud, and hybrid routes are independent. A local PASS cannot proxy cloud; provider execution cannot proxy policy, PTY, cleanup, or recovery.
- **Product Harness:** UI and automation surfaces render the exact receipt state. Waiting, denied, absent, stale, failed, and completed are distinct.
- **Security Harness:** policy, durable workflow, broker, ledger, hardware, cryptography, contract, and chain evidence arrive independently; no single component creates an end-to-end safety claim.
- **Git-stack Harness:** one Worker owns one issue, branch, path lease, and worktree. Conflict preserves the blocked state and creates a recovery handoff rather than an automatic semantic edit.
- **Bettor-consumer Harness:** an immutable release resolves selected modules, Skills, runtime, CLI/MCP, Claude/Codex, and origin receipts. Promotion remains Human-owned.

## Molecular Stacked PR implementation map

```text
main
├── Phase 3 runtime foundation #38
│   ├── #39 Apple Container
│   ├── #40 E2B
│   ├── #41 OpenShell policy
│   ├── #42 tmux/PTY
│   ├── #43 local/cloud exchange
│   └── #44 runtime convergence (after all leaves)
├── Phase 4 product foundation #45
│   ├── #46 dashboard/GenUI
│   ├── #47 terminal projection
│   ├── #48 Expo mobile
│   │   └── #49 In-App action bridge
│   ├── #50 External MCP/Maestro
│   ├── #51 iOS WDA
│   ├── #52 Android scrcpy
│   └── #53 product convergence (after all leaves)
├── Phase 5 security foundation #54
│   ├── #55 OPA policy
│   ├── #56 durable workflow
│   ├── #57 OpenBao broker
│   ├── #58 verified ledger/restore
│   ├── #59 Secure Enclave
│   ├── #60 CoreNFC
│   ├── #61 MPC/TSS
│   ├── #62 smart-account contracts
│   │   └── #63 testnet bundler/paymaster
│   └── #64 security convergence/Human dossier
└── Phase 6 consumer foundation #65
    └── #66 module closure
        ├── #67 Skills binding
        └── #68 runtime binding
            └── #69 CLI/MCP parity
                ├── #70 Claude canary
                ├── #71 Codex canary
                ├── #72 GitHub origin
                └── #73 Forgejo origin
                    └── #74 origin equivalence
                        └── #75 release promotion/rollback
```

Independent leaves are sibling PRs with disjoint writable paths. Shared registries, module versions, status, release manifests, and aggregate indexes belong to the phase convergence issue. Full branches, bases, path leases, eval prefixes, and merge order are in [`docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md).

## Git Town operating boundary

```bash
bash scripts/git-town/doctor.sh
bash scripts/git-town/sync-stack.sh --dry-run
bash scripts/git-town/sync-stack.sh
# Remote publication remains separately guarded:
ALLOW_GIT_TOWN_PUSH=1 bash scripts/git-town/sync-stack.sh --publish
```

Git Town moves branch ancestry; it does not manufacture correctness. `git town sync` success cannot proxy an eval, review, release, or production PASS. Workers never auto-run semantic conflict edits, `continue`, `skip`, `undo`, `ship`, merge, permission widening, or promotion.

## Documentation map

Start with [`AGENTS.md`](AGENTS.md), then [`docs/INDEX.md`](docs/INDEX.md).

| Need | Canonical document |
|---|---|
| Project intent | [`docs/intent/PROJECT_INTENT.md`](docs/intent/PROJECT_INTENT.md) |
| Source claims and locators | [`docs/sources/SOURCE_LEDGER.md`](docs/sources/SOURCE_LEDGER.md) |
| Architecture and ownership | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| State machines/data flow | [`docs/state-machines/README.md`](docs/state-machines/README.md) |
| Molecular issue/Stack PR plan | [`docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md) |
| Directory/state/issue/eval trace | [`docs/traceability/STATE_MACHINE_INDEX.md`](docs/traceability/STATE_MACHINE_INDEX.md) |
| Evidence and negative controls | [`docs/harness/README.md`](docs/harness/README.md), [`docs/evals/README.md`](docs/evals/README.md) |
| Git Town mechanism | [`docs/git/README.md`](docs/git/README.md), [`scripts/git-town/README.md`](scripts/git-town/README.md) |

The nearest directory `README.md` is the local ownership and state-routing contract.

## Verify the existing baseline

```bash
bun run check:all
```

Without a generated `.arena/consumer.lock.json`, bettor live integration remains `NOT_EXERCISED`; absence is never converted into PASS.

## Evidence boundary

The uploaded architecture source describes a broad target topology and example implementations. It is the basis for source IDs and planned modules, not live proof. Provider versions, licenses, performance, cost, security, store compliance, custody, settlement, and recovery must be independently admitted for the exact artifact and environment. This documentation branch changes no product/provider implementation or machine status ledger.
