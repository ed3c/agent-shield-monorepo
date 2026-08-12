# Agent Shield documentation index

This is the canonical navigation surface for humans and Agents. Read documents in the order shown for the selected task.

## 1. Identity and intent

| Document | Role |
|---|---|
| [`../README.md`](../README.md) | concise project boundary, rules, and Harness narratives |
| [`../AGENTS.md`](../AGENTS.md) | mandatory Agent operating contract |
| [`intent/PROJECT_INTENT.md`](intent/PROJECT_INTENT.md) | north star, constraints, current phase, and deferrals |

## 2. Provenance and repository truth

| Document | Role |
|---|---|
| [`sources/SOURCE_LEDGER.md`](sources/SOURCE_LEDGER.md) | stable source IDs, locators, and claim treatment |
| [`decisions/README.md`](decisions/README.md) | decision-record index and decision states |
| [`traceability/TRACEABILITY_INDEX.md`](traceability/TRACEABILITY_INDEX.md) | intent → source → decision → issue → eval → status |
| [`traceability/DOCUMENTATION_CONVERGENCE.md`](traceability/DOCUMENTATION_CONVERGENCE.md) | exact merged PR identities, authority map, E60 controls, gaps, and implementation handoff |

## 3. Architecture and phases

| Document | Role |
|---|---|
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | current six-plane architecture contract |
| [`architecture/IMPLEMENTATION_PHASES.md`](architecture/IMPLEMENTATION_PHASES.md) | staged implementation and evidence boundaries |
| [issue #17](https://github.com/ed3c/agent-shield-monorepo/issues/17) | source-derived data flows, environment modes, licensing, and planned tree |

## 4. Git, Harness, and eval governance

| Workstream | Canonical issue |
|---|---|
| Git Town and unattended Worker-Agent protocol | [#15](https://github.com/ed3c/agent-shield-monorepo/issues/15) |
| Harness and reusable eval catalog | [#22](https://github.com/ed3c/agent-shield-monorepo/issues/22) |
| Final link/coverage convergence | [#23](https://github.com/ed3c/agent-shield-monorepo/issues/23) |
| Mechanical documentation/eval validator after convergence | [#32](https://github.com/ed3c/agent-shield-monorepo/issues/32) |
| Git Town live sync/background/conflict canaries after convergence | [#31](https://github.com/ed3c/agent-shield-monorepo/issues/31) |

## 5. Directory contracts

The nearest `README.md` owns local guidance. Coverage is split so multiple Agents can work without overlapping paths:

- apps and services — [issue #19](https://github.com/ed3c/agent-shield-monorepo/issues/19);
- Arena, GitHub, packages, data, scripts, and remaining control planes — [issue #21](https://github.com/ed3c/agent-shield-monorepo/issues/21).

## 6. Machine-readable contracts

| Path | Meaning |
|---|---|
| `.arena/modules/*/module.json` | module roots, capabilities, runtime states, proof command, external policy |
| `data/status/integration.json` | current integration evidence-state ledger |
| `data/releases/agent-shield-module-set.json` | immutable portable module release manifest |
| `packages/contracts/src/index.ts` | shared TypeScript contract surface |

## Navigation rule

When two documents appear to disagree:

1. preserve the source statement in the source ledger;
2. prefer the newest admitted repository decision for policy;
3. prefer an immutable executed receipt for evidence state;
4. record the disagreement rather than silently reconciling it.
