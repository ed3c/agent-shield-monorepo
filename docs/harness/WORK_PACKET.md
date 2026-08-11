# Parallel Worker work packet

A work packet makes one issue executable without giving the Worker broad repository authority.

## Required packet

```yaml
schema: agent-shield/work-packet/v1
worker_id: worker-docs-50
issue: 22
parent_branch: docs/00-intent-traceability
parent_pr: 25
branch: docs/50-harness-evals
worktree: host-owned-reference
allowed_paths:
  - docs/evals/**
  - docs/harness/**
excluded_paths:
  - apps/**
  - services/**
  - packages/**
eval_ids:
  - E50.1
  - E50.2
dependencies:
  - issue: 13
    state: accepted-parent
merge_order: after-parent-before-convergence
human_owned:
  - merge
  - permission-widening
  - release-promotion
```

Host paths, credentials, and secret values are not committed; the portable packet stores only a host-owned reference where needed.

## Admission checks

Before mutation:

- issue exists and contains complete evals;
- parent ref/PR and exact commit exist;
- branch has one semantic writer;
- worktree is isolated and clean;
- allowed paths do not overlap another active sibling packet;
- shared canonical files are reserved for foundation or convergence;
- required tools/dependencies have named presence and license state;
- Worker cannot write `main`, merge, ship, or change permissions.

## Parallelism rule

Two packets may run concurrently when their writable path sets are disjoint and neither consumes unpublished output from the other. Reading the same accepted parent contract is safe. Needing the same file, generated manifest, shared lock, or sibling output creates a dependency and must be serialized.

## Worker completion report

```text
issue / worker / branch / direct parent
actual changed paths versus lease
changed module/interface/evidence states
positive eval results
negative/mutation results
cleanup/residue results
exact commit/tree and artifacts/receipts
ABSENT / NOT_IMPLEMENTED / NOT_EXERCISED exclusions
stack children affected
rollback subject
next human-owned action
```

## Failure handoff

A blocked packet records the failing action, exact subject, suspended Git/provider state, changed/unmerged paths, receipts/log digests, cleanup state, and semantic owners needed for recovery. A replacement Worker receives a new packet; it does not inherit hidden shell/session state.

## Convergence

After sibling PRs stabilize, one convergence packet owns shared indexes, ancestry retargeting, generated digests, link closure, and final cross-document evals. Sibling Workers do not preemptively edit those shared paths.
