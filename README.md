# Agent Shield Monorepo

Agent Shield is a Bun + TypeScript modular product/reference-consumer system. It turns broad source architecture into typed contracts, state machines, provider boundaries, molecular issues, falsifiable receipts, and Human-owned release promotion.

The repository is now **post-deterministic / pre-live-convergence**: Phase 3–6 leaf implementations and deterministic convergence verifiers are largely merged, but most real provider/device/hardware/carrier/origin lanes are still `NOT_EXERCISED` or `NOT_IMPLEMENTED`. Do not equate merged code with live capability.

## Read order for Agents

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/architecture/SHADOW_ARCHITECT_MONITOR.md`](docs/architecture/SHADOW_ARCHITECT_MONITOR.md)
3. [`data/status/integration.json`](data/status/integration.json)
4. [`data/releases/agent-shield-module-set.json`](data/releases/agent-shield-module-set.json)
5. [`docs/sources/SOURCE_LEDGER.md`](docs/sources/SOURCE_LEDGER.md)
6. [`docs/state-machines/README.md`](docs/state-machines/README.md)
7. [`docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md)
8. [`docs/traceability/STATE_MACHINE_INDEX.md`](docs/traceability/STATE_MACHINE_INDEX.md)
9. nearest governed-directory `README.md`

If `main` moved after a documented snapshot, rebind to the new exact head/status/release/issue subjects before mutation.

## Laws

1. Exact code, manifests, machine status and receipts outrank prose.
2. `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, `NOT_EXERCISED`, cleanup, Human review and release promotion are distinct states.
3. Source proposal, package presence, compile success, deterministic fixtures and another provider/platform result never proxy live evidence.
4. Cross-module traffic uses typed contracts, packets, immutable artifacts/capabilities or receipts, not private source coupling.
5. One Worker owns one issue, branch, isolated worktree and path lease.
6. Shared registries/status/release/indexes are convergence-owned.
7. Git ancestry/content identity is canonical; timestamp/newest-wins repair is forbidden.
8. Secrets, browser/device profiles, keys/shards, cookies, host secret paths and mutable sibling state never enter portable Git/MCP/receipts.
9. Human Admit owns semantic conflict resolution, permission/legal expansion, merge, release promotion and destructive rollback.

## Exact current evidence boundary

Audit baseline: `main@e54065eb7b4555e9d9cdacb6e76c4e353d5a06c8` for issue #135. Machine truth remains [`data/status/integration.json`](data/status/integration.json); this table is only a readable projection.

| Plane | Deterministic implementation | Live status / real gap | Next owner |
|---|---|---|---|
| Document ingest | local text path implemented/tested | text `PASS`; PDF/cloud unresolved | #139 |
| Research routing | raw-primary/external-verify deterministic route | signed-in/browser/cloud lanes unresolved | #139 |
| Runtime fabric | Phase 3 leaves + deterministic convergence merged | local disposable `PASS`; Apple/OpenShell not exercised; E2B/cloud not admitted/implemented | #95 -> #44 |
| Product/mobile | Phase 4 leaves + deterministic convergence merged | Expo/Maestro/WDA/scrcpy/In-App live evidence incomplete | #136 -> #53 |
| Security/settlement | Phase 5 leaves + deterministic convergence merged | native hardware/MPC/deployment/testnet evidence incomplete | #137 -> #64 |
| Bettor integration | Phase 6 closure/binding/MCP/origin + deterministic convergence merged | Claude/Codex/GitHub/Forgejo/bettor live receipts incomplete | #138 -> #75 |
| Git Town Worker | admitted macOS wrapper evidence | Linux/attestation/image gaps remain separate | existing Git Town evidence |
| Merge governance | workflows execute and currently pass | required exact-head merge enforcement not proven | #140 |

Portable release `agent-shield-module-set@0.1.0` remains `live_state: NOT_EXERCISED`; immutable release bytes do not prove devices, browsers, hardware, settlement, origins or consumers.

## Directory -> State Machine -> DAG -> data flow

| Directory | State-machine owner | Data flow | DAG / terminal owner |
|---|---|---|---|
| `docs/`, `third_party/` | provenance/admission | source -> classification -> decision -> exact dependency/evidence | #135/#139; source ledger |
| `packages/contracts/` | typed contract lifecycle | closed packet -> validation -> typed state/receipt | deterministic Phase 3–6 foundations merged |
| `services/document-ingest/` | document ingest | bytes -> media/provider route -> artifact/digest receipt | #139 molecular PDF/cloud lanes |
| `services/research-orchestrator/` | research route | workflow -> route/policy -> provider artifact/evidence | #139 browser/cloud lanes |
| `services/runtime-fabric/` | runtime lifecycle | request -> provider/policy/PTY -> artifact -> cleanup/residue receipt | #95 siblings -> #44 |
| `apps/`, `services/mobile-automation/` | product/QA lifecycle | typed action -> build/device/provider -> observation/media -> cleanup receipt | #136 siblings -> #53 |
| `services/intent-ledger/`, `services/security-boundaries/` | security lifecycle | intent -> risk/policy -> hardware/crypto/ledger/chain -> revocation receipt | #137 siblings -> #64 |
| `packages/agent-shield-sdk/`, integration scripts | reference-consumer lifecycle | immutable release -> closure/binding/MCP -> carriers/origins -> equivalence -> cleanup | #138 siblings -> #75 |
| `scripts/git-town/` | Worker/Stack lifecycle | task packet -> worktree/lease -> dry-run/sync -> eval -> guarded publish -> PR | molecular index in its README |
| `.arena/`, `data/` | composition/release lifecycle | manifests + receipts -> deterministic status/release projection | phase convergence only |
| `.github/` | review/CI governance | PR exact head -> checks -> Human review -> merge | #140 |

Canonical details: [`docs/state-machines/README.md`](docs/state-machines/README.md) and [`docs/traceability/STATE_MACHINE_INDEX.md`](docs/traceability/STATE_MACHINE_INDEX.md).

## Current molecular Stack PR graph

```text
main
├── #95 LIVE-NET runtime
│   ├── local provider leaf
│   └── cloud provider leaf
│       └── #44 runtime convergence / Human Admit
├── #136 LIVE-UX
│   ├── Expo/device
│   ├── Maestro
│   ├── WDA/iOS
│   ├── scrcpy/Android
│   └── In-App bridge
│       └── #53 product convergence / Human Admit
├── #137 LIVE-SEC
│   ├── Secure Enclave
│   ├── CoreNFC
│   ├── MPC/TSS
│   ├── smart-account deployment
│   └── testnet settlement
│       └── #64 security convergence / Human Admit
├── #138 LIVE-INT
│   ├── Claude Code
│   ├── Codex CLI
│   ├── GitHub origin
│   ├── Forgejo origin
│   └── bettor bootstrap
│       └── #75 release convergence / Human Admit
├── #139 source closure
│   ├── PDF local
│   ├── document cloud
│   ├── signed-in browser
│   └── GCR cloud
└── #140 required merge gate
```

Detailed branch/path/eval rules are in [`docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md) and [`scripts/git-town/README.md`](scripts/git-town/README.md).

