# Four-repository integration — Agent Shield view

| Repository | Plane | Agent Shield relationship |
|---|---|---|
| `skills-shared` | Instruction / Method | publishes portable procedures and selected Skill contracts |
| `runtime-env` | Runtime Contract | publishes secret-free variable/module/profile/workload/policy bindings |
| `bettor-arena` | Integration / Acceptance | resolves module/Skill/runtime locks, provides stateless MCP/bootstrap, proves acceptance |
| `agent-shield-monorepo` | Domain Product / Reference Consumer | owns product/provider implementations and exact domain canaries |

## Release and binding flow

```text
skills-shared Skill release
        +
runtime-env resolved binding/workload/policy
        |
        v
bettor-arena composition lock + module proof + MCP/bootstrap release
        |
        v
Agent Shield consumer lock / module selection / product adapter
        |
        v
Claude + Codex + origin + provider + product canary receipts
        |
        v
bettor external-release acceptance
        |
        v
Human promotion or rollback
```

## Internal/external boundary

- Agent Shield may use its own private implementation inside a module.
- Cross-module and cross-repository use typed contracts, immutable artifacts, CLI/MCP public surfaces, bindings, and receipts.
- Local Skill symlinks and editable checkouts are development channels only.
- Secret values, browser/device sessions, hardware material, and host paths remain environment owned.
- GitHub/Forgejo equivalence requires an exact commit/tree/release receipt.

## Product/provider evidence

An upstream declaration cannot create a downstream PASS. Agent Shield provider status is owned by `data/status/integration.json` plus exact receipts. Source claims from the architecture PDF remain proposals until independent admission and live canaries.
