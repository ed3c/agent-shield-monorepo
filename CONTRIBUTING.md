# Contributing

Agent Shield uses eval-first stacked PRs. A contributor may be a human or a Worker Agent, but the same ownership, evidence, and review rules apply.

## Before a branch exists

1. Open or select one issue.
2. Define the subject, preconditions, action, observable, negative control, artifact, state transition, and owner.
3. Declare allowed and excluded paths.
4. Declare the parent branch/PR and dependency direction.
5. Keep product/provider implementation out of documentation-only issues.

## Branch model

```text
main
└── foundation
    ├── independent-child-a
    ├── independent-child-b
    └── dependent-child
```

Use a child branch only when it depends on the parent diff. Use siblings for path-disjoint work that shares the same foundation. One worker owns one branch in one isolated worktree.

## Git Town baseline

The admitted team configuration is `.git-town.toml`. Feature branches rebase onto their parents. Perennial branches are fast-forward only. Push hooks remain enabled.

```bash
scripts/git-town/doctor.sh
scripts/git-town/sync-stack.sh --dry-run
scripts/git-town/sync-stack.sh
```

The unattended synchronization subject is:

```bash
git town sync --stack --non-interactive --push --no-auto-resolve
```

A conflict is a failed run. The worker records the suspended state and stops. A new recovery assignment may resolve the conflict and explicitly run `git town continue`; the background worker may not do this itself.

## Pull requests

Every PR body must contain:

- issue and parent PR;
- stack breadcrumb;
- allowed/changed paths;
- eval IDs and negative controls;
- evidence boundary;
- exact head SHA and CI result before merge;
- unresolved `NOT_IMPLEMENTED` and `NOT_EXERCISED` states.

Parent PRs merge before descendants. After a parent merge, sync/rebase descendants, rerun their evals, and retarget them to the new parent.

## Merge and release

`git town ship`, production promotion, keys, sessions, permissions, and Human Admit are not unattended Worker-Agent actions. Use GitHub review/merge controls after exact-head evidence is available.

## Licensing

Dependencies are deny-by-default. A permissive direct license lowers risk but does not remove the need to review exact versions, transitive dependencies, notices, source availability, trademarks, patents, and distribution obligations. See `docs/git/GIT_TOWN_ADMISSION.md` and the general licensing policy delivered by issue #17.