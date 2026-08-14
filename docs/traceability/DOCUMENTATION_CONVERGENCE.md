# Documentation-stack convergence and implementation handoff

## Exact audit subject

Issue [#23](https://github.com/ed3c/agent-shield-monorepo/issues/23) audits the clean post-PR-#33 `main` rather than an unmerged sibling branch:

| Field | Exact value |
|---|---|
| Parent commit | `533583eff9b647006a001b69f57db3895dc5e8b1` |
| Parent tree | `c1d1f0b47c1e398e074025c4a094374e0b52dab2` |
| Convergence branch | `docs/60-index-convergence` |
| Product TypeScript tree-list digest | `3cd1e6c9f28b104bd0de595978349f6c5f6989dfe00a1b3e638252d10cc0bb70` before and after the documentation stack |
| Integration-status blob | `e70321479185b20c168e6b6db5247a8d8d8f7a6c` before and after the documentation stack |

The product digest hashes the Git mode/type/blob/path rows for tracked TypeScript files under `apps/`, `services/`, `packages/`, and `types/`. It is a no-drift comparison, not provider execution evidence.

## Merged delivery identities

GitHub's recorded PR head and landed commit are both retained because stacked retarget/merge behavior can make them different Git subjects. “Merged” does not imply that every original feature head is a direct ancestor of the final `main`; content and delivery provenance are recorded separately.

| Issue | PR | Branch | Exact reviewed head | GitHub landed commit |
|---|---|---|---|---|
| #13 | [#25](https://github.com/ed3c/agent-shield-monorepo/pull/25) | `docs/00-intent-traceability` | `83a270b33ca65a29c1856ff20cf53469c1a21761` | `09d1b565cf8799cf345c8fe0ff8c905a0adb5ad5` |
| #17 | [#26](https://github.com/ed3c/agent-shield-monorepo/pull/26) | `docs/20-runtime-source-flows` | `3953dde6bc244d24094c025a5db625d58c46aee1` | `83a270b33ca65a29c1856ff20cf53469c1a21761` |
| #15 | [#27](https://github.com/ed3c/agent-shield-monorepo/pull/27) | `docs/10-git-town-governance` | `bbd0263071a43b615aa493ea5a99d7b4ea42bdfd` | `d51463450e2bdec9f3155ff618456966336d8c6b` |
| #19 | [#28](https://github.com/ed3c/agent-shield-monorepo/pull/28) | `docs/30-apps-services-readmes` | `93514dea943e3a816cd59252e5bf7f1f25f71189` | `0d6f316fcf031e1416167dee582375b885bdf2ba` |
| #21 | [#29](https://github.com/ed3c/agent-shield-monorepo/pull/29) | `docs/40-control-plane-readmes` | `83ef4a5ba9b1a4f55d15574315d71db9b1cf73e3` | `5e09734da48caee205a045d0db1a1f1ffe943341` |
| #22 | [#30](https://github.com/ed3c/agent-shield-monorepo/pull/30) | `docs/50-harness-evals` | `0fc37b16149a73988206f09f9e1bec223ab8d19c` | `60fbe036f5ff544c3a9a557f10c67cfddfec0e21` |
| #31 Phase A | [#33](https://github.com/ed3c/agent-shield-monorepo/pull/33) | `fix/31-git-town-artifact-admission` | `edaee5ab0ab249487f35c7d5ee9c5da63d15f659` | `533583eff9b647006a001b69f57db3895dc5e8b1` |

All seven PRs are merged and had successful exact-head checks recorded by GitHub. PR #33's landed tree equals its reviewed-head tree. Issue #31 remains open after its Phase B canaries ran: the Linux part of GT-LIVE-006, release-attestation verification, and Worker-image promotion are still outstanding.

## Canonical authority map

| Topic | Single canonical owner | Expansion/index rule |
|---|---|---|
| project intent and phase boundary | `docs/intent/PROJECT_INTENT.md` | root README summarizes only |
| supplied-source claims | `docs/sources/SOURCE_LEDGER.md` | source IDs preserve proposal wording |
| current architecture | `ARCHITECTURE.md` | `docs/architecture/` expands phases/flows/plans |
| repository decisions | `docs/decisions/README.md` | tool-local admission may be canonical when explicitly indexed |
| dependency policy | `docs/licensing/README.md` | exact tool evidence stays beside the tool |
| Git/stack/Worker policy | `docs/git/` | Git commits, trees, refs, PRs, CI remain canonical facts |
| Harness lifecycle | `docs/harness/` | eval definitions stay in `docs/evals/` |
| reusable eval vocabulary | `docs/evals/` | issue instances name exact subjects |
| directory ownership | nearest `README.md` | `.arena/README.md` explicitly covers `.arena/modules/` catalog |
| evidence-state ledger | `data/status/integration.json` | prose cannot promote its states |
| immutable module release | `data/releases/agent-shield-module-set.json` | generated digest changes do not imply live execution |

## E60 results and negative controls

| Eval | Result | Exact observable | Planted disagreement |
|---|---|---|---|
| E60.1 exact-main source | `PASS` | clean commit/tree above; `main` and `origin/main` agreed at admission | stale pre-stack commit was rejected as the parent |
| E60.2 link and trace closure | `PASS` | all 81 tracked Markdown files had resolvable relative-link targets; 29 intent/source/decision/flow definitions and 14 reusable eval IDs were unique | missing relative target and duplicate `S-001` were detected |
| E60.3 authority uniqueness | `PASS` | canonical map above assigns each normative topic once | a second owner for a mapped topic is a conflict, not a tie-break |
| E60.4 nearest README coverage | `PASS` | 52 tracked governed directories had a nearest README; `.arena/modules/` has an explicit parent contract | a planted new governed directory without README was detected |
| E60.5 stack/PR closure | `PASS` | seven merged PRs map to issues, reviewed heads, and landed commits; no open PR preceded #23 | stale parent and unrecorded PR/branch identities fail the mapping |
| E60.6 template closure | `PASS` | issue and PR templates name requirement refs, subject/owner, preconditions, action, assertion/observable, control, artifact, exit/state, cleanup, exclusions, and rollback | an incomplete packet was rejected |
| E60.7 evidence honesty | `PASS` | integration-status blob and product TypeScript digest are unchanged | an unreceipted `PASS` or changed status blob fails closure |
| E60.8 Agent cold start | `NOT_EXERCISED` | mandatory read order and task-admission fields exist; no fresh Claude/Codex model session was started merely to manufacture evidence | missing read-order/task field is statically detectable, but cannot turn the live lane green |
| E60.9 no product drift | `PASS` | product TypeScript digest matches the pre-stack baseline | any modified product TypeScript path changes the digest |
| E60.10 negative-control bundle | `PASS` | each load-bearing deterministic check above demonstrated disagreement | controls are listed per eval rather than inferred from green prose |

No provider, browser, device, hardware, wallet, chain, bettor, production, organization-legal, or release-attestation lane changes state through this audit.

## Remaining evidence gaps

| State | Remaining subject |
|---|---|
| `NOT_IMPLEMENTED` | PDF provider, cloud runtime, security/settlement providers, binary distribution, Worker-image promotion, and other exact subjects in `data/status/integration.json` |
| `NOT_EXERCISED` | private bettor initialization; Claude/Codex/Forgejo/signed-in-browser live lanes; Git Town release attestation; Agent cold-start canary |
| `PASS` on the admitted macOS arm64 host artifact | GT-LIVE-002 through GT-LIVE-005 and the macOS part of GT-LIVE-006, as recorded by `docs/git/GIT_TOWN_ADMISSION.md` |
| `ABSENT` | the Linux part of GT-LIVE-006; no Linux runtime claim is made |
| Human-owned | expanded legal/distribution approval, production promotion, credentials/sessions, merge, keys, custody, device/hardware, and chain authority |

## Next admitted work

After the issue #23 convergence PR merges, the next work is not a blanket implementation authorization:

1. [#32](https://github.com/ed3c/agent-shield-monorepo/issues/32) may implement the Bun + TypeScript mechanical documentation/eval/README/stack validator against these frozen contracts.
2. [#31](https://github.com/ed3c/agent-shield-monorepo/issues/31) Phase B ran GT-LIVE-002 through GT-LIVE-006 without expanding the v24 host-only artifact boundary; what remains is Human-owned Worker-image promotion.
3. Blocked epics [#3](https://github.com/ed3c/agent-shield-monorepo/issues/3) through [#6](https://github.com/ed3c/agent-shield-monorepo/issues/6) must first be decomposed into molecular eval-first children with exact dependencies, path owners, evidence boundaries, and Human gates. Their epic descriptions alone do not admit implementation.

#32 and #31 Phase B can be reconsidered as path-disjoint siblings only after their task packets prove non-overlap. Product/provider work remains blocked until its own child issue is admitted.
