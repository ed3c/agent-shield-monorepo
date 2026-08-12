# Contributing

Agent Shield uses eval-first stacked PRs. A contributor may be a human or a Worker Agent, but the same ownership, evidence, license, and review rules apply.

## Before a branch exists

1. Open or select one issue.
2. Define subject, preconditions, action, observable, negative control, artifact, state transition, and owner.
3. Declare allowed and excluded paths.
4. Declare direct parent branch/PR and dependency direction.
5. Keep product/provider implementation out of documentation-only issues.
6. Record dependencies and licensing review required by the issue.

A task without this packet is `ABSENT`, not ready.

## Branch model

```text
main
└── foundation
    ├── independent-child-a
    ├── independent-child-b
    └── dependent-child
```

Use a child only when it depends on the parent diff. Use siblings for path-disjoint work that shares the same foundation. One Worker owns one branch in one isolated linked worktree. Shared indexes belong to the foundation or a later convergence branch.

## Git Town baseline

The admitted team configuration is `.git-town.toml`. The exact supported executable is Git Town `24.0.0`. Feature branches rebase onto their parents; main/perennial branches are fast-forward only; automatic conflict resolution and implicit publication are disabled; push hooks remain enabled.

```bash
scripts/git-town/doctor.sh
scripts/git-town/sync-stack.sh --dry-run
scripts/git-town/sync-stack.sh
ALLOW_GIT_TOWN_PUSH=1 scripts/git-town/sync-stack.sh --publish
```

The canonical published mutation is:

```bash
git town sync --stack --non-interactive --push --no-auto-resolve
```

For an unattended dedicated worktree:

```bash
ALLOW_GIT_TOWN_PUSH=1 \
  scripts/git-town/background-sync.sh start --interval 300 --publish
```

A conflict, timeout, dirty state, unknown parent, unexpected remote commit, or safe-push refusal is a failed run. The Worker records the blocked/suspended state and stops. It does not resolve semantically or invoke `continue`, `skip`, `undo`, or `ship`.

## Pull requests

Every PR body contains:

- issue and direct parent PR;
- stack breadcrumb and merge order;
- allowed and changed paths;
- eval IDs, results, and negative controls;
- evidence boundary and named exclusions;
- exact head SHA and CI result before merge;
- rollback subject;
- unresolved `NOT_IMPLEMENTED` and `NOT_EXERCISED` states.

Parent PRs merge before descendants. After a parent merge, sync/rebase descendants, rerun their evals, and retarget them to the new direct parent.

## Evidence language

`PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, and `NOT_EXERCISED` are distinct. Source text, diagrams, package presence, another module's proof, and skipped live providers cannot produce `PASS`.

## Merge and release

`git town ship`, GitHub merge, production promotion/rollback, credentials, keys, sessions, permissions, and Human Admit are not unattended Worker actions. Use reviewed GitHub controls only after exact-head evidence is available.

## Licensing

Dependencies are deny-by-default. Git Town `24.0.0` has a directly reviewed MIT notice, but its Worker executable still needs artifact checksum, provenance, SBOM/transitive-license, NOTICE, and distribution review on the execution host. A permissive direct license lowers risk; it does not guarantee absolute zero legal risk. See `docs/git/GIT_TOWN_ADMISSION.md` and `docs/licensing/README.md`.
