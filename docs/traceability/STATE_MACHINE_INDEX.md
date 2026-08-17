# Directory, state-machine, issue, eval, and receipt index

Audit basis: #135 on `main@e54065eb7b4555e9d9cdacb6e76c4e353d5a06c8`. Rebind status/release/issues when `main` moves.

## Directory -> State Machine -> data flow -> DAG

| Directory | Owner | Data flow | Current evidence | Live owner -> convergence |
|---|---|---|---|---|
| `docs/`, `third_party/` | provenance/admission | source -> decision -> issue/evidence | source ledger | #135/#139 |
| `packages/contracts/` | typed contracts | packet -> validation -> state/receipt | Phase 3–6 deterministic foundations merged | phase convergence |
| `.arena/`, `data/` | release projection | manifests + receipts -> status/release | release 0.1.0; live not exercised | #44/#53/#64/#75 |
| `services/document-ingest/` | ingest | bytes -> provider -> artifact/digest receipt | local text PASS | #139 |
| `services/research-orchestrator/` | research route | workflow -> route/provider -> evidence | external-verify PASS | #139 |
| `services/runtime-fabric/` | runtime lifecycle | request -> provider/policy/PTY -> artifact -> cleanup | deterministic Phase 3 merged; local disposable PASS | #95 -> #44 |
| `apps/`, `services/mobile-automation/` | product/QA | action -> build/device/provider -> observation -> cleanup | deterministic Phase 4 merged | #136 -> #53 |
| `services/intent-ledger/`, `services/security-boundaries/` | security | intent -> risk/policy -> hardware/crypto/ledger/chain -> revocation | deterministic Phase 5 merged | #137 -> #64 |
| `packages/agent-shield-sdk/`, integration scripts | consumer | release -> bindings/MCP -> carriers/origins -> equivalence -> cleanup | deterministic Phase 6 merged | #138 -> #75 |
| `scripts/git-town/` | Worker/Stack | packet -> worktree/lease -> sync -> eval -> publish -> PR | macOS wrapper evidence | Human merge |
| `.github/` | CI/review | PR head -> checks -> review -> merge | checks run; enforcement gap | #140 |

## Deterministic implementation history

```text
Runtime:  #38 -> #39/#40/#41/#42/#43 -> #44
Product:  #45 -> #46/#47/#48(#49)/#50/#51/#52 -> #53
Security: #54 -> #55/#56/#57/#58/#59/#60/#61/#62(#63) -> #64
Consumer: #65 -> #66 -> #67/#68 -> #69 -> #70/#71/#72/#73 -> #74 -> #75
```

These issue chains prove implementation history where their exact receipts say so. They do not imply live environment execution.

## Post-deterministic molecular live index

| Issue | Sibling leaves | Exact subject | Convergence |
|---|---|---|---|
| #95 | local runtime provider; cloud runtime provider | provider/version/image/policy/workload/network | #44 |
| #136 | Expo; Maestro; WDA; scrcpy; In-App | app build + simulator/device/provider/action contract | #53 |
| #137 | Secure Enclave; CoreNFC; MPC/TSS; account; testnet | hardware/card/quorum/bytecode/chain | #64 |
| #138 | Claude; Codex; GitHub; Forgejo; bettor bootstrap | immutable release + carrier/origin/binding | #75 |
| #139 | PDF local; document cloud; signed-in browser; GCR cloud | parser/provider/browser/cloud | source closure |
| #140 | repository rule | GitHub ruleset + required exact-head checks | Human merge |
| #135 | docs/control plane | exact main/status/release/issue graph | Human review |

## Live leaf state machine

```text
SUBJECT_ABSENT
-> SUBJECT_PINNED
-> POLICY/CONTRACT_BOUND
-> LIVE_SESSION_READY
-> OPERATION_EXECUTED
-> OBSERVATION_CAPTURED
-> CLEANUP_CHECKED
-> RECEIPT_READY
-> HUMAN_REVIEW
```

Provider-specific blocked outcomes must keep absence, policy denial, execution failure, observation mismatch and cleanup failure separate.

## Convergence state machine

```text
CHILDREN_PENDING
-> SUBJECTS_PINNED
-> COMPATIBILITY_RESOLVED
-> CROSS_CHILD_CONTROLS
-> CLEANUP/ROLLBACK_CHECKED
-> STATUS_RELEASE_RENDERED
-> HUMAN_REVIEW
-> ADMITTED | HUMAN_REJECTED
```

## Required trace chain

```text
source/intent/decision
<-> directory/module/state-machine
<-> issue/eval/path lease
<-> branch/PR/exact head
<-> provider/device/carrier/origin receipt
<-> cleanup/residue receipt
<-> status/release/lock digest
<-> Human Admit / rollback subject
```

An orphan is incomplete traceability.

## Disagreement rules

Closed leaf != live PASS. Deterministic convergence != ADMITTED. Simulator != physical device. Testnet != mainnet. Compile != deployed execution. CLI/package presence != model turn. GitHub != Forgejo. Local != cloud. Source claim != current version/license/cost/performance/security evidence. Green optional CI != enforced merge gate.
