# `docs/integration/`

This directory owns cross-repository integration explanations and routing. It does not own machine bindings, releases, provider sessions, live receipts, consumer State Machines, merge, or promotion.

## Read order

1. [`AGENTS.md`](AGENTS.md) — local Agent authority, evidence and handoff rules.
2. [`FEDERATED_HARNESS_CONTROL_PLANE.md`](FEDERATED_HARNESS_CONTROL_PLANE.md) — current federated control-plane architecture for `skills-shared` + `runtime-env` + Agent Shield + domain harnesses such as `ios-device-autopilot`.
3. [`CROSS_REPO_INTEGRATION.md`](CROSS_REPO_INTEGRATION.md) — existing four-repository release/binding view.
4. root [`AGENTS.md`](../../AGENTS.md), [`README.md`](../../README.md), current issue/PR, machine status and exact receipt subjects before any completion claim.

## Directory → State Machine → data flow

```text
docs/integration/
├── AGENTS.md
│   └── read order, canonical-owner law, evidence ceilings, Local Handoff boundary
├── FEDERATED_HARNESS_CONTROL_PLANE.md
│   └── REQUEST → METHOD → CAPABILITY → OWNER → TASK DAG → STACK → RUNTIME → RECEIPT → SHADOW → HUMAN
├── CROSS_REPO_INTEGRATION.md
│   └── shared Skill/runtime/bettor/Agent Shield release and binding projection
└── README.md
    └── directory/Stack/handoff index only; no runtime authority
```

```text
source article / PDF / issue / user request
→ classify proposal versus current repository/live fact
→ bind `skills-shared` repository-control-plane + Tech Lead + Shadow + Stack method
→ resolve one canonical capability owner
→ compile true task/Stack DAG
→ resolve secret-free `runtime-env` execution binding
→ execute in canonical domain repository or emit Local Handoff
→ observe immutable receipt references
→ independent Shadow readback
→ convergence/global objective
→ Human Admit for semantic conflict/merge/release/destructive or permission-widening action
```

## Cross-repository task DAG

```text
skills-shared@exact-subject
  repository-control-plane-profile/v1
  + agentic-tech-lead-orchestration
  + procedural-shadow-runtime
  + git-town-stacked-pr-worker
        │ METHOD_BINDING / no consumer state writes
        ▼
agent-shield-monorepo#149  convergence + shared routing index
├─ #150 router/registry implementation
├─ runtime-env#65 runtime binding/workloads/Local Handoff
└─ ios-device-autopilot#96 iOS performance/model/gray-box/replay
        ├─ ios-device-autopilot#6   physical fleet E3/E4 evidence
        ├─ ios-device-autopilot#51  physical permission E3 controls
        └─ ios-device-autopilot#54  aggregate evidence admission

Independent Shadow review                 EXTERNAL_EVIDENCE
local Mac / Simulator / iPhone execution  LOCAL_HANDOFF / EXTERNAL_EVIDENCE
Human merge/release                       HUMAN
```

Cross-repository ordering is a process/evidence relation. It is **not** Git child ancestry across repositories.

## Molecular Stack PR index

The terminal atoms below use the `git-town-stacked-pr-worker` vocabulary. PR numbers and exact heads are added only after publication; a planned atom is not represented as implemented.

