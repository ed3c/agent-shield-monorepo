# Arena module and composition control plane

`.arena/` contains authored module manifests and consumer requirements plus generated immutable selection metadata. It is not runtime state, a secret store, or live-provider evidence.

## State machine

```text
MANIFEST_PROPOSED → SCHEMA_VALIDATED → ROOTS/OWNERSHIP_CHECKED
  → CAPABILITIES_RESOLVED → INTERFACES_CHECKED → REQUIREMENTS_RESOLVED
  → LOCK_RENDERED → PROOF SUBJECTS VERIFIED → RELEASE_RENDERED
  → HUMAN_REVIEW → ADMITTED | REJECTED | ROLLED_BACK
```

Blocked states include missing module/component/capability, duplicate provider, path overlap/orphan, dependency cycle, interface conflict, mutable/stale digest, Skill/runtime conflict, stale proof, or unreceipted state promotion.

## Data flow

```text
module manifests + component requirements
  → capability/dependency/ownership resolver
  → composition/consumer lock
  → selected contract/Skill/runtime/proof subjects
  → deterministic portable release manifest
  → external consumer and Human Admit
```

## Current module contracts

- [`modules/bettor-consumer/`](modules/bettor-consumer/README.md)
- [`modules/document-ingest/`](modules/document-ingest/README.md)
- [`modules/product-adapters/`](modules/product-adapters/README.md)
- [`modules/research-orchestrator/`](modules/research-orchestrator/README.md)
- [`modules/runtime-fabric/`](modules/runtime-fabric/README.md)
- [`modules/security-boundaries/`](modules/security-boundaries/README.md)

## Molecular ownership

Provider/product leaves may add private adapter receipts but do not edit public module registration, interface versions, `data/status/integration.json`, or `data/releases/agent-shield-module-set.json`. Those shared paths are owned by phase convergence issues #44, #53, #64, and #75.

## Rules

1. Manifest JSON is machine authority; README prose may explain but not override it.
2. Each tracked root/file has one owner; cross-module dependencies use versioned capabilities/public contracts.
3. `SUPPORTED` or a manifest entry is not execution evidence.
4. `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, `NOT_EXERCISED`, blocked/cleanup/Human states remain separate.
5. Generated locks/releases/receipts are content-addressed and not hand-edited.
6. Mutable refs, host paths, secrets, sessions, live checkouts, and private flags are forbidden.
7. See [`../docs/state-machines/README.md`](../docs/state-machines/README.md), [`../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md), and [`../docs/traceability/STATE_MACHINE_INDEX.md`](../docs/traceability/STATE_MACHINE_INDEX.md).
