# bettor-consumer module state route

- Interface: `1.0.0`
- Roots: bettor bootstrap/verification scripts and current SDK subject
- Provides: `bettor.consumer/v1`, `bettor.browser-contract/v2`
- Runtime: local/cloud `NOT_EXERCISED`
- External exposure: false; secrets: none

## Current state machine

```text
SUBJECT_INPUT → repository/40-hex/tool validation → PORTABLE_SUBJECT_READY
  → consumer lock/live carrier/origin receipts absent → NOT_EXERCISED
```

The module plans/applies an exact bettor consumer projection and verifies generated lock, Claude/Codex entry, Skill requirements, and MCP subject without importing bettor private implementation.

## Target flow and issues

```text
immutable release #65
  → module closure #66
  → Skills #67 + runtime #68
  → CLI/MCP #69
  → Claude #70 + Codex #71 + GitHub #72 + Forgejo #73
  → equivalence #74
  → promotion/rollback #75
```

Shared module/interface/status/release promotion belongs to #75. Missing trusted private checkout, carrier session, origin, or browser route remains the exact gap state; no mutable ref, host path, or fabricated initialization PASS.

See [`../../../docs/state-machines/README.md`](../../../docs/state-machines/README.md#8-bettor-consumer-and-release-integration).
