# Federated Harness Control Plane

Issue: `#149`

This document defines the cross-repository control-plane route for composing `skills-shared`, `runtime-env`, `agent-shield-monorepo`, and domain harnesses such as `ios-device-autopilot` without creating a second canonical state writer.

It is architecture and execution-routing documentation. It is not a live runtime receipt, a Local Handoff execution result, a Git Town run, an iOS Simulator/physical-device proof, a merge decision, or release authority.

## 1. Repository roles

| Repository | Plane | Owns | Must not own |
|---|---|---|---|
| `ed3c/skills-shared` | Method / Instruction | repository-control-plane profile, Tech Lead decomposition, Shadow review, molecular Stack laws, Local Handoff method | consumer runtime state, provider credentials, product/domain state, consumer branches/receipts |
| `ed3c/runtime-env` | Runtime Contract | secret-free host/runtime/profile/workload/policy bindings, fixed entrypoints, host/runtime receipts, Local Handoff execution substrate | product/iOS semantics, release authority, secret values, arbitrary shell |
| `ed3c/agent-shield-monorepo` | Cross-domain Product / Router | capability registry, repository-owner routing, provider-adapter selection, immutable receipt/status projection, risk/evidence-lane routing | portable method duplication, consumer domain state machines, consumer receipt rewriting |
| `ed3c/ios-device-autopilot` | iOS Domain Harness | iOS jobs/shards/leases/sessions, Simulator/physical actions, permission transactions, semantic exploration, iOS evidence and deterministic assertion contracts | generic cross-domain routing, host secret/runtime ownership, Human merge/release |
| Human / trusted operator | Admission | semantic conflict, provider enrollment, hardware pairing/consent, credential creation, merge, destructive recovery, release/promotion | hidden automated state mutation |

The same pattern applies to future domain harnesses. The router points to the canonical owner; it does not copy that owner's State Machine into Agent Shield.

## 2. Non-overlap laws

```text
method definition               != consumer runtime execution
runtime declaration             != provider installed/live
provider transport acknowledgement != product/task PASS
domain exploration              != release authority
queue schema PASS               != queue executed
issue closed                    != runtime evidence
Google Doc/Sheet status         != canonical machine state
Git Town sync exit 0            != implementation or review PASS
Shadow agreement                != Human Admit
```

A capability has exactly one canonical semantic owner. Other repositories may bind, route, execute, or project immutable references to that capability but do not become a second writer.

## 3. Cross-Repo Execution Graph State Machine

```text
REQUEST_OBSERVED
→ SOURCE_AND_REQUIREMENT_CLASSIFIED
→ PORTABLE_METHOD_BOUND
→ CAPABILITY_SET_COMPILED
→ CANONICAL_REPOSITORY_OWNERS_RESOLVED
→ IMMUTABLE_SUBJECTS_BOUND
→ TASK_AND_DEPENDENCY_DAG_COMPILED
→ MOLECULAR_STACK_CLASSIFIED
→ EXECUTION_LANES_SELECTED
→ RUNTIME_BINDINGS_RESOLVED
→ WORKERS_OR_HANDOFF_ITEMS_EMITTED
→ RECEIPTS_OBSERVED
→ INDEPENDENT_SHADOW_REVIEWED
→ GLOBAL_OBJECTIVE_RECONCILED
→ HUMAN_ADMIT_REQUIRED | ROUTE_CLOSED
```

Blocked/control states:

```text
UNKNOWN_CAPABILITY
MULTIPLE_CANONICAL_OWNERS
METHOD_BINDING_STALE
SUBJECT_STALE
FALSE_GIT_DEPENDENCY
PATH_OR_RESOURCE_LEASE_CONFLICT
RUNTIME_BINDING_ABSENT
EXECUTION_LANE_UNAVAILABLE
LOCAL_HANDOFF_REQUIRED
MISSING_RECEIPT
EVIDENCE_LEVEL_MISMATCH
SHADOW_HOLD
SEMANTIC_CONFLICT
HUMAN_ADMIT_REQUIRED
```

