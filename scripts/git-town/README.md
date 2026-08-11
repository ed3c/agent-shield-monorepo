# Git Town Bash operators

These scripts are the bounded Git-management implementation for unattended Worker Agents. They do not implement Agent Shield product capabilities.

## Entry points

| Script | Purpose | Mutation |
|---|---|---|
| `doctor.sh` | validate repository, version, config, branch, parent, clean state, path lease, and task metadata | none |
| `worktree.sh` | create an isolated worktree/branch, set explicit parentage, push it, and record the task packet | worktree and branch refs |
| `new-branch.sh` | create a root or child feature branch inside an already isolated parent worktree | branch Git state |
| `sync-stack.sh` | dry-run or synchronize the current stack with rebase and safe push | branch ancestry and remote refs |
| `propose.sh` | derive the direct parent and create/update a GitHub PR from an eval-first body | GitHub PR metadata |
| `selftest.sh` | static and optional temporary-repository negative controls | temporary files only |
| `common.sh` | shared validation, lock, hashing, and receipt helpers | internal library |

## Host task metadata

The controller exports:

```bash
export WORKER_ID=worker-docs-10
export ISSUE_NUMBER=15
export TASK_BRANCH=docs/10-git-town-governance
export TASK_PARENT=docs/00-intent-traceability
export TASK_EVALS=E10.1,E10.2,E10.3,E10.4,E10.5
export TASK_ALLOWED_PATHS='.git-town.toml,CONTRIBUTING.md,.github/PULL_REQUEST_TEMPLATE.md,.github/ISSUE_TEMPLATE/**,docs/git/**,scripts/git-town/**'
```

Metadata is written only to `.git/agent-shield/` receipts. It is not committed.

## Controller flow

```bash
bash scripts/git-town/worktree.sh \
  --branch docs/10-git-town-governance \
  --parent docs/00-intent-traceability \
  --worktree ../worktrees/docs-10 \
  --issue 15 \
  --evals E10.1,E10.2,E10.3,E10.4,E10.5 \
  --allowed-paths '.git-town.toml,CONTRIBUTING.md,.github/PULL_REQUEST_TEMPLATE.md,.github/ISSUE_TEMPLATE/**,docs/git/**,scripts/git-town/**' \
  --worker worker-docs-10
```

Use `--dry-run` first when the controller has not previously admitted the parent subject.

## Worker flow

```bash
# Source the host-owned task packet before running these commands.
bash scripts/git-town/doctor.sh
bash scripts/git-town/sync-stack.sh --dry-run
# perform allowed edits and issue evals
bash scripts/git-town/selftest.sh
bash scripts/git-town/sync-stack.sh
bash scripts/git-town/propose.sh --title "docs: ..." --body-file /tmp/pr-body.md
```

`selftest.sh --integration` additionally creates a temporary Git Town stack and plants a semantic conflict; it requires the admitted Git Town executable.

## Failure rule

Any conflict, dirty state, unknown parent, unsafe version, overlapping branch lease, missing eval metadata, or unsafe tracking-branch disagreement stops the worker. Scripts do not run `git town continue`, `skip`, `undo`, or `ship` automatically.

## Version

The default admitted version line is `24.0`. Set `GIT_TOWN_REQUIRED_VERSION` to an exact version when the runtime image is pinned more strictly.

## Receipts

Receipts contain branch and commit identities, command, exit/state, log digest, and cleanup state. They never contain token values, browser profiles, device sessions, or host secrets.