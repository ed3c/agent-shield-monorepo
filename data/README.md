# Repository status and release projections

`data/` stores checked-in status and deterministic portable release projections. It does not store live provider workspaces, user documents, secrets, sessions, mutable caches, production databases, or raw environment receipts.

## State machine

```text
LEAF_RECEIPTS_PENDING → SAME_SUBJECT VERIFIED → STATE TRANSITIONS REVIEWED
  → STATUS_RENDERED → RELEASE_RENDERED → BYTE_COMPARE
  → HUMAN_REVIEW → ADMITTED | REJECTED | ROLLED_BACK
```

## Data flow

```text
module manifests/contracts + exact leaf receipts
  → convergence matrix and disagreement controls
  → `status/integration.json`
  → `releases/agent-shield-module-set.json`
  → consumer/Human review
```

## Ownership

- `status/` preserves current named evidence states.
- `releases/` binds portable module/interface/contract bytes.
- Runtime/provider/carrier/origin receipts stay in their governed evidence store and are referenced by digest/subject, not copied ad hoc here.
- Phase convergence issues #44, #53, #64, and #75 own relevant shared changes.

A release manifest is not a live provider receipt. No credential/profile/device/key/host path/temp artifact. Schema/state change requires eval-first issue, compatibility/migration analysis, disagreement control, cleanup/rollback and Human review.
