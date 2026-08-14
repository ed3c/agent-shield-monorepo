# AGENTS.md — Agent Shield integration, state-machine, and Stack-PR contract

## Mission

Preserve project intent, source provenance, module ownership, transition legality, data-flow boundaries, and evidence honesty while the repository implements its Phase 3–6 roadmap through eval-first molecular Stacked PRs. Bun + TypeScript are the primary implementation stack; Bash remains limited to the admitted Git Town/process Harness.

`agent-shield-monorepo` is the **Domain Product / Reference Consumer Plane** in the four-repository system. It consumes portable procedures from `skills-shared`, secret-free runtime contracts from `runtime-env`, and immutable integration surfaces from `bettor-arena`; it owns product modules, provider adapters, product state machines, and domain canaries.

## Mandatory multi-hop read order

1. [`README.md`](README.md)
2. [`CONTEXT.md`](CONTEXT.md)
3. [`ARCHITECTURE.md`](ARCHITECTURE.md)
4. [`docs/INDEX.md`](docs/INDEX.md)
5. [`docs/architecture/DOCUMENT_ROUTING.md`](docs/architecture/DOCUMENT_ROUTING.md)
6. [`docs/intent/PROJECT_INTENT.md`](docs/intent/PROJECT_INTENT.md)
7. [`docs/sources/SOURCE_LEDGER.md`](docs/sources/SOURCE_LEDGER.md)
8. [`docs/state-machines/README.md`](docs/state-machines/README.md) through the standard route [`docs/architecture/STATE_MACHINES.md`](docs/architecture/STATE_MACHINES.md)
9. [`docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md)
10. [`docs/traceability/STATE_MACHINE_INDEX.md`](docs/traceability/STATE_MACHINE_INDEX.md) through [`docs/traceability/TRACEABILITY_INDEX.md`](docs/traceability/TRACEABILITY_INDEX.md)
11. [`docs/integration/CROSS_REPO_INTEGRATION.md`](docs/integration/CROSS_REPO_INTEGRATION.md)
12. [`docs/harness/README.md`](docs/harness/README.md) and [`docs/evals/README.md`](docs/evals/README.md)
13. the nearest `README.md` for every path you may change
14. the selected `.arena/modules/<id>/module.json`
15. `data/status/integration.json`, the assigned issue, current PR base/head, and exact task packet
16. for Git work: [`docs/git/README.md`](docs/git/README.md) and [`scripts/git-town/README.md`](scripts/git-town/README.md)

Stop if a required route, authority, issue, parent, path owner, state transition, eval, or immutable subject is missing. Do not infer the gap.

## Shared document-route interface

This repository implements the common route names used by `skills-shared`, `runtime-env`, and `bettor-arena`:

```text
README.md
AGENTS.md
CLAUDE.md
CONTEXT.md
ARCHITECTURE.md
docs/INDEX.md
docs/architecture/DOCUMENT_ROUTING.md
docs/architecture/STATE_MACHINES.md
docs/integration/CROSS_REPO_INTEGRATION.md
docs/traceability/TRACEABILITY_INDEX.md
<governed-directory>/README.md
```

A standard route may forward to an existing canonical document, but it must leave a local summary and name the direct owner. README files never replace manifests, TypeScript contracts, status ledgers, scripts, verifiers, receipts, or Git history.

## Task admission packet

Before editing, record:

```text
issue and parent epic
parent branch / parent PR / exact parent commit
head branch and Stack class
allowed and excluded paths
module IDs / interface versions / public capabilities
state-machine owner and current state
allowed transitions and terminal/blocked states
input/output/artifact/receipt data-flow edges
dependencies and parallel-safe siblings
required eval IDs and disagreement controls
evidence states allowed to change
cleanup and rollback subjects
Human-owned operations
```

A task without this packet is `ABSENT`. A task that combines unrelated provider leaves, overlaps an active path lease, skips its foundation, or has no convergence owner is `BLOCKED_POLICY`.

## State-machine rules

- Current states come from exact code, manifests, status, and receipts—not architecture prose.
- An issue may implement only transitions named in its issue contract.
- A provider-specific issue owns its private adapter path and receipt. Shared registries, public index exports, module versions, `data/status/integration.json`, release manifests, and aggregate indexes belong to the phase convergence issue.
- Invalid transition skipping, stale subject reuse, unsupported fallback, and cleanup failure must turn red.
- `WAITING_FOR_HUMAN`, `WAITING_FOR_HARDWARE`, `DENIED`, disconnect/detach, submission, inclusion, confirmation, and completion are distinct states.
- A state may leave `NOT_IMPLEMENTED` only after implementation evidence; it may leave `NOT_EXERCISED` only after the exact live canary runs.

## Evidence vocabulary

```text
PASS
FAIL
ABSENT
NOT_IMPLEMENTED
NOT_EXERCISED
SKIPPED_BY_POLICY
```

Package presence, prose, diagrams, source claims, hashes, optional skips, another platform, or another provider cannot produce `PASS`. A job that never received a runner is `NOT_EXERCISED`; a deliberately unrequested job is `SKIPPED_BY_POLICY`.

## Source handling

Use the source ledger before reusing a claim. Preserve source terminology and classify repository treatment separately:

```text
SOURCE_PROPOSAL
REPOSITORY_DECISION
INFERENCE
LIVE_EVIDENCE
```

Source `S-001` proposes local/cloud/hybrid runtimes, E2B, OpenShell/tmux, mobile projection/testing, hardware brakes, MPC/TSS, smart accounts, ledgers, and settlement. It also proposes timestamp-based file conflict resolution. The repository preserves that proposal but rejects `newest`, `prefer-cloud`, and `prefer-beta` as source-code authorities; use one writer, Git ancestry, immutable bases, content-bound patches, review, and rebase.

Do not silently correct, merge, or promote source claims. Exact current provider/license/performance/cost/security facts require their own admission and live receipts.

## Module and directory boundaries

- A module may read its own private implementation.
- Cross-module calls use public typed contracts, packets, capabilities, artifact references, or receipts.
- The nearest directory `README.md` defines owner, local state machine, inputs, outputs, data-flow edges, prohibited coupling, current evidence, and terminal implementation issues.
- Leaf `src/` READMEs inherit their parent state machine and must not create a second public interface.
- New public/control/provider directories require the nearest README and an eval-first issue in the same PR.
- Planned directories remain documentation only until an issue admits their paths.
- No provider may silently borrow a sibling live checkout, process, `node_modules`, venv, browser/device session, secret, or owner temp state.

## Four-repository boundary

```text
skills-shared immutable procedural Skill release
→ runtime-env secret-free binding/workload/policy
→ bettor-arena composition/proof/stateless MCP/bootstrap
→ Agent Shield product adapter/provider canary
→ bettor external-release acceptance
→ Human promotion
```

A local symlink or editable checkout is a development channel, not release identity. Read [`docs/integration/CROSS_REPO_INTEGRATION.md`](docs/integration/CROSS_REPO_INTEGRATION.md).

## Molecular Stack-PR protocol

Read the canonical DAG in [`docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md).

