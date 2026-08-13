# Agent Shield documentation index

This is the canonical navigation surface for humans and Agents. Read root [`AGENTS.md`](../AGENTS.md), [`CONTEXT.md`](../CONTEXT.md), and [`ARCHITECTURE.md`](../ARCHITECTURE.md), then use the task routes below.

## Standard multi-hop routes

| Route | Role |
|---|---|
| [`architecture/DOCUMENT_ROUTING.md`](architecture/DOCUMENT_ROUTING.md) | same-name route semantics and assertions |
| [`architecture/STATE_MACHINES.md`](architecture/STATE_MACHINES.md) | thin route to canonical state-machine owner |
| [`integration/CROSS_REPO_INTEGRATION.md`](integration/CROSS_REPO_INTEGRATION.md) | four-repository module/release/binding flow |
| [`traceability/TRACEABILITY_INDEX.md`](traceability/TRACEABILITY_INDEX.md) | canonical repository trace matrix |
| [`traceability/FOUR_REPO_INTEGRATION.md`](traceability/FOUR_REPO_INTEGRATION.md) | current four-repository documentation PR topology |

## Identity, source, and decisions

| Document | Role |
|---|---|
| [`../README.md`](../README.md) | concise current state, directory/data-flow map, and phase Stack DAG |
| [`../AGENTS.md`](../AGENTS.md) | mandatory Agent operating contract |
| [`../CONTEXT.md`](../CONTEXT.md) | mutable current handoff |
| [`intent/PROJECT_INTENT.md`](intent/PROJECT_INTENT.md) | north star, constraints, and deferrals |
| [`sources/SOURCE_LEDGER.md`](sources/SOURCE_LEDGER.md) | source IDs, locators, claims, and repository treatment |
| [`decisions/README.md`](decisions/README.md) | decision-record index |
| [`licensing/README.md`](licensing/README.md) | exact dependency/license admission policy |

## Architecture, state machines, and implementation ownership

| Document | Role |
|---|---|
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | current plane/module/placement authority |
| [`architecture/IMPLEMENTATION_PHASES.md`](architecture/IMPLEMENTATION_PHASES.md) | high-level phase boundaries |
| [`architecture/DATA_FLOWS.md`](architecture/DATA_FLOWS.md) | source-derived and repository-reviewed target flows |
| [`state-machines/README.md`](state-machines/README.md) | canonical current and target transition/data-flow map |
| [`implementation/README.md`](implementation/README.md) | implementation admission and convergence ownership |
| [`implementation/STACKED_IMPLEMENTATION_PLAN.md`](implementation/STACKED_IMPLEMENTATION_PLAN.md) | complete Phase 3–6 issue/branch/base/path/eval DAG |

## Evidence, Git, and Worker governance

| Document | Role |
|---|---|
| [`harness/README.md`](harness/README.md) | Harness classes and evidence arrival rules |
| [`evals/README.md`](evals/README.md) | eval schema, states, and disagreement controls |
| [`git/README.md`](git/README.md) | Git Town governance and admission state |
| [`../scripts/git-town/README.md`](../scripts/git-town/README.md) | executable Worker/stack state machine and canary boundary |

## Molecular implementation phases

| Phase | Foundation | Leaves | Convergence |
|---|---|---|---|
| Runtime fabric | #38 | #39–#43 | #44 |
| Product/mobile | #45 | #46–#52 | #53 |
| Security/hardware/testnet | #54 | #55–#63 | #64 |
| Bettor reference consumer | #65 | #66–#74 | #75 |

Exact branch parentage and parallel groups are in the Stack plan, not inferred from issue numbers.

## Machine truth

| Path | Meaning |
|---|---|
| `.arena/modules/*/module.json` | module roots, capabilities, runtime states, proof command, external policy |
| `packages/contracts/src/index.ts` | public TypeScript contract surface |
| `data/status/integration.json` | current product/provider evidence-state ledger |
| `data/releases/agent-shield-module-set.json` | deterministic portable module release manifest |
| exact provider/driver/origin receipt | environment-specific exercised subject |

When authorities differ: preserve source in the ledger, use admitted repository decisions for policy, exact code/manifest/status for current shape, and immutable executed receipts for live evidence.
