# Unattended Worker-Agent protocol

## Required environment

- Git repository with `.git-town.toml` from the admitted parent commit;
- Git Town 24.0 line or a stricter admitted exact version;
- GitHub CLI for proposal operations only;
- one isolated Git worktree per worker;
- one task packet per branch;
- network and credentials supplied by the host, never by repository files.

## Worker lifecycle

```text
admit task
→ create isolated worktree
→ acquire branch lease
→ validate parent, path lease, version, auth, and clean state
→ dry-run stack sync
→ mutate only allowed paths
→ run issue evals and controls
→ commit exact subject
→ sync stack non-interactively
→ propose/update PR
→ record receipt
→ release process lease
→ preserve or clean worktree according to handoff state
```

## Worktree identity

Each worker receives:

```text
WORKER_ID
ISSUE_NUMBER
BRANCH_NAME
PARENT_BRANCH
WORKTREE_PATH
ALLOWED_PATHS
EXCLUDED_PATHS
EVAL_IDS
```

A controller may place this metadata under `.git/agent-shield/tasks/`; it is host state and is not committed.

## Lease model

The Bash wrappers create an atomic directory lock under the common Git directory. The lock prevents two unattended processes from synchronizing or proposing the same branch at once.

The process lease is not proof of exclusive human ownership. A remote branch is treated as single-writer by policy; workers must stop if the tracking branch contains commits they did not integrate.

## Preconditions

Before mutation, require:

1. current branch is not `main`;
2. current worktree is clean;
3. no unmerged paths or Git operation is in progress;
4. current branch equals the task branch;
5. Git Town can return its parent;
6. parent equals the task packet;
7. team config contains rebase/ff-only/push-hook policy;
8. required commands and admitted version are present;
9. current diff against parent is inside the path lease.

## Background synchronization

```bash
git town sync --stack --non-interactive --push --no-auto-resolve --verbose
```

The wrapper sets explicit environment overrides so local/global configuration cannot silently weaken rebase, push, hook, tag, upstream, or interactive behavior.

A successful process exit is necessary but not sufficient. The receipt also records:

- repository and branch;
- parent;
- worker and issue;
- command and configured version;
- before/after commit IDs;
- dry-run flag;
- exit code and result state;
- unmerged paths;
- log digest;
- cleanup state.

## Failure protocol

### Dirty or unknown state

Fail before mutation with exit 64. Do not stash automatically in unattended mode even though Git Town can stash; task isolation should make dirty state exceptional and visible.

### Rebase or safe-push conflict

Fail with exit 2. Preserve the worktree and Git Town suspended state. Do not run `continue`, `skip`, or semantic conflict edits.

### Remote single-writer disagreement

Fail with exit 2. Record remote/local heads and assign recovery. Do not force-push around safe-push protection.

### Missing provider/auth/network

Use `ABSENT` or `NOT_EXERCISED` according to the task contract. Do not report stack synchronization `PASS` when a push or proposal was skipped.

## Recovery assignment

A recovery task names:

- failed receipt;
- conflicted branches and files;
- expected parent graph;
- semantic owner for each conflict;
- permitted resolution paths;
- required regression evals;
- whether to continue or undo after review.

Only the recovery owner may run `git town continue` or `git town undo`.

## Cleanup

- Remove transient process lease on every exit.
- Preserve failed worktrees until recovery or explicit Human Admit.
- Remove successful temporary worktrees only after the PR branch and receipts are pushed.
- Never delete a branch with unshipped changes.
- Report leaked locks, worktrees, processes, and suspended operations independently from task success.

## Security

- Host credentials enter through GitHub CLI, credential helpers, or brokered environment variables.
- Logs are bounded and must not print tokens or credential-bearing remote URLs.
- Use `git town config --redact` for diagnostics.
- No browser profile, `.env`, private key, or device session participates in Git synchronization.