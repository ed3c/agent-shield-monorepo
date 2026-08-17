# Git Town Bash operators and Worker state machine

These scripts implement bounded Git management for unattended Worker Agents. They do not implement Agent Shield products or providers.

## Worker lifecycle

```text
TASK_PACKET_ABSENT
  → PACKET_VALIDATED
  → LINKED_WORKTREE_CREATED
  → BRANCH/PATH/REPOSITORY_LEASED
  → DOCTOR_PASS
  → DRY_RUN_PASS
  → LOCAL_SYNCED
  → EVALS_PASS
  → OPTIONAL_GUARDED_PUBLICATION
  → PR_PROPOSED
  → HUMAN_REVIEW
  → MERGED | REJECTED | RECOVERY_ASSIGNED
```

Blocked outcomes: dirty/shared worktree, missing task/eval/path metadata, unsafe/credential-bearing origin, wrong Git Town/license/artifact, parent/ancestry mismatch, lease collision, prompt, timeout, semantic conflict, eval failure, push disagreement, stale PID/PGID/run token, or cleanup residue.

## Entry points

| Script | Transition | Mutation |
|---|---|---|
| `doctor.sh` | packet/worktree/tool/config → `DOCTOR_PASS` or blocked | none |
| `worktree.sh` | admitted packet → linked worktree/branch/lease | local; optional guarded push |
| `new-branch.sh` | exact parent → root/child feature branch | local; optional guarded push |
| `sync-stack.sh` | dry-run/local sync/guarded publish | ancestry; remote only in publish mode |
| `background-sync.sh` | bounded repeated sync + process ownership | same selected sync mode |
| `propose.sh` | direct parent + eval-first PR body → PR metadata | GitHub PR metadata |
| `selftest.sh` | static and disposable positive/negative controls | temporary fixtures only |
| `integration-selftest.sh` | exact live wrapper package | disposable Git/remote/worktree/process subjects |
| `common.sh` | validation, lease, hashing, receipt primitives | internal library |

## Data flow

```text
issue/Worker + branch/parent + evals/path lease
  → host-owned task packet and isolated worktree
  → exact Git Town 24.0.0/config
  → dry-run/no-push rebase
  → eval/control and bounded log digests
  → optional `ALLOW_GIT_TOWN_PUSH=1` guarded publication
  → exact PR base/head
  → Human merge
```

## Current evidence

- macOS arm64 exact artifact admitted; executable bytes host-owned and not distributed;
- parent-first rebase/publication, stale-remote refusal, proposal parentage, competing sync serialization, semantic-conflict preservation, background lifecycle, killed-controller process-group cleanup, and secret-residue controls passed for the exact admitted host subject;
- Linux exact environment is `ABSENT`;
- upstream release-attestation verification is `NOT_EXERCISED`;
- promoted Worker image is `NOT_IMPLEMENTED`.

Static checks or macOS success cannot proxy missing lanes. Sync exit `0` cannot proxy implementation/review/release/production PASS.

## Molecular implementation use

Use [`../../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](../../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md) and [`../../docs/architecture/SHADOW_ARCHITECT_MONITOR.md`](../../docs/architecture/SHADOW_ARCHITECT_MONITOR.md). Each Worker gets one issue/branch/worktree/path lease. Foundations serialize shared contracts; independent leaves are siblings; convergence starts from exact merged `main` and owns shared registry/status/release.

## Post-convergence molecular Stack PR index

The original Phase 3–6 deterministic stacks are largely merged. Remaining work must be decomposed by **real environment/provider subject**, not by re-opening deterministic leaves.

```text
main
├── live/runtime-egress                         #95
│   ├── live/runtime-local-provider            sibling
│   └── live/runtime-cloud-provider            sibling
│       └── convergence/runtime                #44
├── live/ux                                     #136 umbrella
│   ├── live/ux-expo-device
│   ├── live/ux-maestro
│   ├── live/ux-wda-ios
│   ├── live/ux-scrcpy-android
│   └── live/ux-in-app-bridge
│       └── convergence/product                #53
├── live/security                               #137 umbrella
│   ├── live/sec-secure-enclave
│   ├── live/sec-corenfc
│   ├── live/sec-mpc-tss
│   ├── live/sec-smart-account
│   └── live/sec-testnet-settlement
│       └── convergence/security               #64
├── live/integration                            #138 umbrella
│   ├── live/int-claude-code
│   ├── live/int-codex-cli
│   ├── live/int-github-origin
│   ├── live/int-forgejo-origin
│   └── live/int-bettor-bootstrap
│       └── convergence/release                #75
├── live/source-closure                         #139
│   ├── live/doc-pdf-local
│   ├── live/doc-cloud-provider
│   ├── live/research-signed-in-browser
│   └── live/research-gcr-cloud
└── governance/required-merge-gate              #140
```

### Worker branch law

For every molecular leaf:

```text
one issue
+ one exact parent
+ one provider-private path lease
+ one immutable environment/provider/device/carrier subject
+ one eval/control family
+ one cleanup receipt
= one Worker branch
```

Do not combine iOS+Android, Claude+Codex, GitHub+Forgejo, local+cloud, simulator+physical device, hardware+chain, or provider-private+shared-status work in one leaf PR unless an explicit issue proves the data dependency and grants the shared lease.

### Convergence branch law

A convergence branch may begin only after every selected child receipt is on the exact admitted base. It owns shared public registries, module/interface promotion, `data/status/integration.json`, release restamps, aggregate indexes, Human dossier and rollback subject. It must not manufacture a PASS for a child that remains `ABSENT`, `NOT_IMPLEMENTED`, or `NOT_EXERCISED`.

## Failure/Human rule

Scripts never run semantic conflict edits, `git town continue`, `skip`, `undo`, `ship`, merge, permission widening, legal acceptance, release promotion, destructive rollback, or production operation. A blocked worktree/receipt is preserved for an assigned recovery owner.
