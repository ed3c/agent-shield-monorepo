# Repository eval catalog

These IDs are reusable families. An issue instantiates them against an exact subject and adds task-specific fields from `EVAL_SCHEMA.md`.

## Governance and documentation

| ID | Family | Core assertion | Required negative control |
|---|---|---|---|
| `EV-DOC-SOURCE` | source traceability | every requirement links to source, decision, owner, issue, eval, and evidence state | duplicate/missing source or ungrounded completion claim |
| `EV-DOC-SSOT` | authority uniqueness | one canonical document owns each normative topic | conflicting parallel canonical |
| `EV-DOC-LINK` | link closure | every required relative link resolves at the exact tree | broken or stale link |
| `EV-DIR-LOCAL` | nearest README sufficiency | root context + nearest README identifies owner, boundary, states, evals and prohibitions | remove owner/public boundary/non-goal |
| `EV-DIR-COVERAGE` | governed-directory coverage | every included directory has README or named exclusion | add uncovered governed directory |
| `EV-GIT-STACK` | stacked ancestry | branch/PR parent graph matches task packets and Git Town metadata | stale/wrong parent or orphan branch |
| `EV-GIT-SYNC` | unattended rebase | clean stack rebases non-interactively and records receipt | dirty tree, duplicate lease, semantic conflict, unsafe remote head |
| `EV-LICENSE-ADMIT` | dependency admission | exact source/artifact/version/license/SBOM/notice record satisfies policy | unknown/forbidden license or changed artifact |

## Module and contract

| ID | Family | Core assertion | Required negative control |
|---|---|---|---|
| `EV-CONTRACT-SCHEMA` | typed packet validation | allowed packet round-trips and invalid shapes fail before effects | missing/extra/wrong/stale field |
| `EV-MODULE-OWNER` | single path owner | every governed path maps to one module or reviewed non-module class | overlapping/missing ownership |
| `EV-MODULE-CLOSURE` | subject digest | closure changes only for owned bytes or transitive dependencies | unrelated module change; changed dependency |
| `EV-PUBLIC-CONTROL` | public-port behavior | public CLI/API/MCP port produces expected exits/artifacts/effects | private helper green but public port broken |
| `EV-MUTATION-HOLLOW` | guard value | removing one load-bearing guard or hollowing output turns red | guard disabled or empty artifact |
| `EV-COMPAT-REPLAY` | interface compatibility | previous valid corpus remains accepted under unchanged interface version | old request rejected or exit semantics drift |

## Document ingest example

Instantiate:

- `EV-CONTRACT-SCHEMA` for `document.ingest/v1` request/receipt;
- `EV-PUBLIC-CONTROL` from the public ingest port;
- `EV-MUTATION-HOLLOW` with empty output or incorrect source digest;
- `EV-LICENSE-ADMIT` before adding a PDF parser.

Expected states:

- local UTF-8 deterministic path may be `PASS` when actually run;
- missing file/tool is `ABSENT`;
- current PDF/cloud adapter is `NOT_IMPLEMENTED`;
- parser installed but not run is `NOT_EXERCISED`.

## Source verification/research example

Instantiate:

- `EV-DOC-SOURCE` for every claim and citation;
- `EV-CONTRACT-SCHEMA` for `research.route/v1`;
- `EV-PUBLIC-CONTROL` for raw/static primary route;
- live browser canary only for the exact signed-in adapter/session owner.

Negative controls include a stale source ref, fabricated quote, browser fallback without evidence downgrade, or private profile borrowed from another environment.

## Runtime selection example

Instantiate:

- `EV-CONTRACT-SCHEMA` for `runtime.provider/v1`;
- `EV-PUBLIC-CONTROL` for fresh workspace, exact env allowlist, artifacts and exits;
- cleanup control for worktree/process/lease/cloud runtime;
- live canary separately for Apple Container, OpenShell/tmux, E2B or another exact provider.

A deterministic disposable-worktree green cannot proxy for a cloud MicroVM or local container.

## Git Town stack example

Instantiate:

- `EV-GIT-STACK` for branch parent and PR base;
- `EV-GIT-SYNC` for dry-run, local no-push and trusted publish lanes;
- `EV-LICENSE-ADMIT` for exact Git Town artifact;
- cleanup control for process/branch/repository lease and suspended state.

Negative controls: wrong parent, dirty worktree, duplicate lease, semantic conflict, unexpected remote head, missing publish guards. `git town ship` and semantic recovery remain human/dedicated-recovery actions.

## Bettor initialization example

Instantiate:

- `EV-MODULE-CLOSURE` for exact Agent Shield release and selected bettor closure;
- `EV-CONTRACT-SCHEMA` for consumer requirements/lock;
- `EV-PUBLIC-CONTROL` for project plan/apply/verify/rollback;
- Claude and Codex adapter canaries as separate lanes;
- origin/equivalence receipt for GitHub/Forgejo.

Missing private checkout or unreachable origin is `ABSENT`; deterministic release contract green is not live initialization.

## Mobile adapter example

Instantiate:

- `EV-CONTRACT-SCHEMA` for bounded precompiled actions;
- `EV-PUBLIC-CONTROL` through the external adapter or authenticated in-app boundary;
- accessibility-ID mutation control;
- independent local simulator/device and cloud-provider canaries;
- cleanup for WDA/ADB/Maestro/scrcpy processes, sessions and artifacts.

Unknown action, missing auth/device/session, or unimplemented provider cannot be read as a successful refusal of the full workflow.

## Security boundary example

Instantiate:

- `EV-CONTRACT-SCHEMA` for closed intent/challenge/evidence packets;
- deterministic refusal before side effects;
- provider-specific cryptographic/hardware/ledger/settlement evals;
- adversarial and recovery controls;
- Human Admit before custody, permissions, chain authority or production promotion.

Typed validation is not MPC, Secure Enclave/NFC attestation, smart-account audit, testnet settlement, or production security.

## Evidence-state regression

Every issue changing a state declaration adds an assertion that all unrelated capability states remain unchanged. A status file or README cannot promote a lane without the receipt that owns that lane.