No blocked state may be normalized to PASS.

## 4. End-to-end DAG and data flow

```text
article / PDF / issue / user request
        │
        ▼
source classification
SOURCE_PROPOSAL | REPOSITORY_FACT | LIVE_EVIDENCE
        │
        ▼
skills-shared repository-control-plane profile
        │
        ├─ Tech Lead: problem/capability/task decomposition
        ├─ Shadow: independent applicability/contradiction/evidence review
        └─ git-town-stacked-pr-worker: sibling/child/convergence classification
        │
        ▼
Agent Shield capability router
        │
        ├─ capability_id → canonical owner repository
        ├─ evidence requirement
        ├─ runtime class
        ├─ receipt schema reference
        └─ Human boundary
        │
        ▼
runtime-env binding
        │
        ├─ host/toolchain/profile/workload/policy
        ├─ fixed entrypoint
        ├─ execution lane
        └─ cleanup/residue contract
        │
        ├──────── current runtime can execute ───────────┐
        │                                               │
        ▼                                               ▼
local/cloud Worker                               Local Handoff Queue
        │                                               │
        ▼                                               ▼
domain repository executor                       local runtime executor
(e.g. ios-device-autopilot)                             │
        │                                               │
        ├────────────────── receipts ───────────────────┘
        │
        ▼
immutable receipt references + exact subject
        │
        ▼
Agent Shield read-only status projection
        │
        ▼
Independent Shadow readback
        │
        ▼
convergence/global objective
        │
        ▼
Human Admit / merge / release / rollback
```

## 5. Machine-readable execution route

Agent Shield issue `#150` owns the first implementation of this projection. A resolved route should contain fields equivalent to:

```json
{
  "schema": "agent-shield/cross-repo-execution-route/v1",
  "route_id": "route-...",
  "capability_id": "ios.simulator.validation",
  "canonical_owner": {
    "repository": "ed3c/ios-device-autopilot",
    "commit": "<40-hex>",
    "tree": "<40-hex>",
    "contract_ref": "<path-or-schema-id>"
  },
  "method_binding": {
    "repository": "ed3c/skills-shared",
    "commit": "<40-hex>",
    "profile": "repository-control-plane-profile/v1"
  },
  "runtime_binding": {
    "repository": "ed3c/runtime-env",
    "commit": "<40-hex>",
    "profile_class": "ios-device-autopilot-macos",
    "workload_class": "ios-device-autopilot-simulator-e2"
  },
  "required_evidence_level": "E2",
  "receipt_schema_ref": "<immutable-ref>",
  "execution_lane": "LOCAL_MACOS_SIMULATOR",
  "stack_relation": "SIBLING",
  "claims_not_proven": [],
  "human_boundary": []
}
```

Exact schema shape belongs to the implementation issue. Documentation must not invent a live commit/tree or receipt.

## 6. iOS initial route family

```text
ios.model-exploration
  canonical owner: ios-device-autopilot
  runtime: no-device / deterministic model lane
  evidence: E1/model only

ios.simulator.validation
  canonical owner: ios-device-autopilot
  runtime: runtime-env macOS/Xcode Simulator workload
  evidence: E2

ios.physical.validation
  canonical owner: ios-device-autopilot
  runtime: runtime-env physical-device workload
  evidence: E3

ios.physical.concurrency
  canonical owner: ios-device-autopilot
  runtime: runtime-env two-device workload
  evidence: E4

ios.permission.transaction
  canonical owner: ios-device-autopilot permission transaction
  evidence: E2/E3 depending target; transport ACK alone never PASS

ios.semantic.exploration
  canonical owner: ios-device-autopilot semantic exploration
  authority: exploration-only; release_verdict remains null
```

Current iOS throughput/model-plane gap is tracked in `ed3c/ios-device-autopilot#96`. Runtime binding is tracked in `ed3c/runtime-env#65`.

## 7. Molecular Stack / parallel fan-out

Cross-repository process dependencies do not automatically create Git child ancestry.