| Atom | Repository / issue | Class | Owns | Consumes | Provides | Evidence ceiling |
|---|---|---|---|---|---|---|
| `XR-CONTROL-D` | Agent Shield `#149` | convergence | shared cross-repo docs/index | admitted current repo docs + exact external issue metadata | architecture, owner/DAG/Stack/handoff route | documentation/contract only |
| `XR-ROUTER-C` | Agent Shield `#150` | sibling/root in repo | typed route/registry contracts | `skills-shared` method binding | capability→canonical-owner contract | E1 contract |
| `XR-ROUTER-K` | Agent Shield `#150` | true child only after contract bytes | router/projection core | `XR-ROUTER-C` unmerged contract if applicable | deterministic route packets | E1 deterministic |
| `XR-ROUTER-E` | Agent Shield `#150` | sibling or child by actual bytes | router negative/evidence controls | route schema/core | false-owner/stale/evidence-ceiling controls | E1 deterministic |
| `IOS-RT-C` | runtime-env `#65` | external repo sibling | iOS runtime profile/workload/policy binding | immutable method + iOS contract refs | secret-free runtime contract | contract only |
| `IOS-RT-K` | runtime-env `#65` | local true child if consuming `IOS-RT-C` | fixed entrypoints | runtime contract | bounded E1/E2/E3/E4 workload interface | deterministic until live run |
| `IOS-RT-E` | runtime-env `#65` | local sibling/child by paths | absence/privacy/lane controls | runtime contracts | falsifiers + Local Handoff receipt checks | E1 deterministic |
| `IOS-RT-LIVE` | runtime-env `#65` | external evidence | no Stack paths | admitted exact runtime subject | host/Simulator/device runtime receipts | exact live lane only |
| `IOS-PERF-C` | iOS `#96` | sibling/root in repo | latency/throughput schemas | existing jobs/shards/evidence contracts | measurement vocabulary | E1 contract |
| `IOS-PERF-K` | iOS `#96` | true child if consuming new perf bytes | duration-aware planning | timing history + frozen plan | cost-aware deterministic shard plan | E1 until live timing |
| `IOS-MODEL-C` | iOS `#96` | sibling | pure State/Command/Effect/Invariant contract | product adapters only at boundary | model explorer interface | E1 contract |
| `IOS-MODEL-K` | iOS `#96` | true child of model contract | corpus/frontier/novelty/replay | model contract | deterministic high-throughput exploration | L0/E1 only |
| `IOS-MODEL-E` | iOS `#96` | sibling/child by path | shrinking/property/mutation controls | model core | minimal reproducible failure traces | L0/E1 only |
| `IOS-PROBE-C/E` | iOS `#96` | sibling | test-only gray-box adapter + disagreement controls | domain TestProbe adapter | model/probe/AX observer comparison | E1 contract; E2 when replayed |
| `IOS-HW-E` | iOS `#6/#51/#54/#96` | external evidence | no implementation paths | exact integrated iOS head | E3/E4 physical receipts | E3/E4 only |
| `XR-CONVERGENCE-X/D` | Agent Shield `#149` | convergence | shared projection/docs/trace index | verified immutable downstream receipts | global route dossier + remaining queue | cannot widen downstream evidence |

Rules:

```text
SIBLING     = path-disjoint; no unmerged byte dependency
TRUE_CHILD  = names the exact unmerged artifact consumed
CONVERGENCE = one writer of shared indexes/status
PROCESS_DEPENDENCY = ordering only, no Git ancestry
EXTERNAL_EVIDENCE  = runtime/Shadow receipts, owns no Stack paths
HISTORICAL         = prior immutable subject, not current writer
```

## Seven-stage execution index

| Stage | State | Primary owner | Parallelism | Required handoff |
|---:|---|---|---|---|
| 0 | subject/truth freeze | Tech Lead | repo inventory reads parallel | exact repository/issue/PR/source packet |
| 1 | closure audit | Tech Lead + independent Shadow | capability/evidence/license/runtime reviews parallel | frozen capability DAG + findings |
| 2 | contract/interface atoms | terminal Workers | disjoint `C` atoms parallel | schema/interface digests + controls |
| 3 | deterministic implementation/evals | terminal Workers | `K/A/E` leaves parallel under path leases | exact local deterministic receipts |
| 4 | runtime binding/queue | runtime-env + Tech Lead | runtime families parallel | binding or asserted Local Handoff queue |
| 5 | live/physical evidence | local/provider executor | independent E2/E3/E4/E5 lanes parallel when resources allow | exact live receipts + cleanup |
| 6 | convergence/Human Admit | one convergence owner + Shadow | review lanes may parallelize, one shared writer | dossier, rollback, remaining queue, Human decision |

## Local Handoff queue routing

Current cloud/connector-visible issues already contain the handoff boundary:

```text
runtime-env#65
  next local class: macOS runtime capable of Xcode/Simulator/device workloads after deterministic atoms exist

ios-device-autopilot#96
  next local class: macOS/Xcode executor for exact E2 timing/replay and later authorized E3/E4 hardware evidence

agent-shield-monorepo#149/#150
  GitHub connector may continue docs/issues/PR metadata and hermetic code review;
  real Git Town/Forgejo/local checkout/provider/device execution requires separate local evidence
```

Before activating a local queue item, rebind exact current repository commit/tree, method/runtime schema digests, fixed workload/entrypoint, target capability class, receipt schema, timeout, cleanup and next transition. A queue or issue can remain `PLANNED/BLOCKED`; validation never means execution happened.

## Google Doc / Sheet projection

Use Google Docs and Sheets only above this graph as human navigation:

```text
Google Doc   source/PDF analysis, architecture decision memo, prompt library
Google Sheet cross-repo dashboard: repo | issue | atom | relation | evidence | PR | receipt | blocker | next owner
GitHub       canonical issue/code/contracts/README/AGENTS/PR/receipt references
```

A Doc/Sheet row must link back to canonical GitHub or exact receipt subjects. It cannot become the state writer or completion authority.

## Evidence boundary

A documentation or route PASS proves navigation/contract clarity only. It cannot establish provider installation, Git Town execution, Forgejo state, Simulator/physical device behavior, model/provider quality, merge, release, or production readiness.
