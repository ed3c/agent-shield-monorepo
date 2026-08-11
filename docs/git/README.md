# Git and stacked-PR governance

This directory defines how humans and Worker Agents create, synchronize, propose, review, and hand off stacked changes.

## Canonical documents

- [`GIT_TOWN_ADMISSION.md`](GIT_TOWN_ADMISSION.md) — why Git Town is admitted and what its MIT license does not guarantee.
- [`STACKED_PRS.md`](STACKED_PRS.md) — branch topology, merge order, breadcrumbs, and molecular issue design.
- [`WORKER_PROTOCOL.md`](WORKER_PROTOCOL.md) — unattended worktree, lease, synchronization, failure, and receipt rules.
- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) — contributor-facing summary.
- [`../../.git-town.toml`](../../.git-town.toml) — team-owned executable configuration.
- [`../../scripts/git-town/README.md`](../../scripts/git-town/README.md) — Bash operator entrypoints.

## Invariants

1. Git commit/tree identity is canonical; Git Town orchestrates ancestry.
2. One branch has one writer and one isolated worktree.
3. A PR has one eval subject and an explicit parent.
4. Feature branches rebase; main/perennial branches are fast-forward only.
5. Semantic conflicts fail closed in unattended mode.
6. Human Admit owns merge and release.
7. No timestamp-based newest-wins source repair.
8. Every sync and proposal emits inspectable metadata.