# Agent Shield state machines and data-flow registry

This is the canonical human-readable transition map. It describes current repository truth and the admitted target transitions owned by issues #38–#75. It does not replace TypeScript schemas, module manifests, status JSON, provider receipts, or Git history.

Snapshot basis: `main` commit `30e020616d8a20847b197f259ff8692a1af46bde`, tree `a2c9fa53a271aaf1c9c7b2fea0cff187e16640a6`.

## State semantics

```text
SOURCE_PROPOSAL ──review──> REPOSITORY_DECISION
                                  │
                                  ▼
NOT_IMPLEMENTED ──code+tests──> NOT_EXERCISED ──exact live canary──> PASS
       │                              │                                 │
       └────────────── disagreement / failure ─────────────────────────> FAIL

required subject missing ──────────────────────────────────────────────> ABSENT
policy/conflict/stale/lease/auth/timeout/cleanup condition ───────────> BLOCKED_*
```

`PASS` is always scoped to the exact immutable subject and assertion. Cleanup, Human Admit, another provider/platform/carrier, and production remain independent.

## Repository-wide data flow

```text
source/intent
  → claim classification and repository decision
  → versioned typed contract
  → module capability and state-machine owner
  → provider/product/driver execution
  → artifact + metadata-only receipt + cleanup receipt
  → status/release projection
  → consumer/origin/canary evidence
  → Human Admit / promotion / rollback
```

Every arrow must be a typed packet, capability, immutable Git/release subject, content-addressed artifact, receipt reference, or Human decision. Private source paths, live owner state, secrets, and mutable refs are not data-flow edges.

## 1. Documentation and dependency admission

