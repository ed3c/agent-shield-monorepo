# Stacked PR operating model

## Unit of work

One branch and PR should change one independently falsifiable subject. The issue defines evals before the branch is created.

A branch packet contains:

```text
issue
parent branch / PR
allowed paths
excluded paths
module IDs
intent IDs
eval IDs
negative controls
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

Create with `git town append` from the intended parent.

### Parallel fan-out

Use sibling branches when they share one foundation but change disjoint paths.

```text
main
└── foundation
    ├── docs-a
    ├── docs-b
    └── docs-c
```

This is the preferred model for independent Worker Agents. Each sibling targets the foundation PR, owns a different path lease, and may be reviewed concurrently.

### Convergence branch

Create a convergence child only after siblings stabilize. It updates shared indexes, generated digests, and handoff metadata rather than copying sibling implementation into one giant PR.

## Branch naming

```text
<kind>/<order>-<subject>
```

Examples of kinds are `docs`, `feat`, `fix`, and `chore`. `order` expresses review order inside the current stack, not product priority.

## Creation flow

```bash
# Start a root stack from main.
git town hack docs/00-foundation --non-interactive --no-auto-resolve

# Add a dependent child while checked out on its parent.
git town append docs/10-child --non-interactive --no-auto-resolve --push
```

The repository wrapper validates the worktree and writes task metadata before invoking these commands.

## Synchronization flow

```bash
scripts/git-town/sync-stack.sh --dry-run
scripts/git-town/sync-stack.sh
```

The mutation subject is:

```bash
git town sync --stack --non-interactive --push --no-auto-resolve
```

The configured rebase strategy causes feature branches to rebase onto parent branches. Git Town uses safe force-push protections for rewritten tracking branches. A conflict suspends the command and exits nonzero.

## Proposal flow

Every PR targets its direct parent branch. The PR body carries a stack breadcrumb, issue, path lease, eval table, negative controls, evidence boundary, and merge order.

```bash
scripts/git-town/propose.sh \
  --title "docs: describe one subject" \
  --body-file /path/to/pr-body.md
```

The wrapper derives the base branch from Git Town and uses GitHub CLI non-interactively. Missing parentage or auth fails before proposal.

## Review and merge order

1. Review the smallest parent first.
2. Require exact-head CI on every PR.
3. Merge the parent through GitHub controls.
4. Rebase/sync all descendants.
5. Rerun evals because their immutable subject changed.
6. Retarget the next PR to the parent's new base.
7. Continue toward the stack tip.

`git town ship` is not an unattended Worker-Agent command.

## Conflict protocol

Background workers may detect but not semantically resolve conflicts.

```text
sync starts
→ conflict detected
→ FAIL receipt written
→ branch/worktree preserved
→ worker releases process lease
→ recovery issue/assignment created
→ human or dedicated recovery Agent resolves
→ explicit review
→ explicit `git town continue`
→ evals rerun
```

Do not use `newest`, `prefer-cloud`, `prefer-beta`, or modification timestamps to resolve source code.

## Molecular issue design

An issue is parallel-safe when:

- its writable paths do not overlap a sibling's writable paths;
- it consumes the same accepted parent contract;
- it does not require another sibling's unpublished output;
- it has independent negative controls and artifacts;
- it can be reverted without reverting siblings.

If two tasks need the same file, either split ownership by sequence or create a convergence issue. Do not let two workers race on one shared index.