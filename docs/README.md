# Documentation control plane

`docs/` turns source material, repository decisions, current module truth, state machines, implementation issues, evals, and receipts into Agent-readable routing. Documentation is not execution evidence.

## Directory state machine

```text
SOURCE_CAPTURED
  → CLAIM_CLASSIFIED
  → DECISION_RECORDED
  → REQUIREMENT_INDEXED
  → STATE_MACHINE_ASSIGNED
  → EVALS_DESIGNED
  → ISSUE_ADMITTED
  → IMPLEMENTATION/RECEIPT_LINKED
  → TRACE_CLOSED
```

Blocked states include missing source locator, conflicting authority, duplicate/orphan ID, ungrounded `PASS`, missing issue/eval/path owner, stale Git/PR identity, or unresolved reverse link.

## Data flow and ownership

| Directory | Owns | Emits |
|---|---|---|
| `intent/` | product north star and constraints | intent IDs/requirements |
| `sources/` | source identity, locators, source-derived claims | source IDs and claim classifications |
| `decisions/` | repository decisions and rationale | decision IDs |
| `architecture/` | current/target planes and data flows | reviewed architecture references |
| `state-machines/` | canonical transition/data-flow routing | state-machine IDs and current-state map |
| `implementation/` | molecular issue and Stack PR DAG | issue/branch/base/path/eval ownership |
| `harness/`, `evals/` | evidence and disagreement contracts | eval IDs/receipt requirements |
| `git/` | Git Town/Worker governance | branch/worktree/receipt protocol |
| `licensing/` | external dependency admission policy | dependency-review states |
| `traceability/` | forward and reverse indexes | source→state→issue→eval→receipt links |

```text
source/intent
  → architecture/decision
  → state machine and data flow
  → molecular issue/eval/path lease
  → branch/PR/receipt
  → status/release/Human Admit
```

## Rules

1. State whether content is `SOURCE_PROPOSAL`, `REPOSITORY_DECISION`, `INFERENCE`, or `LIVE_EVIDENCE`.
2. Link stable IDs rather than copying long source transcripts.
3. Keep current implementation separate from planned target states.
4. Do not convert architecture, package, license, hash, or another platform/provider result into `PASS`.
5. Add/update the nearest README and state-machine index when a directory or public boundary changes.
6. Every implementation issue has a state machine, data flow, positive eval, disagreement control, cleanup, evidence boundary, rollback, and Human owner.
7. Update [`INDEX.md`](INDEX.md) and [`traceability/STATE_MACHINE_INDEX.md`](traceability/STATE_MACHINE_INDEX.md) when a canonical owner or terminal issue changes.

## Entry points

- [`INDEX.md`](INDEX.md)
- [`state-machines/README.md`](state-machines/README.md)
- [`implementation/STACKED_IMPLEMENTATION_PLAN.md`](implementation/STACKED_IMPLEMENTATION_PLAN.md)
- [`traceability/STATE_MACHINE_INDEX.md`](traceability/STATE_MACHINE_INDEX.md)
- [`sources/SOURCE_LEDGER.md`](sources/SOURCE_LEDGER.md)
- [`harness/README.md`](harness/README.md)
- [`git/README.md`](git/README.md)

Issue [#37](https://github.com/ed3c/agent-shield-monorepo/issues/37) owns this documentation-only state-machine/implementation index update.
