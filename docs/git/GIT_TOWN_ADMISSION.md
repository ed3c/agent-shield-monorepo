# Git Town admission decision

- **Decision:** preferred stacked-PR orchestrator for Agent Shield
- **Pinned version:** `24.0.0`
- **Upstream tag:** `v24.0.0`
- **Direct license:** MIT
- **Vendored notice:** `third_party/git-town/LICENSE`
- **License SHA-256:** `7bc26795871e4f7f5b89aaa68cd0318283530abaf0e0b4f72a0ce88fa7d0ff7d`
- **Issue:** [#15](https://github.com/ed3c/agent-shield-monorepo/issues/15)

## Why it fits

Agent Shield needs a local-first tool that understands branch parentage, stacked rebases, safe pushes, non-interactive operation, and GitHub/Forgejo-style proposal ancestry while remaining callable from Bash. Git Town provides these operations through Git refs and repository configuration instead of requiring a proprietary hosted review service.

The admitted publication subject is:

```bash
git town sync --stack --non-interactive --push --no-auto-resolve
```

The repository policy uses:

- feature synchronization: `rebase`;
- main/perennial synchronization: `ff-only`;
- interactivity: disabled;
- automatic conflict resolution: disabled;
- pre-push hooks: enabled;
- new-branch sharing and push-by-default: disabled;
- tag and upstream synchronization: disabled;
- stack breadcrumbs: enabled for stacked PRs.

Bash wrappers own mutation. Local sync uses `--no-push`; remote publication requires both `--publish` and `ALLOW_GIT_TOWN_PUSH=1` from the trusted Worker host. The background operator calls the same bounded sync wrapper rather than maintaining a second implementation.

## Direct license treatment

The upstream MIT text permits use, copy, modification, merging, publication, distribution, sublicensing, and sale subject to retaining the copyright and permission notice. This is a permissive direct license suitable for commercial use, but **not a guarantee of absolute zero legal risk**.

Before an executable artifact is admitted on a Worker image, the environment must also record:

- exact `24.0.0` executable version;
- acquisition source and artifact checksum;
- source/provenance identity;
- SBOM or equivalent transitive dependency inventory;
- transitive license review;
- required notices and attribution;
- trademark, patent, export, and distribution considerations;
- organization-specific legal approval where required.

`UNKNOWN`, custom, copyleft, source-available-only, or field-of-use-restricted terms fail closed under the repository licensing policy.

Current states:

| Subject | State |
|---|---|
| direct upstream MIT text and vendored byte identity | `PASS` |
| exact version policy | `PASS` as repository configuration |
| Worker executable checksum/SBOM/transitive scan | `NOT_EXERCISED` until installed by the host |
| organization legal approval | Human/organization-owned; not represented by this document |

## Safety boundary

Git Town may update branch ancestry and safely force-push rebased commits. Therefore:

- each branch has one writer;
- each Worker uses an isolated linked worktree;
- stack synchronization holds a repository-wide process lease;
- the worktree must be clean; unattended scripts never stash;
- `--no-auto-resolve` is mandatory;
- a conflict or safe-push disagreement stops the worker and writes a failure receipt;
- automatic `continue`, `skip`, `undo`, `ship`, merge, semantic edit, permission widening, or release promotion is forbidden;
- Human Admit and GitHub review own merge and release.

## Alternatives

Raw Git/Bash would avoid one dependency but make parent inference, safe stack rebasing, and proposal maintenance bespoke. Hosted stacked-review products add separate service and commercial terms. Git Town is admitted as the smallest permissive orchestration layer while Git commits, trees, refs, PRs, and CI remain canonical.

## Upgrade rule

Any version change is a new dependency-admission event. Update version, license identity, artifact provenance, SBOM/transitive review, command/config compatibility, green/conflict controls, and receipt schema in one dedicated PR.

## Evals

- **E10.1:** direct and transitive license admission
- **E10.2:** unattended green stack sync
- **E10.3:** conflict fail-closed
- **E10.4:** concurrent worktree/branch isolation
- **E10.5:** eval-first stack proposal
