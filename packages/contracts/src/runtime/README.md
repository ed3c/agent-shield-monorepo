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

`validateRuntimeRequestV2` is the strict provider-execution parser and rejects v1. `validateRuntimeRequest` preserves already-merged OpenShell/tmux policy/session envelope tests by mapping v1 into an explicit `legacy-v1-unbound` v2 subject. That subject cannot match an admitted provider descriptor and cannot produce provider/live PASS.

## Data flow

```text
untrusted value
  → own-key closed validation
  → canonical normalization
  → exact provider/environment subjects
  → provider SPI
  → stage-aware sealed receipt
```

Unknown/inherited/prototype keys, generic command aliases, caller host paths, raw secret values, mutable refs, credential-bearing URLs, traversal, overlapping roots, undeclared secret delivery, unbounded JSON/output/artifacts, and inconsistent cleanup claims fail closed.

## Evidence boundary

These bytes prove deterministic contracts, transition legality, timeout/cancellation controls, and receipt validation only. They do not prove Apple Container, E2B, OpenShell/tmux executables, network isolation, credentials, performance, real-host cleanup, or production availability.
