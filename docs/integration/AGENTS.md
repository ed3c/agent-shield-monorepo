# `docs/integration/AGENTS.md` — Federated harness integration contract

This file governs changes under `docs/integration/`. Root [`AGENTS.md`](../../AGENTS.md) remains authoritative for the repository.

## Mission

Keep cross-repository routing explicit and falsifiable while preserving exactly one canonical semantic/state owner for each capability.

The current harness composition is:

```text
skills-shared
  portable repository-control-plane / Tech Lead / Shadow / Stack / Local Handoff method
        ↓ immutable method binding
runtime-env
  secret-free host/runtime/profile/workload/policy + Local Handoff execution substrate
        ↓ runtime binding
agent-shield-monorepo
  cross-domain capability router + provider adapter registry + read-only status projection
        ↓ canonical owner route
domain harness (initially ios-device-autopilot)
  domain State Machine + actions + assertions + evidence
        ↓ receipts
Shadow readback → convergence → Human Admit
```

## Required read order

1. root [`AGENTS.md`](../../AGENTS.md)
2. [`README.md`](README.md)
3. [`FEDERATED_HARNESS_CONTROL_PLANE.md`](FEDERATED_HARNESS_CONTROL_PLANE.md)
4. [`CROSS_REPO_INTEGRATION.md`](CROSS_REPO_INTEGRATION.md)
5. current issue/PR/task packet and exact repository subjects
6. canonical external repository docs before writing any claim about their runtime state

## State Machine

```text
SOURCE_OBSERVED
→ REQUIREMENT_CLASSIFIED
→ METHOD_BOUND
→ CANONICAL_OWNER_BOUND
→ TASK_DAG_BOUND
→ STACK_RELATION_BOUND
→ RUNTIME_LANE_BOUND
→ RECEIPT_REFERENCE_BOUND
→ SHADOW_STATUS_BOUND
→ ROUTE_DOCUMENTED
```

Blocked states:

```text
UNKNOWN_OWNER
MULTIPLE_OWNERS
STALE_SUBJECT
FALSE_CHILD_EDGE
ABSENT_RUNTIME_BINDING
MISSING_RECEIPT
EVIDENCE_LEVEL_MISMATCH
LOCAL_HANDOFF_REQUIRED
HUMAN_ADMIT_REQUIRED
```

Documentation never changes an external repository's runtime state.

## Canonical-owner law

- `skills-shared` owns portable methods; do not copy method bodies here.
- `runtime-env` owns runtime bindings/fixed workloads; do not define product/domain semantics there or here.
- Agent Shield owns cross-domain routing and read-only projection; do not copy an iOS/Android/browser/provider State Machine merely to route it.
- `ios-device-autopilot` owns iOS action/session/evidence semantics.
- Human/trusted authority owns semantic conflict, credentials/enrollment, hardware consent, merge, release and destructive recovery.

When a route needs an external capability, link/bind its immutable contract or exact subject. Do not fork the vocabulary into a second mutable copy.

## Tech Lead + Shadow protocol

Tech Lead owns decomposition, task/capability DAG, path/resource leases, Worker packets, convergence and Local Handoff compilation.

Shadow is an independent `EXTERNAL_EVIDENCE` lane. It checks:

```text
requirement applicability
source/document/contract/runtime contradiction
local task versus global objective
false evidence promotion
denominator completeness
missing owner/issue/eval/receipt
cleanup and rollback
```

Shadow must not become a second implementation writer.

## Molecular Stack rules

Use the shared relation vocabulary:

```text
SIBLING
TRUE_CHILD
CONVERGENCE
PROCESS_DEPENDENCY
EXTERNAL_EVIDENCE
HISTORICAL
```

A true child names the exact unmerged artifact it consumes. Issue chronology, review order, runtime order, or external evidence do not create Git ancestry.

## Local Handoff boundary

A GitHub connector/chat session may create or update the queue contract but cannot mark local work as executed without local/runtime evidence.

For every handoff item record:

```text
exact repository/commit/tree subject
issue and molecular atom
runtime lane
fixed entrypoint/commands
required capability class
expected receipt/schema/digest
budget/timeout
cleanup/residue assertion
terminal/block states
next owner/transition
```

Do not record public raw device IDs, secret values, host private paths, credentials, browser/device sessions or signing material.

## Google Docs / Sheets

They are navigation and reporting projections only. A Doc may hold long-form research/prompt narratives; a Sheet may project repo/issue/atom/evidence/blocker/next-owner dashboards. Every row/section links back to canonical GitHub/receipt subjects. Doc/Sheet state never closes a repository State Machine.

## Current issue graph

```text
agent-shield-monorepo#149  CONVERGENCE / architecture + shared cross-repo index
├─ agent-shield-monorepo#150  SIBLING / typed router + receipt projection
├─ runtime-env#65             EXTERNAL_REPOSITORY_SIBLING / runtime binding
└─ ios-device-autopilot#96    EXTERNAL_REPOSITORY_SIBLING / iOS performance/model/replay

existing iOS #6/#51/#54       PROCESS_DEPENDENCY / physical evidence
independent Shadow            EXTERNAL_EVIDENCE
local Mac/iPhone runs         LOCAL_HANDOFF / EXTERNAL_EVIDENCE
merge/release                 HUMAN
```

## Evidence ceiling

These docs can establish route and architecture contract clarity. They cannot claim local Git Town/Forgejo execution, Xcode/Simulator/iPhone execution, provider availability, model quality, E2/E3/E4 evidence, merge, release or production readiness.
