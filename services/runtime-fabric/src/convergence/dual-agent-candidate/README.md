# Dual-Agent runtime convergence candidate

Status: non-promoting candidate compiler for parent #44. This directory verifies unmerged Dual-Agent evidence subjects; it does not write shared runtime registry/status/release state.

## Read route

```text
README.md
→ candidate.ts
→ selftest.ts
→ GitHub exact PR/Actions readback
```

## Authority

```text
PR #130 merged convergence verifier
services/runtime-fabric/src/convergence/**
        ↓
DA-RT-CAND #179
verify-only candidate compiler
        ↓
HUMAN_REVIEW_PENDING
```

Shared mutation authority remains #44 only:

```text
services/runtime-fabric/src/index.ts
.arena/modules/runtime-fabric/**
data/status/integration.json
data/releases/**
shared runtime README/status/release
```

This atom does not modify those paths.

## Exact candidate inputs

```text
ROUTE
PR #167
head c2272fcc026b8fca046fc8c7c449088eb2c41177
tree 868f71efce8c412f7c543b66c60738d22aeba1f3
run  32279588381 PASS
ceiling COMPLETE_DETERMINISTIC_ROUTE_MATRIX_ONLY

GVISOR
PR #178
head 5820b69d3f5f73de44ba175a2d1f824e3665885e
tree 2db898f637ab54f3da49fbe2522166ed1a089b01
run  32283019825 PASS
ceiling COMPLETE_DETERMINISTIC_GVISOR_MATRIX_ONLY

LOCAL_SANDBOX
PR #154
head 8ec782b78ec9e13f78f2faf14e6ffa722c1b78f2
tree 51adf9791485d597849c026a3828ded0088b3805
run  32262032532 PASS
local process/cleanup TARGETED_PUBLIC_CANARY
network isolation NOT_EXERCISED
provider observation NOT_EXERCISED
hardened container isolation NOT_EXERCISED
```

## State machine

```text
CANDIDATES_OBSERVED
→ EXACT_HEADS_VERIFIED
→ EXACT_TREES_VERIFIED
→ TARGETED_RUNS_VERIFIED
→ EVIDENCE_CEILINGS_VERIFIED
→ AUTHORITIES_VERIFIED
→ LIVE_BLOCKERS_VERIFIED
→ FAILURE_HISTORY_VERIFIED
→ SHARED_MUTATION_ABSENT
→ HUMAN_REVIEW_PENDING
```

There is deliberately no deterministic transition to `ADMITTED`.

## Blockers that must remain explicit

```text
ROUTE_LIVE_161
GVISOR_LIVE_173
LIVE_NETWORK_95
SHARED_CONVERGENCE_44
LOCAL_PROVIDER_OBSERVATION
```

Route CI cannot proxy live API/browser evidence. gVisor deterministic CI cannot proxy a real `runsc`/OCI isolation canary. The local process canary cannot proxy gVisor isolation, provider observation, or live network enforcement.

## Failure-history law

The candidate retains the earlier route-control failures:

```text
32277516417  route root typecheck defect
32278264809  browser forged-decision / API-first defect
```

Their later fixes are evidence of the current subjects; erasing the failed runs is a traceability defect.

## Evidence ceiling

`NON_PROMOTING_RUNTIME_CONVERGENCE_CANDIDATE_ONLY`

No merge, Human Admit, provider registration, credential/session access, shared status mutation, release, rollback, live API/browser, live `runsc`, or production promotion is proved here.
