# Local/cloud exchange and repair protocol

Issue [#43](https://github.com/ed3c/agent-shield-monorepo/issues/43) implements the provider-neutral exchange protocol behind the Phase 3 Runtime foundation.

## Responsibility

```text
closed exchange request
  → classify one data class
  → acquire exact writer/path lease
  → bind immutable target base
  → export through the class-specific transport
  → verify digest/policy/invariant
  → apply atomically
  → replay when required
  → emit sealed receipt
```

Local and cloud runtimes remain independently operable when this protocol is offline. The protocol does not create a load-bearing bidirectional tunnel or shared writable filesystem.

## Source State Machine

```text
source request
  → CLASSIFIED
  → LEASED
  → BASE_BOUND
  → patch paths checked against the issue/module lease
  → content-addressed patch transferred
  → result digest verified
  → staged apply
  → COMPLETED
```

The following are hard failures:

```text
expired or duplicate writer lease
target/base digest drift
out-of-scope patch path
mtime/newest/prefer-cloud/prefer-beta conflict rule
semantic conflict auto-resolution
rollback after downstream drift
```

Semantic conflict resolution, policy promotion, destructive data recovery, key/session operations, merge, and drifted rollback remain Human-owned.

## Deterministic Harness

`exchange.test.ts` runs the public contract and protocol with positive and disagreement controls for:

- source patch success, path escape, base drift, absent base, and expired lease;
- artifact and image content identity;
- monotonic policy epoch;
- snapshot + event log + invariant replay completeness;
- broker-only secret and browser/device session bindings;
- rejection of secret values, file paths, live tunnels, `newest`, and `prefer-cloud`;
- exact rollback and `ROLLBACK_REFUSED_DRIFT`;
- lifecycle transition legality and sealed outputs.

Exact-head CI executes these files through `bun test` after issue #80 is admitted.

## Stack position

```text
main + admitted #38
└── feat/p3-hybrid-exchange                       #43
    └── Phase 3 convergence from exact merged main #44
```

This branch is a path-disjoint sibling of Apple Container #39, E2B #40, OpenShell #41, and tmux/PTY #42. It must not import their private paths or edit shared provider/status/release aggregation.

## Evidence boundary

The in-memory target store proves protocol semantics only. No provider, cloud transfer, database, secret manager, session broker, production repair, performance, or cost is exercised. A Merkle/invariant digest without the declared snapshot, event log, and replayed record count cannot claim reconstruction.
