# Molecular implementation and Git Town Stack PR plan

This document maps open implementation issues to intended branch ancestry, path ownership, parallel groups, eval families, and convergence owners. The issue body remains the task contract; Git commit/tree and PR base remain execution truth.

## Common Worker protocol

```text
issue + exact parent + path lease + eval/control set
  → isolated linked worktree and writer lease
  → foundation/leaf/convergence branch
  → dry-run Git Town sync
  → implementation within owned paths
  → positive and disagreement evals
  → local no-push sync
  → optional two-guard publication
  → PR with exact parent
  → Human review/merge
```

Default commands:

```bash
bash scripts/git-town/doctor.sh
bash scripts/git-town/sync-stack.sh --dry-run
bash scripts/git-town/sync-stack.sh
ALLOW_GIT_TOWN_PUSH=1 bash scripts/git-town/sync-stack.sh --publish
```

A semantic conflict stops the Worker. No automated `continue`, `skip`, `undo`, `ship`, merge, or semantic edit.

## Phase 3 — Runtime fabric

```text
main
└── feat/p3-runtime-spi                         #38 RT-FND
    ├── feat/p3-apple-container                 #39 RT-APPLE
    ├── feat/p3-e2b-runtime                     #40 RT-E2B
    ├── feat/p3-openshell-policy                #41 RT-OS
    ├── feat/p3-tmux-pty                        #42 RT-TMUX
    └── feat/p3-hybrid-exchange                 #43 RT-XCHG

main after #38–#43
└── feat/p3-runtime-convergence                 #44 RT-CONV
```

| Issue | Owner paths | Parallel after | Aggregate owner |
|---|---|---|---|
| #38 | runtime contracts/SPI/state machine | documentation #37 | #44 |
| #39 | Apple Container provider private root | #40–#43 | #44 |
| #40 | E2B provider private root | #39/#41–#43 | #44 |
| #41 | OpenShell policy provider | #39/#40/#42/#43 | #44 |
| #42 | tmux/PTY provider | #39–#41/#43 | #44 |
| #43 | exchange/repair contracts and private engine | #39–#42 | #44 |
| #44 | public runtime registry, module/status/release, aggregate tests | none | Human Admit |

## Phase 4 — Product and mobile automation

```text
main
└── feat/p4-product-contracts                   #45 UX-FND
    ├── feat/p4-dashboard-genui                 #46 UX-WEB
    ├── feat/p4-terminal-projection             #47 UX-TERM
    ├── feat/p4-expo-mobile                     #48 UX-EXPO
    │   └── feat/p4-in-app-action-bridge        #49 UX-BRIDGE
    ├── feat/p4-maestro-mcp                     #50 QA-MAESTRO
    ├── feat/p4-wda-ios-projection              #51 QA-WDA
    └── feat/p4-scrcpy-android-projection       #52 QA-SCRCPY

main after #45–#52
└── feat/p4-product-convergence                 #53 UX-CONV
```

`#49` is a real child of `#48` because it changes the shipped app runtime surface. Dashboard, terminal, Maestro, WDA, and scrcpy are siblings; they may consume one another only through public target/action contracts. `#53` owns the product module/index/status/release aggregation.

## Phase 5 — Security, hardware, and testnet settlement

```text
main
└── feat/p5-security-contracts                  #54 SEC-FND
    ├── feat/p5-opa-policy                      #55 SEC-OPA
    ├── feat/p5-durable-workflow                #56 SEC-WF
    ├── feat/p5-openbao-broker                  #57 SEC-BAO
    ├── feat/p5-verified-ledger                 #58 SEC-LEDGER
    ├── feat/p5-secure-enclave                  #59 SEC-SE
    ├── feat/p5-corenfc-challenge               #60 SEC-NFC
    ├── feat/p5-mpc-tss-provider                #61 SEC-TSS
    └── feat/p5-smart-account-contracts         #62 SEC-AA
        └── feat/p5-testnet-submission          #63 SEC-CHAIN

main after #54–#63
└── feat/p5-security-convergence                #64 SEC-CONV
```

Provider leaves are intentionally separate because policy, durable workflow, secret brokerage, ledger recovery, device hardware, card protocol, threshold cryptography, contract bytecode, and chain submission require independent evidence and reviewers. `#63` depends on exact contract artifacts from `#62`. `#64` owns the end-to-end reference/testnet adversarial package, shared status/release, residual-risk dossier, and Human Admit.

## Phase 6 — bettor-arena reference consumer

```text
main
└── feat/p6-consumer-contracts                  #65 INT-FND
    └── feat/p6-module-closure                  #66 INT-CLOSURE
        ├── feat/p6-skills-binding              #67 INT-SKILL
        └── feat/p6-runtime-binding             #68 INT-RUNTIME

serialized admitted #66–#68 integration subject
└── feat/p6-cli-mcp-parity                      #69 INT-MCP
    ├── feat/p6-claude-canary                   #70 INT-CLAUDE
    ├── feat/p6-codex-canary                    #71 INT-CODEX
    ├── feat/p6-github-origin                   #72 INT-GH
    └── feat/p6-forgejo-origin                  #73 INT-FJ

main after #72+#73
└── feat/p6-origin-equivalence                  #74 INT-EQ

main after #65–#74
└── feat/p6-reference-composition-release       #75 INT-REL
```

`#67` and `#68` are parallel after the selected module closure is immutable. `#69` serializes their lock fragments into one CLI/MCP subject. Claude, Codex, GitHub, and Forgejo canaries are independent sibling arrivals. `#74` requires both origin receipts. `#75` is the sole promotion/rollback owner.

## Cross-phase dependency rule

Phases are independently decomposed but a leaf may pin a public interface from an earlier admitted phase. It must never import an unmerged sibling's private source or treat an issue number as an immutable dependency. Pin the exact interface/release subject in the task packet.

Examples:

- product/provider canaries may consume the public runtime SPI/receipts from Phase 3;
- security UI actions consume the product action contract, not product private code;
- Phase 6 may integrate current modules even while optional providers remain named gaps, but cannot promote a capability lacking its required receipt.

## Shared-path serialization

The following paths are normally convergence-owned:

```text
public provider/action registry index
module manifest/interface version
shared package public export index
consumer composition lock/projections
data/status/integration.json
data/releases/agent-shield-module-set.json
aggregate README/trace indexes
promotion/rollback receipts
```

A leaf needing one of these paths must either defer it to convergence or obtain an explicit exclusive slice and restate sibling impact.

## Required PR body

Every implementation PR includes:

```text
issue/epic and Stack graph
base/parent/head and exact subjects
path lease and named exclusions
state-machine transitions exercised
data-flow inputs/outputs/artifacts/receipts
evals and disagreement controls designed before code
exact-head results and cleanup
current and changed evidence states
remaining gaps and residual risks
rollback subject and Human-owned next action
```

## Completion rule

A phase is not complete because all PRs exist. The convergence issue must prove compatible same-subject receipts, cross-leaf negative controls, cleanup, deterministic status/release rendering, rollback, and explicit Human Admit.
