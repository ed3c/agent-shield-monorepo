# Git Town Bash operators

These scripts are the bounded Git-management implementation for unattended Worker Agents. They do not implement Agent Shield product capabilities.

## Entry points

| Script | Purpose | Mutation |
|---|---|---|
| `doctor.sh` | validate repository, version, config, branch, parent, clean state, and task metadata | none |
| `new-branch.sh` | create a root or child feature branch after validation | branch/worktree Git state |
| `sync-stack.sh` | dry-run or synchronize the current stack with rebase and safe push | branch ancestry and remote refs |
| `propose.sh` | derive the direct parent and create/update a GitHub PR from an eval-first body | GitHub PR metadata |
| `selftest.sh` | static and temporary-repository negative controls | temporary files only |
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

## Normal flow

```bash
scripts/git-town/doctor.sh
scripts/git-town/sync-stack.sh --dry-run
# perform allowed edits and evals
scripts/git-town/sync-stack.sh
scripts/git-town/propose.sh --title "docs: ..." --body-file /tmp/pr-body.md
```

## Failure rule

Any conflict, dirty state, unknown parent, unsafe version, overlapping branch lease, missing eval metadata, or unsafe tracking-branch disagreement stops the worker. Scripts do not run `git town continue`, `skip`, `undo`, or `ship` automatically.

## Version

The default admitted version line is `24.0`. Set `GIT_TOWN_REQUIRED_VERSION` to an exact version when the runtime image is pinned more strictly.

## Receipts

Receipts contain branch and commit identities, command, exit/state, log digest, and cleanup state. They never contain token values, browser profiles, device sessions, or host secrets.