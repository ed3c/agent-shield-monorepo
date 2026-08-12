# Stacked PR operating model

## Unit of work

One branch and PR changes one independently falsifiable subject. The issue defines evals before the branch is created.

A branch packet contains:

```text
issue
parent branch / PR
allowed paths
excluded paths
module and intent IDs
eval IDs and negative controls
expected artifacts
states allowed to change
human-owned handoff
```

## Topology choices

### Linear dependency

Use a child branch when its diff cannot be reviewed or tested without the parent.

```text
main
└── contract
    └── adapter
        └── product surface
```

### Parallel fan-out

Use siblings when they share one accepted foundation but own disjoint paths.

```text
main
└── foundation
    ├── docs-a
    ├── docs-b
    └── docs-c
```

This is the preferred pattern for independent Worker Agents. Each sibling targets the foundation PR, has one isolated worktree and branch writer, and can be reviewed concurrently.

### Convergence branch

Create a convergence child only after siblings stabilize. It updates shared indexes, generated digests, ancestry references, and handoff metadata. Siblings do not race on shared canonical files.

## Branch naming

```text
<kind>/<order>-<subject>
```

Typical kinds are `docs`, `feat`, `fix`, and `chore`. The order expresses review order within the stack, not product priority.

## Creation flow

The safe path is an isolated worktree with an explicit issue packet:

```bash
scripts/git-town/worktree.sh \
  --branch docs/10-child \
  --parent docs/00-foundation \
  --worktree /host-owned/path/docs-10 \
  --issue 15 \
  --evals E10.1,E10.2 \
  --allowed-paths 'docs/git/**,scripts/git-town/**'
```

Branch creation is local by default. A trusted host publishes only after task metadata and preconditions are valid. Do not rely on a shared checkout or implicit branch sharing.

## Synchronization flow

```bash
# Mutation plan only.
scripts/git-town/sync-stack.sh --dry-run

# Local parent-first rebase, no remote publication.
scripts/git-town/sync-stack.sh

# Trusted safe-push publication.
ALLOW_GIT_TOWN_PUSH=1 scripts/git-town/sync-stack.sh --publish
```

The admitted publication command is:

```bash
git town sync --stack --non-interactive --push --no-auto-resolve
```

Feature branches rebase onto their parents; main/perennial branches are fast-forward only. Git Town's rebase strategy uses safe force-push protection. A semantic conflict or safe-push disagreement suspends/stops the run and creates a failure receipt.

For unattended periodic operation from a dedicated linked worktree:

```bash
ALLOW_GIT_TOWN_PUSH=1 \
  scripts/git-town/background-sync.sh start --interval 300 --publish
```

The daemon delegates every cycle to the same sync wrapper and stops on the first failure.

## Proposal flow

Every PR targets its direct Git Town parent. The body carries issue, stack breadcrumb, path lease, eval table, negative controls, evidence boundary, exact head/CI, exclusions, merge order, and rollback subject.

```bash
scripts/git-town/propose.sh \
  --title 'docs: describe one subject' \
  --body-file /host-owned/path/pr-body.md
```

The wrapper derives the base through Git Town and uses GitHub CLI non-interactively. The branch must already be safely published. Missing parent, auth, body sections, or remote-head equality fails before proposal mutation.

## Review and merge order

1. Review the smallest parent first.
2. Require exact-head CI and all issue evals.
3. Merge through GitHub review/merge controls.
4. Rebase/sync descendants on the new parent.
5. Rerun evals because the immutable subject changed.
6. Retarget the next PR to its new direct parent.
7. Continue toward the stack tip.

`git town ship` is not an unattended Worker command.

## Conflict protocol

```text
sync starts
→ conflict or safe-push disagreement
→ nonzero exit and FAIL receipt
→ worktree marked BLOCKED and preserved
→ process lease released
→ recovery issue/assignment names semantic owners
→ reviewed resolution
→ explicit continue or undo by the recovery owner
→ affected evals rerun
```

No background process executes semantic edits, `continue`, `skip`, `undo`, merge, ship, or permission widening.

Do not use `newest`, `prefer-cloud`, `prefer-beta`, or modification timestamps to resolve source code.

## Molecular issue design

An issue is parallel-safe when:

- writable paths do not overlap a sibling's paths;
- it consumes the same accepted parent contract;
- it does not require an unpublished sibling result;
- it has independent evals, negative controls, and artifacts;
- it can be reverted without reverting siblings;
- any shared index is reserved for the foundation or convergence owner.

If two tasks need the same file, serialize ownership or move that edit into convergence. Do not let two Workers race on one canonical document.

## Documentation stack for this phase

```text
main
└── docs/00-intent-traceability        # issue #13 / PR #25
    ├── docs/10-git-town-governance    # issue #15 / PR #27
    ├── docs/20-runtime-source-flows   # issue #17 / PR #26
    ├── docs/30-apps-services-readmes  # issue #19 / PR #28
    ├── docs/40-control-plane-readmes  # issue #21 / PR #29
    └── docs/50-harness-evals          # issue #22 / PR #30
        └── docs/60-index-convergence  # issue #23 from post-PR-#33 exact main
```

GitHub landed the sibling PRs before the foundation PR completed its final merge, then PR #25 produced the combined documentation tree on `main`. PR #33 subsequently repaired the exact Git Town artifact admission. The immutable head/merge identities and final-tree audit are recorded in [`../traceability/DOCUMENTATION_CONVERGENCE.md`](../traceability/DOCUMENTATION_CONVERGENCE.md); this historical diagram describes intended task ancestry, not a claim that every original feature head remains a direct ancestor of current `main`.
