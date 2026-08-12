# Documentation control plane

This directory turns source material and project decisions into Agent-readable contracts. It does not serve as execution evidence.

## Ownership

- `intent/` — product intent, constraints, and current-phase boundary.
- `sources/` — source inventory, locators, and claim classification.
- `architecture/` — current architecture contracts and planned data flows.
- `decisions/` — repository decisions and their rationale.
- `traceability/` — forward and backward index from intent to evidence.
- `git/`, `harness/`, `evals/`, and `licensing/` — delivered by the documentation stack issues that own those paths.

## Rules

1. State whether content is source-derived, repository-decided, inferred, or live evidence.
2. Link to a stable source ID and decision ID instead of repeating long source transcripts.
3. Keep current paths separate from planned paths.
4. Do not convert architecture prose into `PASS`.
5. Add a nearest README when creating a new documentation boundary.
6. Update [`INDEX.md`](INDEX.md) and the traceability index when a new canonical document is admitted.

## Entry points

- [`INDEX.md`](INDEX.md)
- [`intent/PROJECT_INTENT.md`](intent/PROJECT_INTENT.md)
- [`sources/SOURCE_LEDGER.md`](sources/SOURCE_LEDGER.md)
- [`traceability/TRACEABILITY_INDEX.md`](traceability/TRACEABILITY_INDEX.md)

The documentation-first stacked-PR plan is tracked by [issue #11](https://github.com/ed3c/agent-shield-monorepo/issues/11).