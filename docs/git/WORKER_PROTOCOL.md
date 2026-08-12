# Unattended Worker-Agent protocol

## Required environment

- repository contains the reviewed `.git-town.toml`;
- exact Git Town `24.0.0` executable;
- vendored MIT notice passes byte-identity check;
- one isolated linked Git worktree per Worker;
- one immutable task packet per branch;
- network and credentials supplied by the host, never repository files;
- GitHub CLI only for proposal metadata operations.

Executable checksum, SBOM/transitive-license scan, and host authentication are environment-owned evidence. Their absence cannot be replaced by documentation.

## Worker lifecycle

```text
admit issue and evals
→ create isolated worktree
→ bind branch to explicit parent
→ record task packet outside tracked content
→ validate exact version, license, config, clean state, parent and path lease
→ dry-run stack sync
→ mutate only owned paths
→ run evals and negative controls
→ commit exact subject
→ local stack rebase
→ trusted host explicitly publishes safe push
→ create/update parent-targeted PR
→ record receipts
→ preserve or clean worktree according to handoff state
```

## Task packet

The controller supplies:

```text
WORKER_ID
ISSUE_NUMBER
TASK_BRANCH
TASK_PARENT
TASK_EVALS
TASK_ALLOWED_PATHS
```

Optional host metadata may include excluded paths, worktree location, scheduler identity, and retention policy. Host paths are not committed. Task packets and receipts live under the Git common directory with restricted permissions.

## Lease model

- one remote branch has one semantic writer by policy;
- branch creation/proposal uses a branch lease;
- stack synchronization holds a repository-wide process lease because a rebase can rewrite several refs;
- editing on path-disjoint sibling worktrees may continue concurrently;
- a process lease does not prove remote ownership, so safe-push disagreement still fails.

## Preconditions

Before mutation, require:

1. current checkout is an isolated linked worktree for background mode;
2. current branch is not `main`;
3. worktree and index are clean;
4. no merge, rebase, cherry-pick, revert, bisect, or unmerged path exists;
5. current branch and Git Town parent match the task packet;
6. changed paths against the parent are inside the declared path lease;
7. exact Git Town version and vendored license match;
8. team config enforces rebase, ff-only, no auto-resolve, no implicit publish, hooks on, tags/upstream off;
9. no previous failure marker blocks the worktree.

Dirty state is exit `64`; unattended scripts never auto-stash even though Git Town can.

## Synchronization modes

### Plan only

```bash
scripts/git-town/sync-stack.sh --dry-run
```

State: `NOT_EXERCISED`; no ref mutation or push.

### Local rebase

```bash
scripts/git-town/sync-stack.sh
```

Runs stack rebase with `--no-push`. A local green does not claim remote publication.

### Trusted publication

```bash
ALLOW_GIT_TOWN_PUSH=1 \
  scripts/git-town/sync-stack.sh --publish
```

The canonical Git Town mutation subject is:

```bash
git town sync --stack --non-interactive --push --no-auto-resolve
```

Git Town's rebase strategy performs safe force-push protection. Push hooks remain enabled. A safe-push refusal is `FAIL`, not permission to bypass the lease.

### Background publication

```bash
ALLOW_GIT_TOWN_PUSH=1 \
  scripts/git-town/background-sync.sh start --interval 300 --publish

scripts/git-town/background-sync.sh status
scripts/git-town/background-sync.sh stop
```

The daemon is a bounded loop around `sync-stack.sh`; it has no separate merge logic. Any failure stops the loop, preserves the exact worktree, and leaves a receipt. The scheduler may restart only after reviewed recovery clears the blocked state.

## Receipt contract

Every sync attempt records:

- issue, Worker, branch and parent;
- exact Git Town version;
- fixed command and mode;
- before/after commit IDs;
- local result and independent push state;
- exit and timeout state;
- unmerged paths;
- eval/path-lease metadata;
- bounded log digest;
- cleanup/blocked state and timestamps.

Logs and receipts exclude tokens, credential-bearing URLs, browser profiles, device sessions, `.env`, private keys, and secret values.

## Failure protocol

### Conflict or suspended command

```text
Git Town exits nonzero
→ FAIL receipt
→ worktree marked BLOCKED
→ process lease released
→ branch/worktree and suspended state preserved
→ recovery assignment names semantic owners and regression evals
```

The background Worker does not run `git town continue`, `skip`, `undo`, `ship`, or conflict edits. A human or dedicated recovery Agent acts only under a new bounded assignment, then reruns all affected evals.

### Remote single-writer disagreement

Safe force-push refusal or unexpected remote commits are `FAIL`. Integrate and review the remote commits; never bypass `--force-with-lease` safeguards.

### Missing executable, auth, network, or proposal provider

Use `ABSENT` or `NOT_EXERCISED` according to the named subject. A local rebase cannot proxy for a pushed branch or created PR.

### Timeout or residue

Timeout is a distinct failure. Leaked process, lock, worktree, log, or suspended Git operation is reported independently from task outcome.

## Cleanup

- transient process lease is removed on every normal/failure exit;
- failed worktrees remain preserved and blocked;
- successful worktrees remain until branch, PR, receipts, and handoff are confirmed;
- no branch with unshipped changes is deleted automatically;
- background PID/log state stays under the Git common directory.
- background controller/child records bind PID and child process group to
  host-generated run tokens visible in their owning commands; a reused or
  unverifiable PID/PGID is never signaled, and group residue keeps its state
  for diagnosis instead of being reported as clean.

## Human-owned operations

Merge, `git town ship`, branch-protection changes, permission widening, production promotion/rollback, key/session authority, and legal acceptance are not unattended Worker actions.
