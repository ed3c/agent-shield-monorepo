# Agent Shield documentation index

This is the canonical navigation surface for humans and Agents. Read the mandatory sequence in root [`AGENTS.md`](../AGENTS.md), then use the task routes below.

## 1. Identity, source, and decisions

| Document | Role |
|---|---|
| [`../README.md`](../README.md) | concise current state, directory/data-flow map, and phase Stack DAG |
| [`../AGENTS.md`](../AGENTS.md) | mandatory Agent operating contract |
| [`intent/PROJECT_INTENT.md`](intent/PROJECT_INTENT.md) | north star, constraints, and deferrals |
| [`sources/SOURCE_LEDGER.md`](sources/SOURCE_LEDGER.md) | source IDs, locators, claims, and repository treatment |
| [`decisions/README.md`](decisions/README.md) | decision-record index |
| [`licensing/README.md`](licensing/README.md) | exact dependency/license admission policy |

## 2. Architecture, state machines, and implementation ownership

| Document | Role |
|---|---|
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | current plane/module/placement authority |
| [`architecture/IMPLEMENTATION_PHASES.md`](architecture/IMPLEMENTATION_PHASES.md) | high-level phase boundaries |
| [`architecture/DATA_FLOWS.md`](architecture/DATA_FLOWS.md) | source-derived and repository-reviewed target data flows |
| [`state-machines/README.md`](state-machines/README.md) | canonical current and target transition/data-flow map |
| [`implementation/README.md`](implementation/README.md) | implementation admission rules and convergence ownership |
| [`implementation/STACKED_IMPLEMENTATION_PLAN.md`](implementation/STACKED_IMPLEMENTATION_PLAN.md) | complete Phase 3–6 issue/branch/base/path/eval DAG |

## 3. Evidence, Git, and Worker governance

| Document | Role |
|---|---|
| [`harness/README.md`](harness/README.md) | Harness classes and evidence arrival rules |
| [`evals/README.md`](evals/README.md) | eval schema, states, and disagreement controls |
| [`git/README.md`](git/README.md) | Git Town governance and current admission state |
| [`../scripts/git-town/README.md`](../scripts/git-town/README.md) | executable Worker/stack state machine and macOS canary boundary |
| [`traceability/DOCUMENTATION_CONVERGENCE.md`](traceability/DOCUMENTATION_CONVERGENCE.md) | prior documentation convergence and exact merged identities |

## 4. Complete traceability

| Document | Role |
|---|---|
| [`traceability/TRACEABILITY_INDEX.md`](traceability/TRACEABILITY_INDEX.md) | intent/source/decision/issue/eval/status index |
| [`traceability/STATE_MACHINE_INDEX.md`](traceability/STATE_MACHINE_INDEX.md) | directory/module/current state/data flow/terminal issue/eval reverse index |
| [issue #37](https://github.com/ed3c/agent-shield-monorepo/issues/37) | documentation-only state-machine and molecular implementation index |

## 5. Molecular implementation phase entry points

| Phase | Foundation | Leaves | Convergence |
|---|---|---|---|
| Runtime fabric | [#38](https://github.com/ed3c/agent-shield-monorepo/issues/38) | #39–#43 | [#44](https://github.com/ed3c/agent-shield-monorepo/issues/44) |
| Product/mobile automation | [#45](https://github.com/ed3c/agent-shield-monorepo/issues/45) | #46–#52 | [#53](https://github.com/ed3c/agent-shield-monorepo/issues/53) |
| Security/hardware/testnet | [#54](https://github.com/ed3c/agent-shield-monorepo/issues/54) | #55–#63 | [#64](https://github.com/ed3c/agent-shield-monorepo/issues/64) |
| Bettor reference consumer | [#65](https://github.com/ed3c/agent-shield-monorepo/issues/65) | #66–#74 | [#75](https://github.com/ed3c/agent-shield-monorepo/issues/75) |

Exact branch parentage and parallel groups are in the Stack plan, not inferred from issue numbers.

## 6. Directory contracts and machine truth

The nearest `README.md` owns local guidance. Machine truth remains:

| Path | Meaning |
|---|---|
| `.arena/modules/*/module.json` | module roots, capabilities, runtime states, proof command, external policy |
| `packages/contracts/src/index.ts` | current public TypeScript contract surface |
| `data/status/integration.json` | current product/provider evidence-state ledger |
| `data/releases/agent-shield-module-set.json` | deterministic portable module release manifest |
| exact provider/driver/origin receipt | environment-specific exercised subject |

## Navigation rule

When authorities differ:

1. preserve the source statement in the source ledger;
2. use the newest admitted repository decision for policy;
3. use exact code/manifest/status for current implemented shape;
4. use an immutable executed receipt for live evidence;
5. record disagreement instead of silently reconciling it.