- A foundation PR serializes shared contracts and state-machine vocabulary.
- Independent provider/product/platform/origin adapters are sibling PRs with disjoint writable paths.
- A real data/interface dependency may create a child PR; lexical names alone do not.
- One convergence PR owns shared registries, module/interface promotion, aggregate status/release bytes, cross-provider controls, and Human dossier.
- One Worker Agent owns one branch lease in one isolated linked worktree.
- Parent PRs merge before descendants; descendants are retargeted, synchronized, and re-evaluated after parent merge.
- An unattended semantic conflict fails closed and preserves the worktree/receipt. Never auto-run conflict edits, `git town continue`, `skip`, `undo`, `ship`, merge, or promotion.
- Default synchronization is dry-run then local no-push. Publication requires the explicit CLI guard, environment guard, exact allowed remote, passing exact-head evals, and post-push ancestry verification.

Git Town manages branch movement only. Its exit `0` is not implementation, review, release, or production evidence. Documentation issue `#77` is an independent terminal leaf based on current `main`; it does not consume unmerged Phase 3–6 product bytes.

## Security, privacy, and licensing boundaries

- Secrets, cookies, OAuth sessions, browser/device profiles, `.env`, private keys/shards, NFC material, attestation tokens, host secret paths, and mutable sibling checkouts never enter Git, bundles, MCP payloads, logs, or portable receipts.
- External dependencies are deny-by-default until exact source/version/artifact/checksum, direct/transitive licenses, SBOM, notices, distribution/service terms, and required Human/legal state are recorded.
- A permissive direct license lowers risk; no document may promise zero legal risk.
- Generic shell-over-MCP is forbidden.
- No document may claim absolute security, immunity, or unmeasured resistance percentage.
- Simulator/testnet/reference evidence never proxies physical-device/mainnet/production evidence.

## Current implementation boundary

The current code baseline supports deterministic contracts, local text ingest, raw-primary research routing, disposable local worktree runtime, intent canonicalization/reference threshold, and immutable subject validation. Git Town macOS wrapper canaries are merged. The Phase 3–6 provider/product/security/integration issues `#38–#75` remain in their exact `NOT_IMPLEMENTED`, `NOT_EXERCISED`, `ABSENT`, or blocked states until evidence lands.

## Completion report

```text
issue / parent epic / PR
parent branch+PR / exact head+tree / Stack position
changed paths / modules / interfaces / public surfaces
state machine before / transitions exercised / final state
input-output-artifact-receipt data-flow edges
affected transitive dependents and path conflicts
eval and disagreement-control results
provider/platform/carrier/origin results separately
cleanup/residue and revocation state
status/release/lock changes and digests
remaining ABSENT / NOT_IMPLEMENTED / NOT_EXERCISED / SKIPPED_BY_POLICY / blocked states
rollback subject
Human Admit and next merge order
```

Do not claim integration or phase completion when any applicable item is missing, stale, failed, blocked, not implemented, or not exercised.

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
- AGENTS.md is the cross-host repository procedure; repo CLAUDE.md is a Claude host adapter; global ~/.claude/CLAUDE.md is local host policy only.
- Cloud and local freshness are separate evidence lanes. Neither environment may fabricate verification of the other.
- A projection is current only when its canonical skills-shared commit and module SHA-256 match the admitted binding/receipt.
- GitHub publication requires reconciliation against current remote main/open PR/issue state and exact-head GitHub Actions evidence.

Do not edit this managed block manually. Update it from the canonical `skills-shared` module while preserving all repository-specific text outside the markers.
<!-- END SKILLS-SHARED INSTRUCTION PROJECTION -->
