# Shared packages

`packages/` contains portable public contracts and client helpers. Packages are not runtimes, providers, products, sessions, or evidence by themselves.

## Package state machine

```text
API_PROPOSED → CLOSED_TYPES/SCHEMAS_DEFINED → COMPATIBILITY_TESTED
  → PUBLIC_EXPORT_ADMITTED → CONSUMERS_LOCKED → RELEASED
```

Blocked states: duplicate/ambiguous type, unknown-field escape, breaking change without version, private import, host/session/secret/mutable ref, incompatible consumer, or stale generated release.

## Current packages and flow

| Directory | Role | Data flow | Future owners |
|---|---|---|---|
| `contracts/` | canonical evidence/provider/product/security vocabulary | typed request → state/artifact/receipt | foundations #38/#45/#54/#65 |
| `agent-shield-sdk/` | immutable bettor MCP subject validator | repo+commit+tool → validated subject | consumer stack #65–#75 |

Cross-module imports use public exports only. Leaf `src/` is private and inherits its package README. Types preserve every evidence state and cannot promote absence/unexercised state. New dependencies require exact direct/transitive license/distribution review.
