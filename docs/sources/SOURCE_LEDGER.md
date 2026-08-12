# Source ledger

The ledger records what each source supports and what it does **not** prove. Source locators refer to the supplied conversation export or immutable repository subjects. Access-controlled source bytes are not redistributed here.

## S-001 — `科技巨頭開源授權與AI框架v2.pdf`

- **Kind:** supplied 41-page conversation/PDF export.
- **Original locator:** access-controlled Gemini conversation URL embedded in the export.
- **Repository file name:** `科技巨頭開源授權與AI框架v2.pdf`.
- **Content identity:** SHA-256 `11951b0409e58dac50d1c6cc0130aa838260aafddfb1247e586206dd34548aea`.
- **Coverage:** parsed pages 1–41, lines 1–2638.
- **Repository classification:** `SOURCE_PROPOSAL`.
- **Directly supports:**
  - a proposed local/cloud multi-runtime topology, including E2B, Firecracker, OpenShell, tmux, VFS, and memory components — pages 1–2;
  - tmux persistence, panes/windows, Bash scriptability, and long-running Agent use — page 3, parsed lines 126–139;
  - local/cloud synchronization and repair proposals — pages 3–7 and 39–41;
  - an MVP technology matrix and Bun + TypeScript/Expo tooling direction — pages 11, 20–24;
  - mobile projection, Maestro, WDA, scrcpy, and MCP bridge proposals — pages 15–23 and 36–39;
  - permissive-license intent and explicit exclusion of LGPL/GPL/AGPL/SSPL/BSL — pages 23–25;
  - planned monorepo structures and transaction/security data flows — pages 25–41.
- **Important exact claim:** the source describes E2B as Apache-2.0, Firecracker-based, and capable of sub-150 ms startup for per-task MicroVM isolation — page 1, parsed lines 5–8.
- **Does not prove:** current versions, transitive licenses, operational cost, performance, provider availability, production security, App Store compliance, live credentials, devices, chain execution, or any `PASS` state.
- **Known source overstatements:** statements such as “100% compliant,” “absolute immunity,” fixed security percentages, and complete MVP implementation remain source wording, not repository decisions.
- **Known policy conflict:** the source proposes timestamp-based `newest`/`prefer-beta` file conflict resolution. Agent Shield rejects this for source code and uses Git ancestry, branch ownership, patches, and content identity.

## S-002 — current repository context contracts

- **Subjects:** `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, and `docs/architecture/IMPLEMENTATION_PHASES.md` on `main` before issue #13.
- **Repository classification:** `REPOSITORY_DECISION`.
- **Supports:** six architecture planes, Bun + TypeScript priority, typed cross-module boundaries, explicit evidence states, and rejection of blind newest-wins synchronization.
- **Does not prove:** live provider or product execution.

## S-003 — immutable Agent Shield module release

- **Subject:** `data/releases/agent-shield-module-set.json` at merge commit `a8c3d96d85487bbf6d3f0ff70167381de7084b9c`.
- **Repository classification:** deterministic contract evidence.
- **Supports:** six module IDs, interface versions, root paths, capabilities, runtime declarations, and contract digests for release `agent-shield-module-set@0.1.0`.
- **Live state:** `NOT_EXERCISED`.
- **Does not prove:** origin reachability, bettor initialization, Claude/Codex execution, provider sessions, devices, browsers, hardware, or settlement.

## S-004 — Git Town official project

- **Subjects:** Git Town 24.0 official documentation and `git-town/git-town` license.
- **Repository classification:** external dependency evidence plus bounded `REPOSITORY_DECISION`.
- **Supports:**
  - MIT direct license;
  - team configuration through `git-town.toml` or `.git-town.toml`;
  - `git town sync --stack --non-interactive --push`;
  - feature `rebase` strategy with safe force-push protection;
  - stack breadcrumbs and explicit proposal flow.
- **Does not prove:** zero legal risk, conflict-free unattended operation, portability to an unreviewed artifact/OS, cryptographic release attestation, or suitability for every Git workflow.
- **Repository treatment:** issue #15 chose Git Town for stacked branch orchestration; issue #31 and PR #33 admitted one exact macOS arm64 v24.0.0 artifact for host-local use. The exact 51-module review and seven-module MPL-2.0 Human Admit are recorded in `third_party/git-town/V24_DEPENDENCY_ADMISSION.md`; binary distribution and Worker-image promotion remain outside scope, and release-attestation verification remains `NOT_EXERCISED`.

## S-005 — bettor-arena integration baseline

- **Subjects:** bettor-arena merged Bun/TypeScript project bootstrap, default-deny MCP, origin contract, and Browser Contract v2 releases.
- **Repository classification:** downstream integration contract.
- **Supports:** exact-release project initialization, generated Claude/Codex/Skill/MCP projections, logical GitHub/Forgejo origin modeling, and browser actor/surface/transport/session separation.
- **Does not prove:** Agent Shield's private checkout initialization, Forgejo reachability, subscriptions, signed-in sessions, or environment-owned canaries.

## S-006 — documentation-first stacked-PR request

- **Kind:** current user instruction, captured operationally in epic issue #11 and child issues #13, #15, #17, #19, #21, #22, and #23.
- **Repository classification:** `REPOSITORY_DECISION` after issue admission.
- **Supports:**
  - Git Town as the preferred stacked-PR orchestrator;
  - Bash-managed unattended synchronization;
  - root and per-directory Agent-readable documentation;
  - concise root rules plus Harness narratives;
  - eval-first issues and PRs;
  - path-disjoint parallel Worker Agents;
  - documentation and Git management before product code.

## S-007 — GitHub issue and PR history

- **Kind:** immutable GitHub metadata, merge commits, issue bodies, PR bodies, and exact-head CI results.
- **Repository classification:** delivery provenance.
- **Supports:** why a decision was introduced, which exact branch/commit was tested, and which gaps remained explicitly unexercised.
- **Rule:** an issue or PR description is intent/evidence metadata; only its named execution artifacts can prove a test result.

## S-008 — future external verification

- **Kind:** exact-version official documentation, release, license, SBOM, package metadata, or runtime receipt obtained after this stack.
- **Repository classification:** `ABSENT` until captured.
- **Required before implementation:** current-version and transitive-license review for every proposed third-party dependency; provider-specific security, cost, performance, platform, and distribution claims.

## Source-to-repository transition

```text
supplied source
  → source-ledger entry
  → repository decision or explicit rejection
  → issue with evals and path lease
  → implementation subject
  → deterministic contract evidence
  → environment-owned live canary
  → Human Admit / release
```

Skipping any transition cannot be repaired by stronger prose.
