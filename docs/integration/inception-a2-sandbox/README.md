# Inception A2 — hardened sandbox and steering preflight

Status: **OWNER IMPLEMENTATION PREPARATION ONLY**  
Upstream profile issue: `ed3c/enterprise_agent_system#7`  
Owner issue: `ed3c/agent-shield-monorepo#153`  
Runtime-contract sibling: `ed3c/runtime-env#67`

This leaf prepares the product/runtime adapter that consumes exact `runtime-env`
contracts and performs bounded sandbox lifecycle, capability observation, safe
synchronization, checkpoint/tool/cancel/no-action decisions and terminal cleanup.
It does not create a second runtime fabric, expose private reasoning, enroll a
provider or advance canonical task, Gate, Human or release state.

## Exact preparation subject

```text
repository        ed3c/agent-shield-monorepo
base commit       30e12cc917503b56b002aa7351428811f20fea8e
base tree         6f465f936515d81ed51c5b80595de530593f25fc
branch            agent/inception-a2-runtime-sandbox-steering
runtime-env base  c0790b9a8c81d7eb45ed45ac3d761c7fad5baa9b
runtime-env tree  df39f33f7a5278d255a022789b9f94c9b4a073b9
controller commit 6e0a916fd06dd8635d77c9a8c4d1b475185ea13e
controller tree   c3851a6953d456d0342a9776eed28561c1af0ca1
packet digest     sha256:18e6a7c89d6f6de322b68fd1c2928fcc6c4cd42508236bb1ca03957435106aec
packet bundle     sha256:dc4473b3195a738e55eb49c43661b6e1f4ea7f95c66749454776f2003b18ebc3
```

## Existing canonical mechanisms to adapt

| Existing path | Reusable responsibility | Boundary |
|---|---|---|
| `services/runtime-fabric/` | provider resolution, local disposable worktree and lifecycle vocabulary | only local fixture lane is currently PASS |
| `packages/contracts/` | closed typed runtime and receipt boundaries | shared contracts are convergence-owned |
| `docs/state-machines/` | provider/product transition vocabulary | prose is not execution evidence |
| `scripts/verify.ts` / `scripts/selftest.ts` | repository-wide deterministic controls | another provider cannot proxy this adapter |
| `data/status/integration.json` | aggregate product/provider state | convergence owner only |

## Target State Machine

```text
RUNTIME_CONTRACT_BOUND
→ WORKLOAD_POLICY_AND_LEASE_VALIDATED
→ SANDBOX_MATERIALIZED
→ CAPABILITIES_OBSERVED
→ BUDGET_AND_SAFE_SYNC_POINT_OBSERVED
→ ACTION_PROPOSED
→ POLICY_AND_TRANSACTION_BOUNDARY_CHECKED
→ CHECKPOINT | TOOL_REQUEST | CANCEL | NO_ACTION | HUMAN_ESCALATE
→ ARTIFACTS_COLLECTED
→ CLEANUP_AND_RESIDUE_VERIFIED
→ RECEIPT_COMMITTED
```

Steering is limited to visible action boundaries. Unsupported cancellation,
resume, prefill or provider semantics remain `UNKNOWN` or `UNSUPPORTED`.
Hidden reasoning access is `ABSENT`.

## Sandbox baseline

```text
default-deny network egress and arbitrary mounts
no privileged mode, Docker socket, host PID/IPC or credential paths
unprivileged identity + no-new-privileges
bounded CPU, memory, PIDs, time and output
allowlisted argv, confined workspace and immutable workload identity
terminal process/worktree/port/index/container/mount cleanup receipt
```

## Provisional lease

```text
docs/integration/inception-a2-sandbox/**
services/runtime-fabric/src/providers/inception-sandbox/**
services/runtime-fabric/src/steering/inception/**
services/runtime-fabric/tests/inception/**
data/receipts/inception-a2/**
.github/workflows/inception-a2-runtime.yml
```

Public provider registries, module versions, aggregate status/release bytes and
shared convergence paths remain read-only.

## First implementation commit admission

The next commit must add a closed adapter/capability contract and a hollow or
failing control for one bounded local fixture. It must refuse mutable images,
secret values, shell strings, privilege/network/mount expansion, stale leases,
unsafe transaction interruption and cleanup residue before adding provider code.

## Evidence ceiling

```text
OWNER_PREPARATION_READY
adapter implementation   NOT_STARTED
local sandbox execution  NOT_EXERCISED
provider observation     NOT_EXERCISED
isolation canary         NOT_EXERCISED
provider enrollment      NOT_PERFORMED
Human/release authority  NOT_PERFORMED
```

Machine authority: [`preflight.json`](preflight.json).
