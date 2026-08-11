# AGENTS.md — Agent Shield modular integration

## Mandatory read order

1. `ARCHITECTURE.md`
2. `docs/architecture/IMPLEMENTATION_PHASES.md`
3. the selected `.arena/modules/<id>/module.json`
4. `data/status/integration.json`
5. the public Bun entrypoint named by the module contract

## Non-negotiable rules

- Bun + TypeScript are the primary control-plane and service implementation.
- A module may read its own private implementation. Cross-module calls use typed contracts only.
- `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, and `NOT_EXERCISED` are distinct.
- GitHub and Forgejo are origins of one logical release, never competing canonicals.
- Signed-in browser profiles, cookies, tokens, `.env`, private keys, and host paths never enter Git, bundles, receipts, or local/cloud sync.
- E2B, Apple Container, OpenShell, tmux, Playwright, stealth-browser, Maestro, WDA, scrcpy, MPC/TSS, wallet, and settlement capabilities cannot be promoted from documentation alone.
- External projects consume bettor-arena through an immutable release and its generated MCP launcher. Never call bettor private paths.
- Human Admit, production promotion, key rotation, and high-risk settlement remain human-owned.

## Completion report

Before claiming completion, report changed module IDs, interface versions, proof state, control state, live state, unresolved `NOT_IMPLEMENTED`, unresolved `NOT_EXERCISED`, and the exact bettor release subject when initialized.
