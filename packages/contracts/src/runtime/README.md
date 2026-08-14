# Runtime contract family

Issue [#38](https://github.com/ed3c/agent-shield-monorepo/issues/38) owns this host-neutral Bun + TypeScript foundation. Consumers use `@agent-shield/contracts/runtime`; provider implementations never import another provider's private source.

## Public schemas

```text
agent-shield/runtime-request/v1
agent-shield/runtime-receipt/v1
```

A request closes:

```text
provider id + version + immutable provider subject
runtime image/template/profile subject
local/cloud scope and required capabilities
immutable Git commit/tree or artifact source
structured workload identity and JSON input
environment-name allowlist and exact network policy
opaque secret broker references
timeout, cancellation grace, byte and mutation limits
artifact contracts, cleanup policy and named exclusions
```

A receipt binds the normalized request digest, observed provider/environment subjects, lifecycle, `taskStage`, `terminalStage`, pre-cleanup `taskOutcome`, final `outcome`, execution evidence, artifacts, touched paths, workspace disposition, preservation artifact, cleanup residue and exclusions.

## Contract pipeline

```text
untrusted value
  → own-key closed validation
  → canonical set normalization
  → immutable request digest
  → exact provider/environment subject match
  → provider SPI and bounded stages
  → sealed state-machine receipt
```

Unknown/inherited keys, prototype-pollution keys, generic command aliases, caller `cwd`, raw environment values, host paths, mutable refs, credential-bearing URLs, traversal, overlapping roots, undeclared secret delivery, unbounded JSON/output/artifacts, and inconsistent cleanup claims fail closed.

## Evidence boundary

These bytes can prove deterministic contracts, transition legality, bounded timeout/cancellation handling and receipt validation only. They do not prove Apple Container, E2B, OpenShell, tmux/PTY, credentials, network isolation, provider performance/cost, real-host cleanup or production availability. Issues #39–#43 own provider-specific evidence; #44 alone owns aggregate registry/module/status/release promotion.
