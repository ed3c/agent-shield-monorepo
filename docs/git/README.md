# Git Town and Worker governance

This directory owns the repository's Git Town policy, stacked-branch method, Worker protocol, and dependency admission narrative. Executable Bash operators live in [`../../scripts/git-town/`](../../scripts/git-town/README.md).

## Git/Worker state machine

```text
TASK_PACKET_ABSENT
  → PACKET_VALIDATED
  → LINKED_WORKTREE_CREATED
  → BRANCH/PATH/REPOSITORY_LEASED
  → DOCTOR_PASS
  → DRY_RUN_PASS
  → LOCAL_SYNCED
  → EVALS_PASS
  → OPTIONAL_GUARDED_PUBLICATION
  → PR_PROPOSED
  → HUMAN_REVIEW
  → MERGED | REJECTED | RECOVERY_ASSIGNED
```

Blocked outcomes include dirty/shared checkout, unsafe origin, missing task/eval/path metadata, wrong parent, lease collision, prompt, timeout, semantic conflict, push disagreement, stale subject, or cleanup failure.

## Data flow

```text
issue + evals + path lease + exact parent
  → isolated worktree/branch/task packet
  → exact Git Town artifact/config
  → dry-run/no-push sync
  → eval and mutation receipts
  → optional two-guard safe publication
  → PR parentage
  → Human merge
```

## Current exact evidence

- admitted executable: Git Town `24.0.0`, host-local macOS arm64 only;
- GT-LIVE-002 parent-first rebase/publication: `PASS`;
- GT-LIVE-003 competing public sync/lease serialization: `PASS`;
- GT-LIVE-004 semantic conflict preservation: `PASS`;
- GT-LIVE-005 background lifecycle/stop-on-failure: `PASS`;
- GT-LIVE-006 macOS cleanup/secret-residue package: `PASS`;
- Linux exact artifact/environment: `ABSENT`;
- upstream release attestation: `NOT_EXERCISED`;
- promoted Worker image: `NOT_IMPLEMENTED`.

Git Town execution success proves branch movement only. It cannot proxy implementation evals, PR review, release, provider, security, or production state.

## Molecular implementation use

The Phase 3–6 branch DAG is [`../implementation/STACKED_IMPLEMENTATION_PLAN.md`](../implementation/STACKED_IMPLEMENTATION_PLAN.md). Foundations serialize shared contracts; path-disjoint provider leaves are sibling PRs; convergence branches start from exact merged `main` and own shared registries/status/release.

## Documents

- [`GIT_TOWN_ADMISSION.md`](GIT_TOWN_ADMISSION.md)
- [`STACKED_PRS.md`](STACKED_PRS.md)
- [`WORKER_PROTOCOL.md`](WORKER_PROTOCOL.md)
- [`../../third_party/git-town/README.md`](../../third_party/git-town/README.md)

No Worker may auto-run semantic conflict edits, `continue`, `skip`, `undo`, `ship`, merge, permission widening, Human Admit, release promotion, or production rollback.
