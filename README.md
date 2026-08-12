# Agent Shield Monorepo

Agent Shield is a Bun + TypeScript modular product skeleton and the first external acceptance consumer for `bettor-arena`.

The repository converts a broad source architecture into explicit module contracts, staged provider boundaries, and falsifiable evidence states. The current delivery phase is **documentation and Git governance first**: no new runtime, product, wallet, browser, mobile, hardware, or settlement implementation is admitted until the documentation stack is reviewed.

## Rules without examples

1. Bun + TypeScript are the primary future control-plane and service stack.
2. Modules communicate through typed contracts, packets, artifacts, or receipts—not private implementation paths.
3. `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, and `NOT_EXERCISED` are different states.
4. Source text and architecture diagrams never prove a live capability.
5. Secrets, browser profiles, device sessions, host paths, and mutable owner checkouts never enter Git or receipts.
6. Every issue and PR defines its evals and negative controls before implementation.
7. Stacked PRs use one writer per branch, isolated worktrees, and explicit parentage.
8. Source repair uses Git ancestry and content identity; timestamp-based newest-wins is forbidden.
9. Human Admit owns merge, production promotion, key authority, and high-risk settlement.

## Harness narratives

- **Source-claim Harness:** a document may describe E2B, OpenShell, mobile automation, or MPC/TSS. The Harness preserves that proposal, checks the repository contract, and refuses to report `PASS` without a matching receipt.
- **Git-stack Harness:** a Worker Agent receives one issue, one branch lease, allowed paths, and eval IDs. It rebases its Git Town stack non-interactively; a conflict creates a failure receipt and a new recovery assignment rather than an automatic semantic merge.
- **Runtime Harness:** local disposable execution can be tested independently while cloud providers, signed-in browsers, simulators, and devices retain their own unavailable or unexercised states.
- **Bettor-consumer Harness:** an exact bettor release may generate Claude Code, Codex CLI, Skill, lock, and MCP projections. Missing private checkout or live subscription evidence remains `NOT_EXERCISED`.

Detailed Harness and eval documentation is tracked in [issue #22](https://github.com/ed3c/agent-shield-monorepo/issues/22).

## Stacked PR issue map

```text
main
└── #13 source/intent foundation                 → PR #25
    ├── #15 Git Town + unattended Bash Workers   → PR #27
    ├── #17 architecture/data-flow/license docs  → PR #26
    ├── #19 apps/services nearest READMEs         → PR #28
    ├── #21 control-plane/package/data READMEs    → PR #29
    └── #22 Harness/eval contracts                → PR #30
        └── #23 merged-tree convergence audit     → active from post-PR-#33 main
```

Issues #13, #15, #17, #19, #21, and #22 are merged through PRs #25–#30. PR #33 repaired the exact Git Town v24 artifact admission before #23 started from clean commit `533583eff9b647006a001b69f57db3895dc5e8b1`. Shared indexes, delivery identities, README coverage, negative controls, and the implementation handoff belong to #23; exact results are in [`docs/traceability/DOCUMENTATION_CONVERGENCE.md`](docs/traceability/DOCUMENTATION_CONVERGENCE.md).

## Documentation map

Start with [`AGENTS.md`](AGENTS.md), then follow [`docs/INDEX.md`](docs/INDEX.md).

| Need | Canonical document |
|---|---|
| Project intent and current phase | [`docs/intent/PROJECT_INTENT.md`](docs/intent/PROJECT_INTENT.md) |
| Source-derived claims and locators | [`docs/sources/SOURCE_LEDGER.md`](docs/sources/SOURCE_LEDGER.md) |
| Architecture planes | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Implementation phases and evidence boundary | [`docs/architecture/IMPLEMENTATION_PHASES.md`](docs/architecture/IMPLEMENTATION_PHASES.md) |
| Intent-to-issue/eval/status index | [`docs/traceability/TRACEABILITY_INDEX.md`](docs/traceability/TRACEABILITY_INDEX.md) |
| Exact documentation convergence and handoff | [`docs/traceability/DOCUMENTATION_CONVERGENCE.md`](docs/traceability/DOCUMENTATION_CONVERGENCE.md) |
| Documentation-first stacked-PR epic | [issue #11](https://github.com/ed3c/agent-shield-monorepo/issues/11) |

The nearest directory `README.md` is the local ownership contract. Planned modules remain in architecture documents until an implementation issue admits their paths.

## Existing structural baseline

The merged baseline contains six modules: bettor consumer, document ingest, research orchestration, runtime fabric, product adapters, and security boundaries. It also contains a deterministic module release manifest. These artifacts prove portable contract bytes; they do not prove cloud, browser, device, hardware, or chain execution.

## Verify

```bash
bun run check:all
```

Without a generated `.arena/consumer.lock.json`, bettor integration reports `NOT_EXERCISED` and exits successfully. Absence is never converted into PASS.

## Initialize through bettor-arena

The bettor checkout must contain the merged Bun implementation, be clean, and be named by an exact 40-hex commit.

```bash
bun scripts/bootstrap-bettor.ts \
  --bettor-root /path/to/bettor-arena \
  --commit <exact-40-hex-commit>

# Review the content-addressed plan before applying it.
bun scripts/bootstrap-bettor.ts \
  --bettor-root /path/to/bettor-arena \
  --commit <exact-40-hex-commit> \
  --apply
```

Use `--embedded` only for a self-contained no-hardlink bettor clone. Remote mode uses host-owned configuration; host paths are not committed.

## Evidence boundary

The supplied architecture source proposes cloud/local sandboxes, terminal persistence, hot sync, PDF parsing, mobile projection, automated testing, MPC/TSS, hardware brakes, wallets, ledgers, and settlement. The repository records those ideas as source proposals, typed boundaries, or future issues. Live provider, hardware, chain, Claude/Codex, Forgejo, and signed-in browser evidence remains environment-owned.
