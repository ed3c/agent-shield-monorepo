# Molecular implementation and Git Town Stack PR plan

This document maps implementation and live-evidence issues to intended branch ancestry, path ownership, parallel groups, eval families, and convergence owners. Issue bodies remain task contracts; Git commit/tree, exact environment subject and PR base remain execution truth.

## Common Worker protocol

```text
issue + exact parent + path lease + eval/control set
  -> isolated linked worktree and writer lease
  -> foundation/leaf/convergence branch
  -> dry-run Git Town sync
  -> implementation/execution within owned paths
  -> positive and disagreement evals
  -> local no-push sync
  -> optional two-guard publication
  -> PR with exact parent
  -> Human review/merge
```

```bash
bash scripts/git-town/doctor.sh
bash scripts/git-town/sync-stack.sh --dry-run
bash scripts/git-town/sync-stack.sh
ALLOW_GIT_TOWN_PUSH=1 bash scripts/git-town/sync-stack.sh --publish
```

A semantic conflict stops the Worker. No automated `continue`, `skip`, `undo`, `ship`, merge, promotion, or semantic edit.

## Deterministic Phase 3–6 history

```text
Phase 3 runtime
main -> #38
      -> #39 Apple | #40 E2B | #41 OpenShell | #42 tmux | #43 exchange
      -> #44 runtime convergence

Phase 4 product
main -> #45
      -> #46 dashboard | #47 terminal | #48 Expo -> #49 In-App
      -> #50 Maestro | #51 WDA | #52 scrcpy
      -> #53 product convergence

Phase 5 security
main -> #54
      -> #55 OPA | #56 workflow | #57 broker | #58 ledger
      -> #59 Secure Enclave | #60 CoreNFC | #61 MPC/TSS
      -> #62 smart account -> #63 testnet
      -> #64 security convergence

Phase 6 consumer
main -> #65 -> #66 -> #67 Skills / #68 runtime -> #69 CLI/MCP
      -> #70 Claude | #71 Codex | #72 GitHub | #73 Forgejo
      -> #74 equivalence -> #75 release convergence
```

These chains are deterministic implementation history. Their merged state does not prove real provider/device/browser/hardware/carrier execution.

## Post-deterministic / live-convergence stacks

Shadow Architect issue #135 identified the remaining real-world work. These stacks are environment-owned and must not be collapsed back into deterministic leaves.

### Runtime live network — #95 -> #44

```text
main
└── live/runtime-egress                         #95 umbrella
    ├── live/runtime-local-provider             exact admitted local provider
    └── live/runtime-cloud-provider             exact admitted cloud provider
        └── convergence/runtime                 #44 Human Admit
```

Each leaf owns provider-private canary/receipt paths only. It binds provider/version/image/policy/workload/network subject, DNS/IP enforcement, proxy/default-deny, timeout/cancellation, and independent cleanup.

### Product/mobile live matrix — #136 -> #53

```text
main
└── live/ux                                     #136 umbrella
    ├── live/ux-expo-device
    ├── live/ux-maestro
    ├── live/ux-wda-ios
    ├── live/ux-scrcpy-android
    └── live/ux-in-app-bridge
        └── convergence/product                 #53 Human Admit
```

Simulator, physical device, iOS and Android are separate evidence lanes. No leaf owns shared status/release projection.

### Security/hardware/testnet live matrix — #137 -> #64

```text
main
└── live/security                               #137 umbrella
    ├── live/sec-secure-enclave
    ├── live/sec-corenfc
    ├── live/sec-mpc-tss
    ├── live/sec-smart-account
    └── live/sec-testnet-settlement
        └── convergence/security                #64 Human Admit
```

Hardware-backed key evidence, NFC possession, threshold quorum/custody, deployed contract execution and chain submission/inclusion/confirmation are independent receipts. Testnet never proxies mainnet.

### External consumer/origin live matrix — #138 -> #75

```text
main
└── live/integration                            #138 umbrella
    ├── live/int-claude-code
    ├── live/int-codex-cli
    ├── live/int-github-origin
    ├── live/int-forgejo-origin
    └── live/int-bettor-bootstrap
        └── convergence/release                 #75 Human Admit / rollback
```

Model carriers and origins are sibling arrivals. A Claude receipt cannot proxy Codex; GitHub cannot proxy Forgejo; local editable checkout cannot proxy immutable release identity.

### Source closure outside Phase 3–6 — #139

```text
main
└── live/source-closure                         #139
    ├── live/doc-pdf-local
    ├── live/doc-cloud-provider
    ├── live/research-signed-in-browser
    └── live/research-gcr-cloud
```

These close real source-ledger gaps that were not owned by the Phase 3–6 convergence tree.

### Repository merge gate — #140

```text
main
└── governance/required-merge-gate              #140
```

This proves exact-head checks are enforced, not merely configured to run. It changes governance evidence only, never product/provider PASS.

## Branch and path-lease law

For every molecular live leaf:

```text
one issue
+ one exact parent
+ one provider-private writable path lease
+ one immutable environment/provider/device/carrier/origin subject
+ one positive/negative eval family
+ one cleanup/residue receipt
= one Worker branch
```

Do not combine local+cloud, iOS+Android, simulator+physical device, Claude+Codex, GitHub+Forgejo, hardware+chain, or provider-private+shared-status writes unless the issue proves a real data dependency and grants the shared lease.

## Convergence ownership

Only the convergence issue may normally mutate:

```text
public provider/action registry
module manifest/interface version
shared public export index
consumer lock/projections
data/status/integration.json
data/releases/agent-shield-module-set.json
aggregate README/trace indexes
Human dossier
promotion/rollback receipts
```

A convergence branch begins only after selected child receipts are present on the exact admitted base. It may aggregate `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, or `NOT_EXERCISED`; it may never manufacture a stronger child state.

## Cross-phase dependency rule

A live leaf may pin a public interface from an earlier deterministic/admitted subject. It must never import an unmerged sibling's private source or use an issue number as release identity. Pin exact interface/release/receipt subjects.

## Required PR body

Every implementation/live PR includes:

```text
issue/epic/convergence and Stack graph
base/parent/head and exact subjects
provider/device/browser/carrier/origin subject when live
path lease and exclusions
state-machine transitions exercised
inputs/outputs/artifacts/receipts
evals and disagreement controls
exact-head results and independent cleanup
current and changed evidence states
remaining gaps and residual risks
rollback subject and Human-owned next action
```

## Completion rule

A phase is not complete because all PRs exist or deterministic convergence is merged. The convergence issue must prove compatible same-subject live receipts where required, cross-leaf negative controls, cleanup, deterministic status/release rendering, rollback, and explicit Human Admit. Source-level claims requiring real execution remain open until their live issue reaches that rung.
