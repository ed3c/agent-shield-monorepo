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
    └── local index only; no runtime authority
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

## Current cross-repo harness work

```text
agent-shield-monorepo#149  convergence/control-plane architecture
├─ agent-shield-monorepo#150  typed capability router and receipt projection
├─ runtime-env#65             iOS runtime profile/workload/Local Handoff binding
└─ ios-device-autopilot#96    latency/model exploration/gray-box/risk-selected replay
```

These are cross-repository sibling/process/evidence lanes, not automatic Git children. A true child exists only when it consumes named unmerged parent bytes. Shared index updates have one convergence owner.

## Evidence boundary

A documentation or route PASS proves navigation/contract clarity only. It cannot establish provider installation, Git Town execution, Forgejo state, Simulator/physical device behavior, model/provider quality, merge, release, or production readiness.