Owner: `docs/`, `third_party/`; terminal documentation issue [#37](https://github.com/ed3c/agent-shield-monorepo/issues/37).

```text
DISCOVERED → IDENTIFIED → LOCATED → CLAIM_CLASSIFIED → DECIDED
  → REQUIREMENT_LINKED → STATE_MACHINE_ASSIGNED → ISSUE/EVAL_LINKED → TRACE_CLOSED
```

Blocked states: missing source locator, unverified current claim, license/provenance gap, duplicate ID, conflicting SSOT, missing reverse link, or ungrounded completion claim.

```text
source bytes/URL/commit
  → source ID + bounded locator
  → proposal/decision/inference/live-evidence class
  → architecture/state/issue/eval mapping
```

Source `S-001` supplies the broad local/cloud/mobile/security target. Its provider versions, licenses, cost, performance, store-compliance, and security claims remain proposals until independently admitted. Its `newest`/`prefer-beta` source conflict rule is explicitly rejected for repository source authority.

## 2. Canonical contracts

Owner: `packages/contracts/`; foundations [#38](https://github.com/ed3c/agent-shield-monorepo/issues/38), [#45](https://github.com/ed3c/agent-shield-monorepo/issues/45), [#54](https://github.com/ed3c/agent-shield-monorepo/issues/54), and [#65](https://github.com/ed3c/agent-shield-monorepo/issues/65).

```text
PROPOSED → SCHEMA_DEFINED → CLOSED_VALIDATION → COMPATIBILITY_TESTED
  → INTERFACE_ADMITTED → CONSUMER_LOCKED
```

Breaking field, exit, effect, authorization, network, secret, mutation, artifact, or cleanup changes require an interface/version decision. Types never execute providers.

## 3. Document ingest

Owner: `document-ingest@1.1.0`, `services/document-ingest/`.

Current transition:

```text
REQUESTED → INPUT_VALIDATED → PROVIDER_SELECTED
  ├── local + text/plain → BYTES_READ → DIGESTED → RECEIPT_EMITTED(PASS)
  ├── local + application/pdf → NOT_IMPLEMENTED
  ├── cloud provider → NOT_IMPLEMENTED
  └── unknown/invalid input → FAIL or ABSENT for the exact missing subject
```

```text
explicit input → exact bytes → media/provider route → artifact digest → ingest receipt
```

PDF/cloud expansion requires its own provider issue; no issue is assigned by this documentation PR.

## 4. Research routing

Owner: `research-orchestrator@1.1.0`, `services/research-orchestrator/`.

```text
REQUESTED → WORKFLOW_VALIDATED → ENVIRONMENT_SELECTED → ROUTED
  ├── external-verify/raw-primary → PASS for deterministic route selection
  ├── dr-research deterministic core → contract present
  ├── signed-in DR Stage 1 → NOT_EXERCISED
  ├── local signed-in GCR → NOT_EXERCISED
  ├── cloud signed-in GCR → NOT_IMPLEMENTED
  └── unsupported workflow → ABSENT/FAIL according to request validity
```

```text
workflow + immutable artifact ref
  → raw-primary/browser policy router
  → route receipt
  → downstream provider artifact/receipt (separate evidence)
```

Routing PASS never proves source truth or browser/session execution.

## 5. Runtime fabric

Owner: `runtime-fabric@1.1.0`, `services/runtime-fabric/`; implementation stack #38–#44.

Current provider-catalog state machine:

```text
REQUESTED → PROVIDER_ID_VALIDATED → CATALOG_LOOKUP
  ├── local-disposable-worktree → isolated deterministic run → PASS
  ├── apple-container → NOT_EXERCISED
  ├── openshell-tmux-local → NOT_EXERCISED
  ├── e2b-firecracker → NOT_IMPLEMENTED
  ├── cloudflare-computer → NOT_IMPLEMENTED
  └── unknown provider → ABSENT
```

Target lifecycle owned by foundation [#38](https://github.com/ed3c/agent-shield-monorepo/issues/38):

```text
UNRESOLVED → RESOLVED → ADMISSION_CHECKED → MATERIALIZING → READY
  → RUNNING → COLLECTING → CLEANING → COMPLETED
```

Provider leaves:

- Apple Container [#39](https://github.com/ed3c/agent-shield-monorepo/issues/39)
- E2B [#40](https://github.com/ed3c/agent-shield-monorepo/issues/40)
- OpenShell [#41](https://github.com/ed3c/agent-shield-monorepo/issues/41)
- tmux/PTY [#42](https://github.com/ed3c/agent-shield-monorepo/issues/42)
- hybrid exchange/repair [#43](https://github.com/ed3c/agent-shield-monorepo/issues/43)
- aggregate registry/status/release [#44](https://github.com/ed3c/agent-shield-monorepo/issues/44)

```text
closed runtime request + immutable closure + broker refs
  → exact provider admission → fresh workspace → bounded execution
  → content-addressed artifacts → cleanup receipt → provider receipt
```

## 6. Product and mobile automation

Owner: `product-adapters@1.0.0`, `apps/`, `services/mobile-automation/`; stack #45–#53.

Current state:

```text
adapter request → catalog
  ├── Expo / Maestro / WDA / scrcpy → NOT_EXERCISED
  ├── In-App action bridge / cloud iOS → NOT_IMPLEMENTED
  └── unknown adapter → ABSENT
```

Target action state foundation [#45](https://github.com/ed3c/agent-shield-monorepo/issues/45):

```text
UNRESOLVED → ACTION_VALIDATED → AUTH_CHECKED → RISK_CHECKED → ROUTED
  → EXECUTING → OBSERVING → COMPLETED
```

Alternative/terminal states: `WAITING_FOR_HUMAN`, `WAITING_FOR_HARDWARE`, `DENIED`, `ABSENT_ADAPTER`, `NOT_IMPLEMENTED`, `NOT_EXERCISED`, `FAILED_ACTION`, `FAILED_PROVIDER`, `FAILED_OBSERVATION`, `FAILED_CLEANUP`.

```text
authenticated typed action
  → web/mobile adapter
  → optional Maestro/WDA/scrcpy target provider
  → domain/risk public port
  → view-state transition + artifact/receipt
```

Leaf owners: dashboard #46, terminal #47, Expo #48, In-App bridge #49, Maestro #50, WDA #51, scrcpy #52; aggregate #53.

## 7. Intent and security boundaries

Owner: `security-boundaries@1.0.0`, `services/intent-ledger/`, `services/security-boundaries/`; stack #54–#64.

Current intent transition:

```text
REQUESTED → CLOSED_FIELDS_VALIDATED → EVIDENCE_SORTED → DIGESTED
  ├── reference amount ≤ threshold → PASS for deterministic fixture
  └── missing fields / human-approval boundary → FAIL for exact fixture
```

Current high-risk capabilities—OPA, durable workflow, OpenBao, verified ledger/anchor, Secure Enclave, CoreNFC, MPC/TSS, smart account, bundler/paymaster, settlement—are `NOT_IMPLEMENTED`.

Target foundation [#54](https://github.com/ed3c/agent-shield-monorepo/issues/54):

```text
DRAFT → INTENT_VALIDATED → RISK_EVALUATED → ROUTED
LOW:  → SESSION_AUTHORIZED → OPERATION_PREPARED → SUBMISSION_PENDING
HIGH: → CHALLENGE_ISSUED → WAITING_FOR_HARDWARE → EVIDENCE_VERIFIED
      → SIGNING_AUTHORIZED → OPERATION_PREPARED → SUBMISSION_PENDING
```

```text
intent → OPA decision → durable workflow
  → optional Secure Enclave + NFC evidence
  → MPC/TSS signature → ledger proof
  → audited contract validation → testnet submit/confirm
  → residual-risk/Human dossier
```

Leaf owners #55–#63; aggregate adversarial/recovery convergence #64. A testnet/reference PASS never becomes production custody/mainnet/absolute-security evidence.

## 8. Bettor consumer and release integration

Owner: `bettor-consumer@1.0.0`, SDK and bettor bootstrap/verify scripts; stack #65–#75.

Current transition:

```text
SUBJECT_INPUT → repository/40-hex/tool validation
  → portable subject constructed
  → consumer lock absent/live carriers absent → NOT_EXERCISED
```

Target foundation [#65](https://github.com/ed3c/agent-shield-monorepo/issues/65):

```text
UNRESOLVED → RELEASE_PINNED → REQUIREMENTS_VALIDATED → CLOSURE_RESOLVED
  → CONFLICTS_CHECKED → SKILLS_BOUND → RUNTIME_BOUND → SURFACES_GENERATED
  → OFFLINE_VERIFIED → CANARIES/ORIGINS/EQUIVALENCE_PENDING
  → PROMOTION_PENDING → ADMITTED | ROLLED_BACK
```

```text
immutable Agent Shield release + bettor requirements
  → module closure #66
  → Skills #67 + runtime #68
  → CLI/MCP #69
  → Claude #70 + Codex #71 + GitHub #72 + Forgejo #73
  → origin equivalence #74
  → promotion/rollback #75
```

## 9. Git Town Worker and Stacked PR lifecycle

Owner: `scripts/git-town/`, `.git-town.toml`, `docs/git/`.

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
  → MERGED / REJECTED / RECOVERY_ASSIGNED
```

Blocked states include dirty/shared checkout, missing task packet, unsafe remote, wrong version/license, parent/ancestry mismatch, lease collision, timeout, prompt, semantic conflict, eval failure, push disagreement, and cleanup failure.

Current macOS evidence: parent-first rebase/publication, competing sync serialization, semantic conflict preservation, background start/repeat/status/stop, killed-controller child cleanup, and related disagreement controls have passed for the exact admitted host artifact. Linux remains `ABSENT`; upstream release attestation `NOT_EXERCISED`; Worker-image promotion `NOT_IMPLEMENTED`.

```text
issue/evals/path lease
  → isolated worktree/branch
  → git town dry-run/no-push sync
  → exact-head evals/receipts
  → optional two-guard publish
  → PR parentage
  → Human merge
```

## 10. Release/status lifecycle

Owner: `.arena/`, `data/`; phase convergence issues #44, #53, #64, #75.

```text
LEAF_RECEIPTS_PENDING → SAME_SUBJECT_VERIFIED → CAPABILITIES_RESOLVED
  → CROSS-CONTROLS_PASS → CLEANUP_PASS → STATUS_TRANSITIONS_RENDERED
  → RELEASE_BYTE_COMPARE → HUMAN_REVIEW → ADMITTED | REJECTED | ROLLED_BACK
```

A manifest proves portable bytes. A status change requires the exact owning receipt. A global HEAD move alone cannot stale or rewrite unrelated module evidence.

## Repair by data class

| Data | State/repair path | Forbidden shortcut |
|---|---|---|
| source | lease → immutable base → patch/commit → review/rebase | mtime/newest/prefer-cloud/beta |
| artifact | digest → immutable object → select by ref | mutable path overwrite |
| policy | schema/epoch → verify → staged promote/rollback | hot widen without receipt |
| OS/dependency | image/template build → exact pin/canary | copying host install state |
| DB/memory | snapshot/log/event → replay → domain invariants | hash/root alone as full restore |
| secret/key | broker/ceremony/reference | file sync/log/receipt value |
| browser/device session | execution-plane broker/lease | local↔cloud session copy |

## Update rule

A PR changing an implementation state machine must update its nearest README and this file or name why inheritance remains complete. A convergence PR updates shared status/release and the traceability index; provider leaves do not.
