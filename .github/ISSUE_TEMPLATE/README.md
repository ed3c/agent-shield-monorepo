# Issue intake contract

Every implementation issue is a state-machine work packet before code begins.

## Intake state machine

```text
GOAL_NAMED → NON_GOALS_NAMED → PARENT/STACK_NAMED → PATH_LEASE_NAMED
  → STATE_MACHINE/DATA_FLOW_NAMED → EVALS/CONTROLS_NAMED
  → CLEANUP/ROLLBACK/HUMAN_BOUNDARY_NAMED → READY
```

Missing field, cyclic dependency, overlapping sibling path, wrong convergence owner, ungrounded evidence transition, or unresolved placeholder is `BLOCKED_TASK_PACKET`.

Required data includes exact parent/head intent, module/interface/capability, current/allowed/terminal states, inputs/outputs/artifacts/receipts, positive assertions, disagreement controls, evidence boundary, cleanup, rollback, and Human-owned operations.

The canonical Phase 3–6 issue DAG is [`../../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](../../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md). A template is intake metadata, not implementation or evidence.
