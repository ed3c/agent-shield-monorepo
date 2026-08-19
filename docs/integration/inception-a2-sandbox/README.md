# Inception A2 — hardened sandbox and steering verification

Status: **PUBLIC REVERSIBLE LOCAL-FIXTURE CANDIDATE**
Upstream profile issue: `ed3c/enterprise_agent_system#7`
Owner issue: `ed3c/agent-shield-monorepo#153`
Runtime-contract owner: `ed3c/runtime-env#67`

This leaf consumes an exact `runtime-env` contract, validates sandbox/steering admission, and now executes one reversible child-process fixture inside an ephemeral workspace. It reuses the existing runtime-fabric owner. It does not create a second runtime fabric, expose private reasoning, enroll a provider, prove network isolation, or advance canonical task/Gate/Human/release state.

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
packet digest      sha256:18e6a7c89d6f6de322b68fd1c2928fcc6c4cd42508236bb1ca03957435106aec
```

## Implementation subjects

```text
services/runtime-fabric/src/providers/inception-sandbox/types.ts
services/runtime-fabric/src/providers/inception-sandbox/validate.ts
services/runtime-fabric/src/providers/inception-sandbox/local-fixture.ts
services/runtime-fabric/src/providers/inception-sandbox/local-fixture-probe.ts
services/runtime-fabric/tests/inception/selftest.ts
services/runtime-fabric/tests/inception/local-fixture.test.ts
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

The public fixture exercises a narrow `SANDBOX_MATERIALIZED → ARTIFACTS_COLLECTED → CLEANUP_AND_RESIDUE_VERIFIED → RECEIPT_COMMITTED` path using a direct non-shell `bun` argv, exact lease identity, bounded output, an ephemeral workspace and terminal residue readback.

## Local fixture evidence law

The receipt may say:

```text
localExecution      PASS
providerObservation NOT_EXERCISED
networkIsolation    NOT_EXERCISED
```

A local child process cannot self-promote provider capability, default-deny egress, hardened container isolation, production parity or Human admission. Tests plant both provider-promotion and dirty-cleanup mutations and require refusal.

## Cleanup denominator

```text
path
process
port
index
container
mount
artifact
```

All entries must be zero before the local receipt is accepted. The fixture deletes its temporary workspace before constructing the terminal receipt.

## Writer lease

```text
docs/integration/inception-a2-sandbox/**
services/runtime-fabric/src/providers/inception-sandbox/**
services/runtime-fabric/src/steering/inception/**
services/runtime-fabric/tests/inception/**
data/receipts/inception-a2/**
.github/workflows/inception-a2-runtime.yml
```

Shared registries, aggregate status, release bytes and convergence paths remain read-only.

## Next transition

`RUN_NETWORK_ISOLATION_AND_PROVIDER_CAPABILITY_CANARIES`

Network-isolation and provider observations must be separately attributable. Provider enrollment or credentials are not implied by this public fixture.

## Evidence ceiling

```text
runtime-contract readback     DETERMINISTIC_PASS
sandbox/steering validator    DETERMINISTIC_PASS
reversible local process      TARGETED_PUBLIC_CANARY
terminal cleanup readback     TARGETED_PUBLIC_CANARY
network isolation             NOT_EXERCISED
provider observation          NOT_EXERCISED
hardened container isolation  NOT_EXERCISED
Human / release authority     NOT_PERFORMED
```

Machine authority: [`preflight.json`](preflight.json).
