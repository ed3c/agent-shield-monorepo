# Agent Shield architecture and placement authority

This file is the repository-level architecture SSOT. Source-derived target descriptions live under `docs/architecture/`; current transition and evidence truth lives in manifests, code, `data/status/integration.json`, exact receipts, and [`docs/state-machines/README.md`](docs/state-machines/README.md).

## Authority planes

```text
Source / Intent Plane
  docs/intent + docs/sources + docs/decisions + docs/licensing
        │ requirements and reviewed decisions
        ▼
Contract Plane
  packages/contracts + interface/schema versions
        │ typed packets/capabilities/artifact/receipt refs
        ▼
Module Plane
  .arena/modules + services + apps + packages + scripts
        │ public ports only
        ▼
Runtime / Product / Security Provider Planes
  selected provider adapters with isolated state machines
        │ exact provider/product/hardware/chain receipts
        ▼
Evidence / Release Plane
  docs/harness + docs/evals + data/status + data/releases
        │ same-subject aggregation
        ▼
Integration / Human Plane
  bettor-arena consumer + Claude/Codex + GitHub/Forgejo + Human Admit
```

## Current module ownership

| Module | Owned roots | Public capabilities | Current boundary |
|---|---|---|---|
| `document-ingest@1.1.0` | `services/document-ingest` | `document.ingest/v1` | local text deterministic; PDF/cloud absent |
| `research-orchestrator@1.1.0` | `services/research-orchestrator` | `research.route/v1` | deterministic routing; signed-in routes separate |
| `runtime-fabric@1.1.0` | `services/runtime-fabric` | `runtime.provider/v1` | local disposable worktree only |
| `product-adapters@1.0.0` | `apps/mobile-app`, `apps/web-dashboard`, `services/mobile-automation` | mobile/dashboard/automation capabilities | contracts/catalog only; live product/provider gaps remain |
| `security-boundaries@1.0.0` | `services/intent-ledger`, `services/security-boundaries` | intent and provider-boundary capabilities | deterministic intent/threshold boundary; high-risk providers absent |
| `bettor-consumer@1.0.0` | bettor bootstrap/verify scripts and SDK subject | bettor consumer/browser-contract capabilities | deterministic plan/validation; live consumer/origin gaps remain |

`.arena/README.md` and child manifests are machine-facing authority. Nearest directory READMEs explain local state/data flow but cannot override a manifest or receipt.

## State-machine ownership rule

Every current or future directory has one state-machine owner:

```text
contract foundation issue
  → provider/product leaf issues with disjoint private roots
  → convergence issue owning public registry/status/release
```

A leaf may emit its own receipt but cannot promote the shared module interface, aggregate another leaf, or edit the global status/release unless its issue is the named convergence owner. The full Phase 3–6 ownership DAG is [`docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md).

## Cross-plane data contract

Only these edges are admitted:

```text
typed request/packet
versioned public capability
content-addressed inline bundle/artifact reference
immutable Git/release subject
metadata-only provider/driver/origin receipt
explicit Human decision receipt
```

Forbidden edges:

```text
relative/private source import across modules
owner live checkout or per-run temp path
credential/session/profile/key value
arbitrary command/cwd/environment/private flag
mutable main/HEAD or timestamp-based newest-wins authority
one provider/platform/carrier receipt used for another
```

## Local, cloud, and hybrid runtime decision

Local and cloud are independent execution planes. Hybrid exchange is a protocol, not a shared writable filesystem:

| Data class | Admitted exchange mechanism |
|---|---|
| source code | one writer lease + branch/commit/content-bound patch + review/rebase |
| generated artifacts | content-addressed immutable object |
| policy/config | schema + versioned policy epoch + staged promotion |
| OS/dependencies | pinned image/template rebuild |
| DB/memory | API/event/log/snapshot + domain-invariant replay |
| secrets | broker reference only; never file sync |
| browser/device session | execution-plane session broker only; never local↔cloud copy |

The source proposal's `newest`/`prefer-beta` conflict strategy is retained only as source history and explicitly rejected for repository source authority.

## Human boundary

Human Admit owns public-interface promotion, semantic conflict resolution, dependency/legal acceptance, policy/key/permission expansion, contract deployment, production/mainnet authority, release promotion, destructive recovery, and rollback under drift.

## Verification boundary

A module manifest or deterministic release proves portable bytes and declared contracts. Provider, product, hardware, security, carrier, origin, and production evidence require their own exact state-machine receipt. See [`docs/traceability/STATE_MACHINE_INDEX.md`](docs/traceability/STATE_MACHINE_INDEX.md) for directory-to-evidence routing.
