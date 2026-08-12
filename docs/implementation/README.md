# Implementation control plane

`docs/implementation/` owns the issue/branch/path/eval decomposition for code and live-provider work. It does not implement providers and does not replace the issue body or Git history.

## Admission state machine

```text
IDEA/SOURCE_PROPOSAL
  → FOUNDATION_ISSUE_CREATED
  → LEAF_ISSUES_CREATED
  → EVALS_AND_CONTROLS_REVIEWED
  → PATH_LEASES_PROVEN_DISJOINT
  → FOUNDATION_MERGED
  → LEAF_WORKERS_ACTIVE
  → LEAVES_MERGED
  → CONVERGENCE_ACTIVE
  → HUMAN_ADMIT
  → PHASE_ADMITTED | PHASE_REJECTED | ROLLED_BACK
```

## Rules

1. A foundation owns shared contracts and transition vocabulary, not provider code.
2. Independent provider/product/platform/origin work is sibling work with disjoint writable paths.
3. A child branch exists only for a real interface/data dependency.
4. One convergence issue owns public aggregation: registry/index exports, module/interface promotion, `data/status/integration.json`, release manifest, cross-leaf controls, and Human dossier.
5. Every issue names state machine, data flow, path lease, evals, disagreement controls, evidence boundary, cleanup, rollback, and Human-owned operations before implementation.
6. Git Town synchronizes one Worker's declared stack in an isolated worktree; it does not merge siblings or resolve semantics.
7. A phase does not close while a mandatory leaf is absent/stale/failed/blocked, unless the convergence issue explicitly excludes it and Human Admit accepts the reduced capability.

## Current phase graph

The complete Phase 3–6 DAG is [`STACKED_IMPLEMENTATION_PLAN.md`](STACKED_IMPLEMENTATION_PLAN.md). Current code/product/provider states are indexed in [`../state-machines/README.md`](../state-machines/README.md).

## Data flow

```text
state-machine requirement
  → eval-first issue
  → branch/parent/path lease
  → isolated Worker implementation
  → leaf receipt
  → convergence matrix
  → status/release projection
  → Human Admit
```

Issue [#37](https://github.com/ed3c/agent-shield-monorepo/issues/37) created the terminal issues and owns only this documentation/index layer.
