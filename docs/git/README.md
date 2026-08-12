# Git and stacked-PR governance

This directory defines how humans and Worker Agents create, synchronize, propose, review, and hand off stacked changes. Git commits, trees, refs, PRs, and CI remain canonical; Git Town orchestrates ancestry.

## Canonical documents

- [`GIT_TOWN_ADMISSION.md`](GIT_TOWN_ADMISSION.md) — exact `24.0.0` decision and bounded host-local artifact admission.
- [`STACKED_PRS.md`](STACKED_PRS.md) — topology, molecular issue design, synchronization, breadcrumbs, and merge order.
- [`WORKER_PROTOCOL.md`](WORKER_PROTOCOL.md) — isolated worktree, task packet, leases, unattended/background sync, conflict, receipt, and recovery rules.
- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) — contributor-facing summary.
- [`../../.git-town.toml`](../../.git-town.toml) — team-owned executable configuration.
- [`../../scripts/git-town/README.md`](../../scripts/git-town/README.md) — Bash operator entrypoints.
- [`../../third_party/git-town/README.md`](../../third_party/git-town/README.md) — pinned upstream/version/license entrypoint and exact dependency-admission record.
- [`../traceability/DOCUMENTATION_CONVERGENCE.md`](../traceability/DOCUMENTATION_CONVERGENCE.md) — final merged PR identities, exact-main audit, and post-documentation handoff.
- [`../licensing/README.md`](../licensing/README.md) — repository-wide dependency admission policy, delivered by issue #17.

## Invariants

1. Git commit/tree identity is canonical; Git Town does not become source truth.
2. One branch has one writer and one isolated linked worktree.
3. One PR has one eval subject, path lease, direct parent, and rollback subject.
4. Feature branches rebase; main/perennial branches are fast-forward only.
5. Automatic conflict resolution and implicit publication are disabled.
6. Trusted publication requires explicit Bash flags and host authorization.
7. Semantic conflicts, safe-push disagreements, timeouts, and dirty state fail closed.
8. Background sync delegates to the same bounded wrapper and stops on failure.
9. Human Admit owns merge, ship, permissions, and release.
10. No timestamp-based newest-wins source repair.
11. Every sync and proposal emits inspectable metadata; live dependency evidence is not faked.
