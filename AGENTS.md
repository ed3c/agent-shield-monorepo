# AGENTS.md — Agent Shield documentation and integration contract

## Mission

Preserve project intent, source provenance, module boundaries, and evidence honesty while the repository moves through documentation-first stacked PRs. Bun + TypeScript remain the primary future implementation stack, but this documentation phase does not authorize new product or provider implementation.

## Mandatory read order

1. [`README.md`](README.md)
2. [`docs/INDEX.md`](docs/INDEX.md)
3. [`docs/intent/PROJECT_INTENT.md`](docs/intent/PROJECT_INTENT.md)
4. [`docs/sources/SOURCE_LEDGER.md`](docs/sources/SOURCE_LEDGER.md)
5. [`ARCHITECTURE.md`](ARCHITECTURE.md)
6. [`docs/architecture/IMPLEMENTATION_PHASES.md`](docs/architecture/IMPLEMENTATION_PHASES.md)
7. [`docs/traceability/TRACEABILITY_INDEX.md`](docs/traceability/TRACEABILITY_INDEX.md)
8. the nearest `README.md` for every path you may change
9. the selected `.arena/modules/<id>/module.json`
10. `data/status/integration.json` and the issue/PR eval contract

Stop if a required document, parent branch, issue, eval, or path owner is missing. Do not infer the gap.

## Task admission

Before editing, record:

- issue number and objective;
- parent branch and parent PR;
- allowed and excluded paths;
- selected module IDs and interface versions;
- eval IDs, negative controls, and expected artifacts;
- evidence states that may change;
- environment-owned evidence that must remain unchanged.

A task without this packet is `ABSENT`, not ready.

## Evidence vocabulary

- `PASS`: the exact named subject was exercised successfully and has evidence.
- `FAIL`: the exact named subject was exercised and disagreed with its contract.
- `ABSENT`: a required subject, input, owner, or artifact does not exist.
- `NOT_IMPLEMENTED`: the provider or mechanism is intentionally not implemented.
- `NOT_EXERCISED`: a contract exists, but its live or environment-owned canary has not run.

Package presence, prose, diagrams, source claims, optional skips, and successful execution of another subject cannot produce `PASS`.

## Source handling

Use the source ledger before reusing a claim. Preserve the source's terminology and framing, then classify the repository treatment separately:

- `SOURCE_PROPOSAL` — stated by a supplied source;
- `REPOSITORY_DECISION` — intentionally adopted by this repository;
- `INFERENCE` — derived reasoning that is not directly stated by a source;
- `LIVE_EVIDENCE` — an executed immutable receipt.

Do not silently correct or merge source claims. Record contradictions and status differences explicitly.

## Module and directory boundaries

- A module may read its own private implementation.
- Cross-module calls use typed contracts, packets, artifact references, or receipts.
- The nearest directory `README.md` defines local ownership, inputs, outputs, dependencies, non-goals, and evals.
- A new public/module/control-plane directory must add or update its nearest README in the same PR.
- Planned directories remain documentation only until an implementation issue admits their paths.

## Stacked-PR protocol

- Git Town manages branch ancestry; Git commit and tree identity remain canonical.
- One Worker Agent owns one branch lease in one isolated worktree.
- Sibling issues must have disjoint writable paths unless one explicit owner is named.
- Feature synchronization uses rebase and safe push; merge commits inside feature stacks are not the default.
- An unattended conflict fails closed. Never auto-run semantic conflict edits, `git town continue`, `skip`, `undo`, ship, or production promotion.
- Never use timestamps, newest-wins, prefer-cloud, or prefer-beta to resolve source-code conflicts.
- Parent PRs merge before descendants. Retarget and re-evaluate descendants after each parent merge.
- Human Admit owns merge and release promotion.

The stack epic is [#11](https://github.com/ed3c/agent-shield-monorepo/issues/11). Every PR must include issue, parent, eval IDs, negative controls, changed paths, evidence boundary, and exact-head CI result.

## Security and licensing boundaries

- Secrets, cookies, OAuth sessions, browser profiles, `.env`, private keys, device credentials, host absolute paths, and mutable sibling checkouts never enter Git, bundles, MCP payloads, sync channels, or receipts.
- External dependencies are deny-by-default until their exact version, direct license, transitive licenses, source availability, and distribution obligations are reviewed.
- A permissive license lowers commercial licensing risk; no document may promise absolute zero legal risk.
- Generic shell-over-MCP is forbidden.

## Current documentation-phase restrictions

Do not implement or promote E2B, Apple Container, OpenShell/tmux, cloud browsers, PDF providers, Expo/device adapters, Maestro, WDA, scrcpy, MPC/TSS, Secure Enclave/NFC, smart accounts, ledger anchors, or settlement in documentation PRs. Git Town configuration and bounded Bash Git-management tooling are permitted only in their assigned issue.

## Completion report

Before claiming completion, report:

1. issue and PR numbers;
2. parent branch/PR and exact head SHA;
3. changed paths and module IDs;
4. eval results and negative-control results;
5. generated artifacts and digests;
6. states changed among `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, and `NOT_EXERCISED`;
7. unresolved implementation and live-canary gaps;
8. cleanup or residue state;
9. next safe merge or handoff action.