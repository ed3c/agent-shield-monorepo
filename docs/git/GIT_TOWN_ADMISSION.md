# Git Town admission decision

- **Decision:** preferred stacked-PR orchestrator for Agent Shield
- **Pinned version:** `24.0.0`
- **Upstream tag:** `v24.0.0`
- **Direct license:** MIT
- **Vendored notice:** `third_party/git-town/LICENSE`
- **License SHA-256:** `eec8a092b92231375231488d27b959e2fa2be80559c97db60c1b0458d3298791`
- **Policy issue:** [#15](https://github.com/ed3c/agent-shield-monorepo/issues/15)
- **Artifact admission:** [#31](https://github.com/ed3c/agent-shield-monorepo/issues/31), recorded in [`V24_DEPENDENCY_ADMISSION.md`](../../third_party/git-town/V24_DEPENDENCY_ADMISSION.md)

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

Before any executable artifact is admitted, the environment must also record:

- exact `24.0.0` executable version;
- acquisition source and artifact checksum;
- source/provenance identity;
- SBOM or equivalent transitive dependency inventory;
- transitive license review;
- required notices and attribution;
- trademark, patent, export, and distribution considerations;
- organization-specific legal approval where required.

`UNKNOWN`, custom, copyleft, source-available-only, or field-of-use-restricted terms fail closed under the repository licensing policy.

Issue #31 completed those checks for one exact macOS arm64 release artifact. Human Admit permits that artifact's host-local execution, including its seven named MPL-2.0 modules. The executable is not committed or distributed, and no Worker image is promoted by this decision.

Current states:

| Subject | State |
|---|---|
| direct upstream MIT text and vendored byte identity | `PASS` |
| exact version policy | `PASS` as repository configuration |
| exact macOS arm64 archive checksum and build identity | `PASS` for the subject recorded in `V24_DEPENDENCY_ADMISSION.md` |
| 51-module active inventory and license classification | `PASS` for that exact executable |
| seven MPL-2.0 modules | Human Admit for unchanged host-local execution only |
| GitHub release-attestation verification | `NOT_EXERCISED` after three inconclusive attempts |
| binary distribution or Worker-image promotion | `NOT_IMPLEMENTED` and outside the admission |
| organization legal approval beyond this bounded use | Human/organization-owned; not represented by this document |

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
