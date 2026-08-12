# Traceability control plane

This directory provides forward and reverse navigation from intent/source/decision through directory/module/state machine, issue/eval, branch/PR, receipt, status/release, and Human Admit.

## State machine

```text
IDENTIFIER_DISCOVERED → OWNER_RESOLVED → FORWARD_LINKED → REVERSE_LINKED
  → SUBJECT_VERIFIED → STATE_VERIFIED → TRACE_CLOSED
```

Blocked states: duplicate or orphan ID, missing owner, stale branch/PR/receipt, ungrounded evidence state, conflicting authority, missing rollback, or one-way-only link.

## Canonical indexes

- [`TRACEABILITY_INDEX.md`](TRACEABILITY_INDEX.md) — intent/source/decision/issue/eval/status mapping.
- [`STATE_MACHINE_INDEX.md`](STATE_MACHINE_INDEX.md) — directory/module/current state/data flow/terminal issue/eval/receipt mapping.
- [`DOCUMENTATION_CONVERGENCE.md`](DOCUMENTATION_CONVERGENCE.md) — exact prior documentation-stack merge evidence and handoff.

## Data flow

```text
intent/source/decision
  ↔ directory/module/state-machine
  ↔ issue/eval/path lease
  ↔ branch/PR/exact subject
  ↔ receipt/status/release
  ↔ Human Admit/rollback
```

## Rules

1. Forward and reverse links are both required.
2. Planned issue/branch/receipt is never shown as merged/exercised evidence.
3. Current evidence comes from exact implementation/manifests/status/receipts; source proposals remain labeled.
4. One provider/platform/carrier/origin cannot proxy another.
5. Convergence issues update aggregate indexes and shared state; leaves update only their owned rows/receipts.
6. Secrets, host paths, session values, and private reasoning never enter trace records.

Issue [#37](https://github.com/ed3c/agent-shield-monorepo/issues/37) adds the state-machine and Phase 3–6 implementation index without changing product/provider states.
