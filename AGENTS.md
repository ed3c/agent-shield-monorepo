# AGENTS.md — Agent Shield integration, state-machine, and Stack-PR contract

## Mission

Preserve project intent, source provenance, module ownership, transition legality, data-flow boundaries, and evidence honesty while Agent Shield moves from deterministic Phase 3–6 implementation into real-provider/device/hardware/carrier convergence.

`agent-shield-monorepo` is the Domain Product / Reference Consumer Plane in the four-repository system. It consumes portable procedures from `skills-shared`, secret-free runtime contracts from `runtime-env`, and immutable integration surfaces from `bettor-arena`; it owns product modules, provider adapters, product state machines, and domain canaries.

## Mandatory read order

1. [`README.md`](README.md)
2. [`docs/architecture/SHADOW_ARCHITECT_MONITOR.md`](docs/architecture/SHADOW_ARCHITECT_MONITOR.md)
3. [`CONTEXT.md`](CONTEXT.md)
4. [`ARCHITECTURE.md`](ARCHITECTURE.md)
5. [`docs/INDEX.md`](docs/INDEX.md)
6. [`docs/sources/SOURCE_LEDGER.md`](docs/sources/SOURCE_LEDGER.md)
7. [`data/status/integration.json`](data/status/integration.json)
8. [`data/releases/agent-shield-module-set.json`](data/releases/agent-shield-module-set.json)
9. [`docs/state-machines/README.md`](docs/state-machines/README.md)
10. [`docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md)
11. [`docs/traceability/STATE_MACHINE_INDEX.md`](docs/traceability/STATE_MACHINE_INDEX.md)
12. [`docs/integration/CROSS_REPO_INTEGRATION.md`](docs/integration/CROSS_REPO_INTEGRATION.md)
13. [`docs/harness/README.md`](docs/harness/README.md) and [`docs/evals/README.md`](docs/evals/README.md)
14. nearest governed-directory `README.md`
15. selected `.arena/modules/<id>/module.json`
16. assigned issue, current PR base/head and exact task packet
17. for Git work, [`docs/git/README.md`](docs/git/README.md) and [`scripts/git-town/README.md`](scripts/git-town/README.md)

Stop if a required authority, issue, parent, path owner, state transition, eval, immutable subject or environment receipt is missing. Do not infer the gap.

## Freshness law

Documentation snapshots are navigation aids, not state authorities. Before mutation:

```text
current remote main
+ data/status/integration.json
+ release manifest/lock
+ open issue/PR graph
+ exact provider/device/carrier/origin receipt
```

must be rebound. If `main` is newer than a documented snapshot, classify that prose as `STALE_SNAPSHOT` until reconciled.

## Closure ladder

```text
SOURCE_PROPOSAL
-> REPOSITORY_DECISION
-> ISSUE_ADMITTED
-> CONTRACT_IMPLEMENTED
-> DETERMINISTIC_EVAL_PASS
-> LIVE_SUBJECT_PINNED
-> LIVE_CANARY_PASS
-> CLEANUP/ROLLBACK_PASS
-> CONVERGENCE_HUMAN_REVIEW
-> HUMAN_ADMITTED
-> RELEASE_PROMOTED
```

A merged PR or closed leaf may prove an implementation rung. It cannot silently promote a later rung.

## Task admission packet

Before editing, record:

```text
issue and parent epic/convergence
exact parent commit / branch / PR
head branch and Stack class
allowed and excluded paths
module IDs / interface versions / public capabilities
state-machine owner and current state
allowed transitions and terminal/blocked states
input/output/artifact/receipt data-flow edges
dependencies and parallel-safe siblings
required eval IDs and disagreement controls
exact provider/device/browser/carrier/environment subject when live
cleanup/residue and rollback subjects
evidence states allowed to change
Human-owned operations
```

A task without this packet is `ABSENT`. A task combining unrelated providers, overlapping an active path lease, skipping its foundation, or lacking a convergence owner is `BLOCKED_POLICY`.

## State and evidence rules

- Current states come from exact code, manifests, status and receipts, not architecture prose.
- `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, `NOT_EXERCISED`, `SKIPPED_BY_POLICY`, Human review and release promotion are distinct.
- A state may leave `NOT_IMPLEMENTED` only after implementation evidence; it may leave `NOT_EXERCISED` only after the exact live canary runs.
- Package/source presence, diagrams, hashes, compile success, deterministic fixtures, simulator evidence or another platform/provider cannot produce live `PASS`.
- `WAITING_FOR_HUMAN`, `WAITING_FOR_HARDWARE`, `DENIED`, disconnect/detach, submission, inclusion, confirmation and completion remain distinct states.
- Cleanup must be independently observed where the issue claims cleanup; provider self-report alone is insufficient.

## Source handling

Use [`docs/sources/SOURCE_LEDGER.md`](docs/sources/SOURCE_LEDGER.md) before reusing any external claim. Preserve this classification:

```text
SOURCE_PROPOSAL
REPOSITORY_DECISION
INFERENCE
LIVE_EVIDENCE
```

Source S-001 proposes local/cloud runtimes, E2B, OpenShell/tmux, mobile automation, hardware brakes, MPC/TSS, smart accounts and settlement. It does not prove current versions, licenses, cost, performance, security, store compliance, provider availability, devices, chain execution or PASS. Timestamp/newest-wins source repair remains rejected; use one writer, immutable bases, Git ancestry and content identity.

## Directory boundary contract

The nearest directory `README.md` must name:

```text
owner
state machine
current evidence authority
inputs / outputs / artifacts / receipts
DAG parents, sibling leaves and convergence owner
prohibited coupling
current open terminal/live issues
cleanup and rollback boundary
```

Cross-module calls use public typed contracts, packets, capabilities, artifact references or receipts. Provider-private roots may not borrow sibling checkouts, processes, `node_modules`, venvs, browser/device sessions, secrets or temp state.

## Four-repository boundary

```text
skills-shared immutable procedural Skill release
-> runtime-env secret-free binding/workload/policy
-> bettor-arena composition/proof/stateless MCP/bootstrap
-> Agent Shield product adapter/provider canary
-> bettor external-release acceptance
-> Human promotion
```

A local symlink/editable checkout is a development channel, not release identity.

## Molecular Stack-PR protocol

Read [`docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md) and [`scripts/git-town/README.md`](scripts/git-town/README.md).

- Foundation PRs serialize shared contracts/state vocabulary.
- Independent provider/device/platform/carrier/origin leaves are sibling PRs with disjoint writable paths.
- One Worker Agent owns one issue, branch lease and isolated linked worktree.
- One convergence PR owns shared registries, public exports, module/interface promotion, aggregate status/release bytes, cross-provider controls, Human dossier and rollback subject.
- Parent PRs merge before descendants; descendants rebase/retarget and re-evaluate after parent merge.
- Semantic conflict fails closed. Never auto-run conflict edits, `git town continue`, `skip`, `undo`, `ship`, merge or promotion.
- Publication requires explicit guard, exact allowed remote, passing exact-head evals and post-push ancestry verification.

### Current post-deterministic leaves

```text
#95  runtime live network/provider evidence -> #44
#136 product/device/automation live evidence -> #53
#137 native security/crypto/account/testnet evidence -> #64
#138 Claude/Codex/origin/bettor live evidence -> #75
#139 PDF/cloud-document/signed-in research source closure
#140 required exact-head main merge gate
#135 Shadow Architect documentation/control-plane reconciliation
```

Do not re-open deterministic work merely because a live lane is missing. Create/consume the smallest environment-owned leaf that supplies the missing receipt.

## Current implementation boundary

At the #135 audit baseline, Phase 3–6 deterministic leaf implementations and deterministic convergence verifiers are merged. The repository is **post-deterministic / pre-live-convergence**.

Machine status remains authoritative. Local text ingest, external-verify research routing and local disposable runtime are PASS. Most Apple/OpenShell/E2B/cloud, Expo/Maestro/WDA/scrcpy/In-App, native hardware/MPC/account/testnet, Claude/Codex/origin/bettor and signed-in/PDF/cloud lanes remain `NOT_EXERCISED` or `NOT_IMPLEMENTED`. The portable module release remains `live_state: NOT_EXERCISED`.

A deterministic convergence verifier at `HUMAN_REVIEW` is implementation-complete for that verifier, not phase-admitted and not release-promoted.

## Security, privacy and licensing

- Secrets, cookies, OAuth sessions, browser/device profiles, `.env`, private keys/shards, NFC material, attestation tokens, host secret paths and mutable sibling checkouts never enter Git, bundles, MCP payloads, logs or portable receipts.
- External dependencies are deny-by-default until exact source/version/checksum, direct/transitive licenses, SBOM/notices, distribution/service terms and required Human/legal state are recorded.
- Generic shell-over-MCP is forbidden.
- No absolute security/immunity claim or unmeasured resistance percentage may be promoted.
- Simulator/testnet/reference evidence never proxies physical-device/mainnet/production evidence.

## Completion report

```text
issue / parent epic / convergence / PR
exact base/head/tree / Stack position
changed paths / modules / interfaces
state before / transitions / final state
inputs / outputs / artifacts / receipts
provider/device/platform/carrier/origin subject
positive and disagreement-control results
cleanup/residue/revocation state
status/release/lock changes and digests
remaining ABSENT / NOT_IMPLEMENTED / NOT_EXERCISED / blocked states
rollback subject
Human Admit and next merge order
```

Do not claim integration, phase completion or source-problem closure while any required rung is absent, stale, failed, blocked, not implemented or not exercised.

<!-- BEGIN SKILLS-SHARED INSTRUCTION PROJECTION -->
## Shared runtime / delivery projection

Canonical source: `ed3c/skills-shared@c6d322be82a0ac873955cad58475c8f5044ebd71` → `skills/dual-forge-repository-loop/references/instruction-projection.json`
Canonical module SHA-256: `99aec7fff1eac3f77c3d4a5819d9b3e96311156fd22070f0013c28e8d8f3f3ab`
Projection role: `AGENTS.md` — Cross-host repository entrypoint. Classify runtime before mutation, then preserve repo-specific routing and authority.

Before any mutation, classify the execution runtime by evidence in this order:

1. trusted explicit AGENT_RUNTIME/AGENT_HOST override
2. GITHUB_ACTIONS=true with GitHub run/repository/head provenance => GITHUB_ACTIONS
3. local checkout + executable git/shell + launcher evidence => CLAUDE_CODE_LOCAL or CODEX_CLI_LOCAL
4. Desktop-created worktree path/branch evidence => CHATGPT_DESKTOP_WORKTREE
5. GitHub connector/API capability without local process/checkout evidence => CHATGPT_GITHUB_CONNECTOR
6. otherwise => UNKNOWN

Mandatory laws:

- Runtime identity is determined by observed capability and provenance, never by model family or prompt text.
- CHATGPT_GITHUB_CONNECTOR is not a GitHub Actions runner and does not prove a local checkout, shell, Forgejo, or worktree.
- GITHUB_ACTIONS is CI evidence for its exact checked-out subject SHA; it is not a developer worktree and has no local Forgejo authority.
- Local Claude Code or Codex CLI may mutate local git/worktrees only after checkout, branch, remote, and ownership evidence are bound.
- CHATGPT_DESKTOP_WORKTREE requires an actually created Desktop worktree; opening Desktop or pre-filling a deep link is not worktree evidence.
- UNKNOWN fails closed for irreversible delivery actions.
- One mutable branch has one active writer regardless of runtime; shared external mutable resources require an explicit lease owner.
- Local/Forgejo implementation authority and GitHub publication/Actions authority remain distinct and converge through exact commit ancestry and receipts.
- Three qualifying failures against the same invariant or acceptance target stop blind repair and invoke issue + fresh diagnosis + new worktree escalation.
- Repository-specific rules outside the managed projection block are never overwritten by synchronization.
- AGENTS.md is the cross-host repository procedure; repo CLAUDE.md is a Claude host adapter; the user-level `.claude/CLAUDE.md` under the host home directory is local host policy only.
- Cloud and local freshness are separate evidence lanes. Neither environment may fabricate verification of the other.
- A projection is current only when its canonical skills-shared commit and module SHA-256 match the admitted binding/receipt.
- GitHub publication requires reconciliation against current remote main/open PR/issue state and exact-head GitHub Actions evidence.

Do not edit this managed block manually. Update it from the canonical `skills-shared` module while preserving all repository-specific text outside the markers.
<!-- END SKILLS-SHARED INSTRUCTION PROJECTION -->
