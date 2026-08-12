# Git Town Bash operators

These scripts are the bounded Git-management implementation for unattended Worker Agents. They do not implement Agent Shield product capabilities.

## Entry points

| Script | Purpose | Mutation |
|---|---|---|
| `doctor.sh` | validate exact Git Town/license/config, branch, parent, clean state, task metadata, and path lease | none |
| `worktree.sh` | create one isolated linked worktree and branch with explicit parent/task packet | worktree and local branch; optional explicit push |
| `new-branch.sh` | create a root/child branch in the current isolated worktree | local branch; optional explicit push |
| `sync-stack.sh` | dry-run, local rebase, or explicitly publish the current stack | branch ancestry; remote refs only in publish mode |
| `background-sync.sh` | repeatedly call the same sync wrapper from a linked worktree | same as selected sync mode |
| `propose.sh` | derive direct parent and create/update an eval-first GitHub PR | GitHub PR metadata |
| `selftest.sh` | static and disposable-repository positive/negative controls | temporary fixtures only |
| `common.sh` | shared validation, exact-version/license checks, leases, hashing, blocked state, and receipts | internal library |

## Host task metadata

The trusted controller exports:

```bash
export WORKER_ID=worker-docs-10
export ISSUE_NUMBER=15
export TASK_BRANCH=docs/10-git-town-governance
export TASK_PARENT=docs/00-intent-traceability
export TASK_EVALS=E10.1,E10.2,E10.3,E10.4,E10.5
export TASK_ALLOWED_PATHS='.git-town.toml,CONTRIBUTING.md,.github/PULL_REQUEST_TEMPLATE.md,.github/ISSUE_TEMPLATE/**,docs/git/**,scripts/git-town/**,third_party/git-town/**'
```

Metadata and receipts live under the Git common directory, not tracked content. Do not include secrets or credential-bearing URLs.

## Controller flow

```bash
bash scripts/git-town/worktree.sh \
  --branch docs/10-git-town-governance \
  --parent docs/00-intent-traceability \
  --worktree /host-owned/path/docs-10 \
  --issue 15 \
  --evals E10.1,E10.2,E10.3,E10.4,E10.5 \
  --allowed-paths '.git-town.toml,CONTRIBUTING.md,.github/**,docs/git/**,scripts/git-town/**,third_party/git-town/**' \
  --worker worker-docs-10 \
  --dry-run
```

After review, rerun without `--dry-run`. Branch publication is explicit and guarded.

## Worker flow

```bash
# Source the host-owned task packet before running these commands.
bash scripts/git-town/doctor.sh
bash scripts/git-town/sync-stack.sh --dry-run

# Perform only allowed edits and issue evals, then commit.
bash scripts/git-town/selftest.sh
bash scripts/git-town/sync-stack.sh
ALLOW_GIT_TOWN_PUSH=1 bash scripts/git-town/sync-stack.sh --publish
bash scripts/git-town/propose.sh --title 'docs: ...' --body-file /host/path/pr-body.md
```

## Background flow

Background mode requires an isolated linked worktree and stops at the first failure:

```bash
ALLOW_GIT_TOWN_PUSH=1 \
  bash scripts/git-town/background-sync.sh start --interval 300 --publish
bash scripts/git-town/background-sync.sh status
bash scripts/git-town/background-sync.sh stop
```

## Integration canary

Static policy checks run without an executable artifact:

```bash
bash scripts/git-town/selftest.sh
```

The wrapper-level live canary requires the independently admitted Git Town
`24.0.0` artifact on the host:

```bash
bash scripts/git-town/selftest.sh --integration
```

Integration mode uses disposable repositories, bare remotes, linked worktrees,
task packets, receipts, and logs. It calls the public wrappers rather than
substituting direct Git Town success. The canary covers parent-first rebase and
publication, proposal base/head binding, stale-remote refusal, actual competing
public-sync lease serialization, semantic conflict preservation and mutation
controls, background repeat/start/status/stop, killed-controller child cleanup,
dirty/missing-packet/stale-lease/unsafe-origin refusal, secret-residue checks,
bounded timeout, stop-on-first-failure, and cleanup. The proposal canary fakes
only the GitHub API boundary. The zero-second timeout uses an executable-boundary
double to deterministically exercise wrapper timeout behavior; it makes no claim
about Git Town internals. Host fixtures are removed unless an operator explicitly
retains one for a failed-run audit.

The exact macOS arm64 artifact admitted by issue #31 exercises this path.
Linux execution remains `ABSENT` until an exact Linux artifact and environment
receive their own admission; successful static checks cannot proxy for it. The
unavailable-SHA-command negative control also reports `ABSENT` with exit `64`
instead of silently treating a missing prerequisite as a test result.

## Failure rule

Any conflict, timeout, dirty state, unknown parent, exact-version/license mismatch, unsafe config, overlapping sync lease, missing eval metadata, path-lease violation, or safe-push disagreement stops the Worker. Scripts do not invoke `git town continue`, `skip`, `undo`, `ship`, semantic conflict edits, merge, or permission widening.

## Version and licensing

The only admitted executable version is `24.0.0`. `GIT_TOWN_REQUIRED_VERSION` may repeat that exact value but may not loosen it to a version line. The exact direct MIT notice is pinned under `third_party/git-town/`; `V24_DEPENDENCY_ADMISSION.md` records the bounded macOS arm64 artifact and transitive-license decision. Executable bytes remain host-owned and may not be committed or distributed. Release-attestation verification remains `NOT_EXERCISED`, and the admission does not promote a Worker image or grant blanket organization legal approval.

## Receipts

Receipts contain issue/Worker, branch and parent, before/after commit identity, fixed command/mode, local and push states, exit/timeout, unmerged paths, eval/path lease, bounded log digest, blocked state, and cleanup. They never contain tokens, passwords, `.env`, private keys, browser profiles, device sessions, or secret values.
