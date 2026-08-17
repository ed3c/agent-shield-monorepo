# Shadow Architect convergence monitor

Audit issue: #135. Baseline `main`: `e54065eb7b4555e9d9cdacb6e76c4e353d5a06c8`.

This is the Tech Lead control plane for deciding whether source-proposed problems are actually closed. A merged issue or deterministic test is not automatically live evidence or release admission.

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

Authorities: `docs/sources/SOURCE_LEDGER.md`, `data/status/integration.json`, `data/releases/agent-shield-module-set.json`, exact issue/PR/commit receipts.

## Current finding

Phase 3–6 deterministic leaves and deterministic convergence verifiers are merged, but the repository remains post-deterministic / pre-live-convergence. Current machine status still has only three PASS lanes: local text ingest, external-verify research routing, and local disposable runtime. The portable release still has `live_state: NOT_EXERCISED`.

| Real problem | Deterministic state | Remaining real-world gap | Owner |
|---|---|---|---|
| Runtime/E2B/OpenShell/tmux | contracts/verifiers merged | admitted provider execution, DNS/egress/cleanup | #95 -> #44 |
| Mobile/automation | contracts/convergence merged | Expo/Maestro/WDA/scrcpy/In-App live receipts | #136 -> #53 |
| Hardware/MPC/account/testnet | contracts/convergence merged | native hardware, quorum, deployment, testnet receipts | #137 -> #64 |
| bettor external consumer | closure/binding/origin contracts merged | Claude/Codex/origin/bootstrap live receipts | #138 -> #75 |
| PDF + signed-in research | partial deterministic routes | PDF/cloud/browser live execution | #139 |
| merge safety | CI runs | required exact-head merge gate | #140 |

## Monitor state machine

```text
SNAPSHOT_STALE
-> SUBJECTS_REBOUND
-> ISSUE_GRAPH_RECONCILED
-> SOURCE_GAPS_CLASSIFIED
-> DIRECTORY_OWNERS_VERIFIED
-> DAG_REBUILT
-> LIVE_GAPS_ISSUED
-> TRACE_RENDERED
-> HUMAN_REVIEW
```

Blocked: `MISSING_AUTHORITY`, `STALE_RECEIPT`, `PATH_LEASE_CONFLICT`, `UNOWNED_LIVE_GAP`, `EVIDENCE_OVERCLAIM`, `SOURCE_CLAIM_WITHOUT_DECISION`, `CONVERGENCE_WITHOUT_CHILD_RECEIPTS`.

## Post-convergence DAG

```text
main
├── #95 LIVE-NET -> provider siblings -> #44
├── #136 LIVE-UX -> Expo | Maestro | WDA | scrcpy | In-App -> #53
├── #137 LIVE-SEC -> Secure Enclave | CoreNFC | MPC/TSS | account | testnet -> #64
├── #138 LIVE-INT -> Claude | Codex | GitHub | Forgejo | bettor bootstrap -> #75
├── #139 source closure -> PDF | cloud docs | signed-in browser | cloud GCR
└── #140 required-check merge gate
```

Sibling lanes are molecular Stack PRs with disjoint provider-private paths. Shared status, release, public registries, aggregate trace indexes, and Human dossiers remain convergence-owned.

## Required data-flow trace

```text
source/intent
-> issue + path lease
-> immutable implementation subject
-> deterministic receipt
-> exact provider/device/carrier/environment
-> live operation
-> bounded artifact/observation receipt
-> independent cleanup/residue receipt
-> convergence comparison
-> status/release projection
-> Human Admit / rollback
```

An orphan edge is an incomplete capability.

## Tech Lead review questions

1. Does executable code exist, or only a contract/proposal?
2. Did each negative control demonstrably turn red?
3. Was the real provider/device/browser/carrier invoked?
4. Is the receipt bound to exact version/image/policy/commit/environment?
5. Can another platform/provider/session substitute without failure?
6. Is cleanup independently observed?
7. Is status derived from receipts rather than prose?
8. Is rollback bound to the exact prior subject?
9. Is Human Admit explicit and non-forgeable?
10. Are source claims about version/license/cost/performance/security still unresolved?

A deterministic verifier at `HUMAN_REVIEW` is implementation-complete for that verifier, not live-complete and not release-complete.