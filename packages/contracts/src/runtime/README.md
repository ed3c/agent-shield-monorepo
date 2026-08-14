# Runtime v2 contract family

Issue [#93](https://github.com/ed3c/agent-shield-monorepo/issues/93) owns this post-Phase-3 repair. External consumers use `@agent-shield/contracts/runtime`; provider implementations do not import one another's private source.

## Public schemas

```text
agent-shield/runtime-request/v2
agent-shield/runtime-receipt/v2
```

A v2 request binds the provider ID/version, immutable provider binary/source/artifact subject, immutable runtime image/template/profile subject, local/cloud scope, required capabilities, immutable source, structured workload, environment-name allowlist, exact network policy, opaque secret references, timeout/cancellation and byte limits, mutation roots, artifact contracts, cleanup policy, and named exclusions.

A receipt binds the exact same subjects plus lifecycle, `taskStage`, `terminalStage`, pre-cleanup `taskOutcome`, final `outcome`, output/artifacts, workspace disposition, preservation artifact, cleanup residue, and exclusions.

## Legacy envelope boundary

`validateRuntimeRequestV2` is the strict provider-execution parser and rejects v1. `validateRuntimeRequest` preserves already-merged OpenShell/tmux policy/session envelope tests by mapping v1 into explicit sentinel subjects marked by `legacy-v1-unbound` and `legacy-runtime-v1-unbound`.

The sentinel version, subjects, hashes, or exclusion make the normalized envelope non-executable. Runtime dispatch rejects it before registry resolution or any provider method, even if a descriptor is deliberately constructed to match the sentinel identity.

## Receipt stage binding

A legal lifecycle is not sufficient on its own. The task phase subsequence must match `taskStage` exactly:

```text
resolution      → []
admission       → ADMISSION_CHECKED
materialization → ADMISSION_CHECKED → MATERIALIZING → CLEANING
execution       → ADMISSION_CHECKED → MATERIALIZING → READY → RUNNING → CLEANING
collection      → ADMISSION_CHECKED → MATERIALIZING → READY → RUNNING → COLLECTING → CLEANING
```

This prevents a syntactically legal lifecycle from claiming the wrong failure or evidence stage.

## Data flow

```text
untrusted value
  → own-key closed validation
  → canonical normalization
  → executable-request gate
  → exact provider/environment subjects
  → provider SPI
  → stage-bound sealed receipt
```

Unknown/inherited/prototype keys, generic command aliases, caller host paths, raw secret values, mutable refs, credential-bearing URLs, traversal, overlapping roots, undeclared secret delivery, unbounded JSON/output/artifacts, and inconsistent cleanup claims fail closed.

## Evidence boundary

These bytes prove deterministic contracts, transition legality, timeout/cancellation controls, legacy non-execution, and receipt validation only. They do not prove Apple Container, E2B, OpenShell/tmux executables, network isolation, credentials, performance, real-host cleanup, or production availability.