```text
#149 cross-repo convergence/control plane
├─ #150 Agent Shield router/registry                 SIBLING / local repo
├─ runtime-env#65 runtime binding                    EXTERNAL_REPOSITORY_SIBLING
└─ ios-device-autopilot#96 iOS harness evolution     EXTERNAL_REPOSITORY_SIBLING
       ├─ existing #6 physical fleet evidence        PROCESS_DEPENDENCY
       ├─ existing #51 permission E3 evidence        PROCESS_DEPENDENCY
       └─ existing #54 evidence epic                 PROCESS_DEPENDENCY

independent Shadow review                            EXTERNAL_EVIDENCE
local Mac / iPhone execution                         LOCAL_HANDOFF / EXTERNAL_EVIDENCE
Human merge/release                                  HUMAN
```

Inside each repository, use `git-town-stacked-pr-worker` molecular atoms:

```text
C  contract/schema/interface lock
K  deterministic core
A  adapter/provider/substrate
E  eval/mutation/fault controls
X  explicit convergence/E2E
D  documentation/receipt/handoff
```

Rules:

1. Path-disjoint atoms start as siblings from the same admitted base.
2. A true child must name the unmerged artifact it consumes.
3. One convergence owner writes shared indexes/status files.
4. External live evidence owns no implementation paths.
5. Human review/merge is not a Stack child.

## 8. Seven execution stages

### Stage 0 — Subject and truth freeze

Goal: bind current repository/issue/PR/commit/tree state and classify source proposals versus repository/runtime facts.

Handoff artifact:

```text
subject packet
repository inventory
open issue/PR inventory
source claim ledger
known evidence ceiling
```

### Stage 1 — Architecture and requirement closure audit

Goal: Tech Lead compiles capability/owner/task DAG; Shadow independently searches contradictions, missing owners and false closure.

Parallel sessions:

```text
A: capability/owner map
B: current issue/evidence audit
C: licensing/provider/runtime applicability
D: independent Shadow global-objective audit
```

Handoff artifact: frozen capability DAG + finding ledger.

### Stage 2 — Contract and interface atoms

Goal: create `C` atoms only: schemas, typed interfaces, receipt/evidence identities, state-transition vocabulary.

Parallel only when paths and interfaces are disjoint.

Handoff artifact: exact contract digests and tests.

### Stage 3 — Deterministic implementation and eval atoms

Goal: implement `K/A/E` atoms against frozen contracts with positive and hollow/mutation controls.

Handoff artifact: local deterministic receipts; no live promotion.

### Stage 4 — Runtime binding and Local Handoff compilation

Goal: resolve `runtime-env` profile/workload/policy or emit one exact Local Handoff queue when the current session lacks the runtime.

Handoff artifact: runtime binding or asserted queue, never fabricated execution.

### Stage 5 — Live / physical evidence

Goal: run Simulator/device/provider/multi-host canaries on exact subjects and preserve cleanup/residue evidence.

Handoff artifact: exact E2/E3/E4/E5/provider receipts.

### Stage 6 — Convergence, Stack traceability, and Human Admit

Goal: convergence owner updates README/AGENTS/status/Stack index, Shadow verifies denominator/evidence ceilings, then Human admits merge/release where required.

Handoff artifact: completion dossier + rollback + remaining queue.

## 9. Parallel ChatGPT / Agent session prompt contract

Every parallel session receives one bounded system/task packet. Do not copy a whole repository prompt and ask each Worker to improvise.

Required packet:

```text
ROLE
  Tech Lead Worker | Shadow external-evidence reviewer | convergence owner | runtime executor

IMMUTABLE SUBJECT
  repository
  base commit/tree
  issue
  parent/Stack relation
  method/runtime binding digests

GOAL / NON-GOALS

OWNERSHIP
  writable paths
  read-only paths
  forbidden paths/resources

INPUT CONTRACTS
  exact schemas/interfaces/receipts consumed

OUTPUT CONTRACTS
  exact artifacts/receipts provided

STATE MACHINE
  admitted current state
  allowed transitions
  blocked/terminal states

EVALS
  positive tests
  hollow/mutation controls
  evidence ceiling

HANDOFF
  next owner
  next issue/atom
  required receipt
  cleanup/rollback

AUTHORITY
  no secret/visibility/permission widening
  no semantic conflict auto-resolution
  no merge/release unless explicitly Human-owned
```