## Closure ladder

```text
SOURCE_PROPOSAL
-> REPOSITORY_DECISION
-> ISSUE_ADMITTED
-> CONTRACT_IMPLEMENTED
-> DETERMINISTIC_EVAL_PASS
-> LIVE_SUBJECT_PINNED
-> LIVE_CANARY_PASS
-> CLEANUP/ROLLBACK_PASS
-> CONVERGENCE_HUMAN_REVIEW
-> HUMAN_ADMITTED
-> RELEASE_PROMOTED
```

A problem is closed only at the rung required by its claim. “Contract implemented” can close a schema task; it cannot close “works on real device/provider” or “production safe” claims.

## Git Town operating boundary

```bash
bash scripts/git-town/doctor.sh
bash scripts/git-town/sync-stack.sh --dry-run
bash scripts/git-town/sync-stack.sh
ALLOW_GIT_TOWN_PUSH=1 bash scripts/git-town/sync-stack.sh --publish
```

Git Town manages branch ancestry only. An exit code of `0` does not prove implementation, provider execution, review or release. Semantic conflicts stop and preserve the worktree/receipt; Workers do not auto-run `continue`, `skip`, `undo`, `ship`, merge or promotion.

## Verify deterministic baseline

```bash
bun run check:all
```

That command validates deterministic repository contracts. It cannot promote a live lane without the exact provider/device/browser/carrier receipt named by the corresponding issue.
