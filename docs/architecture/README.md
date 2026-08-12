# Architecture documentation

This directory preserves source-derived target architecture and repository decisions while keeping them separate from current executable/evidence truth.

## State machine

```text
SOURCE_TOPOLOGY_CAPTURED → CLAIMS_CLASSIFIED → CURRENT/TARGET_SEPARATED
  → DATA_FLOWS_TYPED → ENVIRONMENTS_SEPARATED → SECURITY/LICENSE_REVIEWED
  → STATE_MACHINE/ISSUE_ROUTED
```

Blocked states include an unreferenced provider/benchmark/license claim, a target diagram presented as current PASS, a secret/session/local-host dependency hidden in cloud mode, timestamp-based source overwrite, or a planned directory created without an implementation issue.

## Documents and flow

| Document | Role |
|---|---|
| `SOURCE_DERIVED_ARCHITECTURE.md` | bounded source `S-001` topology and terminology |
| `PLANNED_REPOSITORY_TREE.md` | planned paths, clearly separated from current tree |
| `DATA_FLOWS.md` | target data-flow diagrams and trust boundaries |
| `ENVIRONMENT_MODES.md` | pure local, cloud-independent, and hybrid/repair boundaries |
| `IMPLEMENTATION_PHASES.md` | high-level phase/evidence sequence |
| [`../state-machines/README.md`](../state-machines/README.md) | current and target transition ownership |
| [`../implementation/STACKED_IMPLEMENTATION_PLAN.md`](../implementation/STACKED_IMPLEMENTATION_PLAN.md) | exact molecular issues/branches/convergence DAG |

```text
source proposal
  → reviewed architecture decision
  → contract/state-machine foundation
  → provider leaf issue
  → exact receipt
  → convergence/status/release
```

## Repository decisions that override source proposals

- source code uses Git ancestry, leases, immutable bases, patches, and review—not `newest`, `prefer-beta`, or `prefer-cloud`;
- direct permissive license is not zero legal risk; exact artifact/transitive/SBOM/notices/service terms and Human state remain separate;
- performance/cost/security/store-compliance claims require exact current external verification and canaries;
- local, cloud, browser, device, hardware, chain, and production are separate evidence planes;
- no absolute security or immunity claims.

Architecture documents route implementation; they do not authorize code outside the assigned issue/path lease.
