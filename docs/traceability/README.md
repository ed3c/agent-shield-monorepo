# Traceability

This directory links project intent to sources, decisions, issues, PRs, evals, artifacts, and evidence states.

## Trace unit

A complete row contains:

```text
intent ID
→ source ID / rationale
→ decision ID
→ owner and issue
→ parent branch / PR
→ eval IDs and negative controls
→ implementation or documentation subject
→ artifact / receipt
→ current evidence state
```

## Rules

- Every accepted decision has at least one intent ID and source/rationale.
- Every implementation issue has evals before changed paths.
- Every PR declares its parent and writable path set.
- Every `PASS` links to an exact immutable subject and artifact.
- Planned and deferred capabilities remain indexed.
- A missing link is an orphan and blocks convergence.

Canonical intent table: [`TRACEABILITY_INDEX.md`](TRACEABILITY_INDEX.md).

Exact post-stack audit, merged PR identities, authority map, negative-control results, remaining gaps, and implementation handoff: [`DOCUMENTATION_CONVERGENCE.md`](DOCUMENTATION_CONVERGENCE.md).