A Worker that discovers a missing dependency emits `BLOCKED` plus a new narrowly scoped issue proposal; it does not silently widen its lease.

## 10. Local Handoff Execution Queue

The portable queue method remains owned by `skills-shared`. Runtime-specific fields are bound by `runtime-env` and the domain receipt contract.

For iOS, an executable queue item should name:

```text
exact ios-device-autopilot commit/tree
exact runtime-env commit/tree/profile/workload
exact skills-shared method subject
target capability class, never public raw device identity
fixed command/entrypoint
required Xcode/toolchain identity
budget/timeout
expected receipt schema/digests
privacy/redaction requirement
cleanup/residue check
terminal states
next queue item or Human block
```

Only the local runtime marks an item executed. A cloud/API session may create/update the queue but must leave execution state `NOT_EXERCISED`.

## 11. Google Docs and Google Sheets

Use them only as human navigation/projection surfaces.

Recommended split:

```text
GitHub
  canonical issues, contracts, code, README/AGENTS, PR/Stack metadata, receipts

Google Sheet
  portfolio/dashboard projection across repositories
  columns: repo, issue, atom, relation, evidence level, status, PR, receipt URL, blocker, next owner

Google Doc
  long-form source/PDF/article analysis, decision memo, prompt library, architecture narrative
```

Every Sheet/Doc row or section should link back to immutable or current canonical GitHub subjects. GitHub/readback receipts remain authority. Sheet/Doc edits cannot close a machine state.

## 12. Directory allocation for implementation

```text
agent-shield-monorepo/
├── packages/contracts/src/cross-repo/
│   └── typed route/registry/receipt-reference contracts
├── services/research-orchestrator/src/capability-router/
│   └── requirement/capability → canonical owner route
├── services/runtime-fabric/src/execution-graph-projection/
│   └── runtime binding + Local Handoff-required projection; no domain execution
├── data/status/cross-repo/
│   └── read-only resolved status/receipt references
├── docs/integration/
│   ├── CROSS_REPO_INTEGRATION.md
│   └── FEDERATED_HARNESS_CONTROL_PLANE.md
└── docs/traceability/
    └── route/issue/Stack/evidence projection

runtime-env/
├── modules/ or equivalent runtime declarations
├── profiles/ios-device-autopilot-*.json
├── workloads/ios-device-autopilot-*.json
├── policies/ios-device-evidence-*.json
├── scripts/ fixed iOS entrypoints
├── tests/ positive/absence/privacy/lane controls
└── docs/integration/ ios consumer route

ios-device-autopilot/
├── mcp/src/mcp_server/control_plane/
│   ├── performance/ or current owning module for latency receipts
│   ├── scheduler duration-aware planning
│   └── model_exploration/ pure model/corpus/frontier/shrinking
├── skills/
│   ├── existing iOS execution Skills
│   └── optional ios-model-based-usecase-explorer
├── validation/
│   ├── performance receipts/corpora
│   └── E2/E3/E4 receipts
├── docs/architecture/
│   └── model/simulator/physical replay boundary
└── README.md / AGENTS.md convergence routes
```

Final concrete paths must follow each repository's nearest README and active writer leases.

## 13. Closure criteria

The architecture is not globally closed merely because this document and issues exist.

Minimum closure chain:

```text
#149 documentation/control route
→ #150 typed Agent Shield route/registry controls
→ runtime-env#65 runtime profile/workload/Local Handoff binding
→ ios-device-autopilot#96 L0/L1/L2 implementation/evidence plan
→ applicable existing iOS E3/E4 issues close with exact receipts
→ independent Shadow same-subject review
→ exact-head repository checks
→ Human Admit for merges/releases
```

Until then, the correct state is `PARTIAL` with explicit per-lane evidence ceilings.
