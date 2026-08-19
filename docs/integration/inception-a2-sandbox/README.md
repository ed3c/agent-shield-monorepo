# Inception A2 — hardened sandbox and steering contract

Status: **FIRST PUBLIC IMPLEMENTATION CANDIDATE**  
Upstream profile issue: `ed3c/enterprise_agent_system#7`  
Owner issue: `ed3c/agent-shield-monorepo#153`  
Runtime-contract owner: `ed3c/runtime-env#67`

This leaf consumes an exact `runtime-env` contract and adds a closed deterministic
validator for sandbox admission, capability-aware steering and cleanup readback.
It reuses the existing runtime-fabric ownership; it does not create a second
runtime fabric, expose private reasoning, enroll a provider, materialize a live
sandbox, or advance canonical task, Gate, Human or release state.

## Exact lineage

```text
repository         ed3c/agent-shield-monorepo
base commit        30e12cc917503b56b002aa7351428811f20fea8e
base tree          6f465f936515d81ed51c5b80595de530593f25fc
branch             agent/inception-a2-runtime-sandbox-steering
runtime-env PR     #68
runtime-env commit cdfe74ac993cb0b4795fa80df237e8bb542409d2
runtime-env tree   0b2db695cdd812f81924b82689d96e3557b80158
controller commit  6e0a916fd06dd8635d77c9a8c4d1b475185ea13e
controller tree    c3851a6953d456d0342a9776eed28561c1af0ca1
packet digest      sha256:18e6a7c89d6f6de322b68fd1c2928fcc6c4cd42508236bb1ca03957435106aec
packet bundle      sha256:dc4473b3195a738e55eb49c43661b6e1f4ea7f95c66749454776f2003b18ebc3
```

The runtime contract subject above passed its dedicated deterministic workflow
and repository CI before this consumer binding was advanced.

## Existing canonical mechanisms reused

| Existing path | Reusable responsibility | Boundary |
|---|---|---|
| `services/runtime-fabric/` | provider resolution and lifecycle vocabulary | this leaf remains a consumer/adapter |
| `packages/contracts/` | closed typed runtime and receipt boundaries | shared contracts are convergence-owned |
| `docs/state-machines/` | provider/product transition vocabulary | prose is not execution evidence |
| `scripts/verify.ts` / `scripts/selftest.ts` | repository-wide deterministic controls | another provider cannot proxy this adapter |
| `data/status/integration.json` | aggregate product/provider state | convergence owner only |

## Implementation subjects

```text
services/runtime-fabric/src/providers/inception-sandbox/types.ts
services/runtime-fabric/src/providers/inception-sandbox/validate.ts
services/runtime-fabric/tests/inception/selftest.ts
```

The closed validator checks:

```text
exact runtime-env repository/commit/tree
image and policy digest pinning
fixed non-shell argv and bounded resources
NONE / ALLOWLIST_ONLY networking
no privileged/root execution or host mounts
environment names only
workspace lease and timezone-aware expiry
hidden_reasoning_access = ABSENT
visible safe synchronization before steering
no interruption of an active tool transaction
capability-specific CHECKPOINT / TOOL_REQUEST / CANCEL admission
zero terminal residue across path/process/port/index/container/mount/artifact
```

## State Machine

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

The current candidate covers `RUNTIME_CONTRACT_BOUND` through deterministic
`POLICY_AND_TRANSACTION_BOUNDARY_CHECKED` plus a pure cleanup-readback validator.
`SANDBOX_MATERIALIZED`, live capability observation and provider execution remain
unexercised.

## Deterministic disagreement controls

The selftest refuses:

```text
mutable image identity
generic shell entrypoint
secret-bearing environment surface
privileged/root execution
workspace escape or stale lease
hidden reasoning represented as SUPPORTED
active tool transaction interruption
unsupported cancellation
stale or foreign steering lease
non-zero terminal residue
```

The first CI attempt correctly went red because the dedicated workflow did not
install Bun and TypeScript mutation fixtures violated literal contract types. The
workflow now installs exact Bun `1.3.14` using a commit-pinned action, and planted
mutations use explicit test-only casts without weakening the product interfaces.
Repository modular CI, lockfile promotion and the dedicated implementation gate
all pass on the repaired head.

## Sandbox baseline for the next atom

```text
default-deny network egress and arbitrary mounts
no privileged mode, Docker socket, host PID/IPC or credential paths
unprivileged identity + no-new-privileges
bounded CPU, memory, PIDs, time and output
allowlisted argv and confined workspace
terminal process/worktree/port/index/container/mount/artifact residue receipt
```

## Writer lease

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

## Next transition

`ADD_REVERSIBLE_LOCAL_SANDBOX_FIXTURE_AND_TERMINAL_RESIDUE_RECEIPT`

The next atom may exercise one reversible local sandbox fixture. A local fixture
PASS must not be promoted to provider, production, Human or release evidence.

## Evidence ceiling

```text
runtime-contract readback   DETERMINISTIC_PASS
sandbox/steering validator  DETERMINISTIC_PASS
repository deterministic CI PASS
local sandbox execution     NOT_EXERCISED
provider observation        NOT_EXERCISED
isolation canary            NOT_EXERCISED
provider enrollment         NOT_PERFORMED
Human/release authority     NOT_PERFORMED
```

Machine authority: [`preflight.json`](preflight.json).
