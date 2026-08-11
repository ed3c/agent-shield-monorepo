# Git Town admission decision

- **Decision:** preferred stacked-PR orchestrator for Agent Shield
- **Admitted documentation line:** Git Town 24.0
- **Direct license:** MIT
- **Issue:** [#15](https://github.com/ed3c/agent-shield-monorepo/issues/15)
- **State:** configuration and Bash integration implemented in this documentation/Git-management PR; runtime installation evidence remains environment-owned

## Why this is the best fit for the stated constraints

Agent Shield requires a local-first tool that understands branch parentage, stacked rebases, safe pushes, non-interactive operation, and GitHub/Forgejo-style forges while remaining scriptable from Bash. Git Town exposes these operations through normal Git commands and repository configuration instead of requiring a proprietary hosted review service.

The selected unattended subject is supported by the official 24.0 command contract:

```bash
git town sync --stack --non-interactive --push --no-auto-resolve
```

The repository sets feature synchronization to `rebase`, main/perennial synchronization to `ff-only`, stack breadcrumbs to `stacks`, branch sharing to `push`, and push hooks to enabled.

## License treatment

Git Town's repository license grants permission to use, copy, modify, merge, publish, distribute, sublicense, and sell copies under the MIT conditions. Distribution must retain the copyright and permission notice, and the software is provided without warranty.

This is a low-risk permissive direct license for commercial use, but **not a guarantee of absolute zero legal risk**. Before a production toolchain is admitted, the environment must also record:

- exact executable version and acquisition source;
- release checksum or trusted package-manager identity;
- transitive dependency and build-artifact licenses;
- required notices;
- trademark and patent considerations;
- organization-specific legal review when distribution changes.

`UNKNOWN`, copyleft, source-available-only, or field-of-use-restricted terms fail closed.

## Version policy

The Bash wrappers accept the configured `24.0` line by default and allow a stricter exact value through `GIT_TOWN_REQUIRED_VERSION`. A new minor or major line requires:

1. official command/config compatibility review;
2. direct and transitive license review;
3. planted green-sync and conflict controls;
4. receipt-schema compatibility;
5. a dedicated PR and Human Admit.

## Safety boundary

Git Town may update branch ancestry and safely force-push rebased commits. Therefore:

- each branch has one writer;
- tracking branches are not shared writable scratch spaces;
- workers use isolated worktrees;
- pre-push hooks remain enabled;
- `--no-auto-resolve` is mandatory in unattended sync;
- a conflict stops the worker;
- automatic `continue`, `skip`, `undo`, `ship`, or semantic conflict editing is forbidden;
- GitHub merge/review remains human-owned.

## Alternatives

A hosted stacked-review product may provide a polished UI but introduces a separate service and commercial terms. Raw Git/Bash minimizes dependencies but makes parent inference, safe stack rebasing, and proposal maintenance bespoke. Git Town is chosen as the smallest admitted orchestration layer while Git remains canonical.

## Evals

- **E10.1:** direct and transitive license admission
- **E10.2:** unattended green stack sync
- **E10.3:** conflict fail-closed
- **E10.4:** concurrent worktree/branch isolation
- **E10.5:** eval-first stack proposal