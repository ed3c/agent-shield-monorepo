# AGENTS.md — Agent Shield integration, state-machine, and Stack-PR contract

## Mission

Preserve project intent, source provenance, module ownership, transition legality, data-flow boundaries, and evidence honesty while the repository implements its Phase 3–6 roadmap through eval-first molecular Stacked PRs. Bun + TypeScript are the primary implementation stack; Bash remains limited to the admitted Git Town/process harness.

## Mandatory read order

1. [`README.md`](README.md)
2. [`docs/INDEX.md`](docs/INDEX.md)
3. [`docs/intent/PROJECT_INTENT.md`](docs/intent/PROJECT_INTENT.md)
4. [`docs/sources/SOURCE_LEDGER.md`](docs/sources/SOURCE_LEDGER.md)
5. [`ARCHITECTURE.md`](ARCHITECTURE.md)
6. [`docs/state-machines/README.md`](docs/state-machines/README.md)
7. [`docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md)
8. [`docs/traceability/STATE_MACHINE_INDEX.md`](docs/traceability/STATE_MACHINE_INDEX.md)
9. [`docs/harness/README.md`](docs/harness/README.md) and [`docs/evals/README.md`](docs/evals/README.md)
10. the nearest `README.md` for every path you may change
11. the selected `.arena/modules/<id>/module.json`
12. `data/status/integration.json`, the assigned issue, current PR base/head, and exact task packet
13. for Git work: [`docs/git/README.md`](docs/git/README.md) and [`scripts/git-town/README.md`](scripts/git-town/README.md)

Stop if a required authority, issue, parent, path owner, state transition, eval, or immutable subject is missing. Do not infer the gap.

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

- Current implementation states come from exact code/manifests/status/receipts, not architecture prose.
- An issue may implement only transitions named in its issue contract.
- A provider-specific issue owns its private adapter path and receipt. Shared registries, public index exports, module versions, `data/status/integration.json`, release manifests, and aggregate indexes belong to the phase convergence issue.
- Invalid transition skipping, stale subject reuse, unsupported fallback, and cleanup failure must turn red.
- `WAITING_FOR_HUMAN`, `WAITING_FOR_HARDWARE`, `DENIED`, disconnect/detach, submission, inclusion, confirmation, and completion are distinct states.
- A state may leave `NOT_IMPLEMENTED` only after implementation evidence; it may leave `NOT_EXERCISED` only after the exact live canary runs.

## Evidence vocabulary

- `PASS`: the exact named immutable subject was exercised successfully and its positive assertion and disagreement control are available.
- `FAIL`: the exact subject was exercised and disagreed with its contract.
- `ABSENT`: a required tool, host, input, owner, artifact, provider, session, or receipt does not exist.
- `NOT_IMPLEMENTED`: the mechanism/provider intentionally has no implementation.
- `NOT_EXERCISED`: the mechanism exists but the named live/environment canary did not run.
- Blocked states name the policy, conflict, stale subject, lease, authentication, timeout, or cleanup reason.

Package presence, prose, diagrams, source claims, hashes, optional skips, another platform, or another provider cannot produce `PASS`.

## Source handling

Use the source ledger before reusing a claim. Preserve the source terminology and classify repository treatment separately:

- `SOURCE_PROPOSAL`
- `REPOSITORY_DECISION`
- `INFERENCE`
- `LIVE_EVIDENCE`

Source `S-001` proposes local/cloud/hybrid runtimes, E2B, OpenShell/tmux, mobile projection/testing, hardware brakes, MPC/TSS, smart accounts, ledgers, and settlement. It also proposes timestamp-based file conflict resolution. The repository preserves that proposal but rejects `newest`, `prefer-cloud`, and `prefer-beta` as source-code authorities; use one writer, Git ancestry, immutable bases, content-bound patches, review, and rebase.

Do not silently correct, merge, or promote source claims. Exact current provider/license/performance/cost/security facts require their own admission and live receipts.

## Module and directory boundaries

- A module may read its own private implementation.
- Cross-module calls use public typed contracts, packets, capabilities, artifact references, or receipts.
- The nearest directory `README.md` defines owner, local state machine, inputs, outputs, data-flow edges, prohibited coupling, current evidence, and terminal implementation issues.
- Leaf `src/` READMEs inherit their parent state machine and must not create a second public interface.
- New public/control/provider directories require the nearest README and an eval-first issue in the same PR.
- Planned directories remain documentation only until an issue admits their paths.
- No provider may silently borrow a sibling live checkout, process, node_modules, venv, browser/device session, secret, or owner temp state.

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

Git Town manages branch movement only. Its exit `0` is not implementation, review, release, or production evidence.

## Security, privacy, and licensing boundaries

- Secrets, cookies, OAuth sessions, browser/device profiles, `.env`, private keys/shards, NFC material, attestation tokens, host absolute secret paths, and mutable sibling checkouts never enter Git, bundles, MCP payloads, logs, or portable receipts.
- External dependencies are deny-by-default until exact source/version/artifact/checksum, direct/transitive licenses, SBOM, notices, distribution/service terms, and required Human/legal state are recorded.
- A permissive direct license lowers risk; no document may promise zero legal risk.
- Generic shell-over-MCP is forbidden.
- No document may claim absolute security, immunity, or unmeasured resistance percentage.
- Simulator/testnet/reference evidence never proxies physical-device/mainnet/production evidence.

## Current implementation boundary

The current code baseline supports deterministic contracts, local text ingest, raw-primary research routing, disposable local worktree runtime, intent canonicalization/reference threshold, and immutable subject validation. Git Town macOS wrapper canaries are merged. The Phase 3–6 provider/product/security/integration issues [#38–#75](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md) are planned and open; their capabilities remain in their current `NOT_IMPLEMENTED`, `NOT_EXERCISED`, or `ABSENT` states until exact evidence lands.

## Completion report

Before claiming completion, report:

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
remaining ABSENT / NOT_IMPLEMENTED / NOT_EXERCISED / blocked states
rollback subject
Human Admit and next merge order
```

Do not claim integration or phase completion when any applicable item is missing, stale, failed, blocked, not implemented, or not exercised.
