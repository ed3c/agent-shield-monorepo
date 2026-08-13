# Runtime contract family

Issue [#38](https://github.com/ed3c/agent-shield-monorepo/issues/38) owns this host-neutral Bun + TypeScript foundation. Consumers use the public package subpath `@agent-shield/contracts/runtime`; provider implementations must not import one another's private source.

## Public schemas

- `agent-shield/runtime-request/v1`
- `agent-shield/runtime-receipt/v1`

A request closes provider identity, scope, required capabilities, immutable Git/artifact source, structured workload identity, environment-name allowlist, network allowlist, opaque secret references, timeout/cancellation and byte limits, mutation roots, artifact contracts, cleanup policy, and named exclusions.

A receipt binds the normalized request digest, exact provider/version/capabilities, immutable source, logical workspace identity, lifecycle trace, admission result, pre-cleanup task outcome, overall outcome, exit/output bounds, artifacts, touched paths, cleanup result, and exclusions.

## Contract lifecycle

```text
untrusted value
  → closed-key validation
  → canonical normalization
  → immutable request digest
  → provider SPI
  → state-machine receipt
```

Set-like arrays are sorted during normalization so equivalent requests produce one digest. Generic shell controls, caller-selected `cwd`, raw environment values, host paths, mutable refs, credential-bearing URLs, path traversal, overlapping roots, undeclared secrets, and unbounded output/artifacts are rejected.

## Evidence boundary

These contracts and validators can prove only deterministic schema and transition behavior. They do not prove Apple Container, E2B, OpenShell, tmux/PTY, cloud networking, credentials, performance, cost, cleanup in a real environment, or production availability. Provider children #39–#43 own those lanes; convergence #44 owns the public registry, module/status/release updates, and aggregate evidence.
