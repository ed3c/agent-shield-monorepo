# Applications

`apps/` contains user-facing product surfaces. It does not own runtime providers, security policy, research routing, or settlement.

## Current boundaries

| Directory | Module | Public contract | Current evidence |
|---|---|---|---|
| `mobile-app/` | `product-adapters@1.0.0` | `product.mobile/v1` | local `NOT_EXERCISED`; cloud `NOT_IMPLEMENTED` |
| `web-dashboard/` | `product-adapters@1.0.0` | `product.dashboard/v1` | local `NOT_EXERCISED`; cloud `NOT_IMPLEMENTED` |

Both depend on `runtime.provider/v1` and must consume runtime state through typed receipts. They may not import provider implementation or host sessions.

## Rules for Worker Agents

- Read root `AGENTS.md`, this file, the child README, and `.arena/modules/product-adapters/module.json` before editing.
- Every user action maps to a precompiled typed action; no downloaded executable code or generic shell bridge.
- Accessibility/test IDs are part of the product contract.
- Secrets, browser/device profiles, host ports, and absolute paths remain host-owned.
- A UI mock, package, simulator declaration, or source diagram cannot produce `PASS`.
- Product changes require their own eval-first issue; documentation issue #19 changes README files only.

Planned native hardware, wallet, and settlement applications from source `S-001` remain in architecture documents until separate modules and evidence contracts are admitted.