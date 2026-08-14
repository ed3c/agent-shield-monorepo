# OpenShell policy broker

Issue [#41](https://github.com/ed3c/agent-shield-monorepo/issues/41) owns this path-disjoint Bun + TypeScript adapter.

## Current upstream observation

The current canonical upstream is `NVIDIA/OpenShell`, not the earlier source proposal's `openshell-ai/openshell` path. This implementation pins source commit `c4b500a7de64d0b66e3ee8098f58d14299092162` as a schema reference only.

At that subject, the upstream policy example uses `version: 1`, `filesystem_policy`, `landlock`, and named `network_policies`. Upstream documentation separates static filesystem/process domains, which are locked at sandbox creation, from dynamic network/inference domains, which may be updated on a running sandbox. The observed development release is a mutable prerelease channel, so no executable artifact is admitted by this directory.

## Responsibility

```text
closed RuntimeRequest
  + exact source-policy subject
  + monotonic policy epoch
  + static filesystem/process subjects
  + dynamic network/inference subjects
  + opaque credential bindings
  → compile deterministic OpenShell policy envelope
```

The broker emits a typed policy document and one of:

```text
CREATE_REQUIRED
HOT_RELOAD_DYNAMIC
NO_CHANGE
```

A static filesystem/process change cannot be mislabeled as a hot reload. Network and inference changes may be proposed for hot reload only when the static digest is unchanged.

## State Machine

```text
UNRESOLVED
  → POLICY_RESOLVED
  → POLICY_VERIFIED
  → AUTHORIZED
  → COMPILED
  → COMPLETED
```

Blocked terminals:

```text
ABSENT_POLICY
STALE_EPOCH
REFUSED_TASK
REFUSED_NETWORK
REFUSED_FILESYSTEM
FAILED_POLICY_SCHEMA
```

## Security boundaries

- The external caller supplies a typed workload, not a command, shell, argv, cwd, environment value, or private provider flag.
- Runtime writable/read-only roots must be covered by the static filesystem policy.
- Runtime network allowlists and compiled dynamic endpoints must agree exactly.
- Wildcards, localhost, host paths, credential-bearing URLs, file-backed secrets, and raw credential values are rejected.
- Credential data remains an opaque broker reference; it is not written into the policy document or receipt.
- `PASS` means only that the exact deterministic compiler/controls passed. `externalRuntimeState` remains `NOT_EXERCISED` until an admitted OpenShell artifact and live sandbox receipt exist.

## Stack and ownership

```text
main + admitted #38/#43
└── feat/p3-openshell-policy                       #41
    └── Phase 3 convergence from exact merged main #44
```

This directory does not own Apple Container, E2B, tmux/PTY, shared registries, module manifests, status, releases, credentials, or production promotion.
