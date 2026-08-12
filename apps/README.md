# Applications

`apps/` contains user-facing product surfaces. It owns projections and typed user actions, not runtime providers, device sessions, security policy, cryptography, custody, or settlement.

## Directory/state ownership

| Directory | Module/capability | Current state | State-machine issues |
|---|---|---|---|
| `mobile-app/` | `product-adapters@1.0.0`, `product.mobile/v1` | contract present; local build `NOT_EXERCISED`; cloud/In-App bridge gaps | #45, #48, #49, convergence #53 |
| `web-dashboard/` | `product-adapters@1.0.0`, `product.dashboard/v1` | contract present; GenUI/terminal/deploy `NOT_EXERCISED`/`NOT_IMPLEMENTED` | #45, #46, #47, convergence #53 |

## Shared application state machine

```text
UNRESOLVED → SUBJECT/ARTIFACT_VERIFIED → AUTH_CHECKED → ACTION_VALIDATED
  → RISK_CHECKED → ROUTED → EXECUTING → OBSERVING → RENDERED
```

Alternative/terminal states: `ABSENT_ADAPTER`, `NOT_IMPLEMENTED`, `NOT_EXERCISED`, `WAITING_FOR_HUMAN`, `WAITING_FOR_HARDWARE`, `DENIED`, `FAILED`, `STALE`, `DISCONNECTED`, `FAILED_CLEANUP`.

## Data flow

```text
typed product/security/runtime receipts + immutable artifacts
  → web/mobile view model
  → accessible UI and precompiled typed action
  → owning module public capability
  → updated state/artifact/receipt projection
```

Applications may consume a provider receipt but may not import provider internals or treat another platform/provider result as their own PASS.

## Worker rules

- Read root `AGENTS.md`, this file, the child README, `.arena/modules/product-adapters/module.json`, and the assigned issue.
- Stable accessibility/test IDs and visible evidence-state fidelity are part of the public contract.
- No downloaded executable action, arbitrary shell/file operation, unauthenticated listener, secret/session/profile, or host path.
- Leaf issues own private app paths; #53 alone owns shared product registry/module/status/release aggregation.
- Implementation DAG: [`../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md#phase-4--product-and-mobile-automation).
