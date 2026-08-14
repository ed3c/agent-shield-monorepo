# Local/cloud exchange contracts

Issue [#43](https://github.com/ed3c/agent-shield-monorepo/issues/43) owns this Bun + TypeScript contract family.

This directory defines the typed exchange request, target state, lifecycle receipt, rollback receipt, and closed validators used to move one classified subject between independently operable local and cloud environments.

## Data-class routing

```text
source code
  → branch + immutable Git base + content-addressed patch
  → path-lease check
  → review/rebase

generated artifact
  → content-addressed object
  → digest selection

policy/config
  → schema + monotonic policy epoch
  → staged promotion

OS/dependencies
  → image/template identity
  → exact rebuild/pin

database/memory
  → snapshot + event log + invariant proof
  → replay and record-count verification

secret
  → opaque broker binding only

browser/device session
  → execution-plane broker binding only
```

## Public schemas

```text
agent-shield/exchange-request/v1
agent-shield/exchange-receipt/v1
agent-shield/exchange-rollback-receipt/v1
```

## State Machine

```text
UNRESOLVED
  → CLASSIFIED
  → LEASED
  → BASE_BOUND
  → EXPORTED
  → TRANSFERRED
  → VERIFIED
  → APPLIED
      ├─ non-data class → COMPLETED
      └─ data class → REPLAYED → COMPLETED
```

Blocked terminal states remain distinct:

```text
ABSENT_BASE
LEASE_CONFLICT
BASE_DRIFT
PATH_CONFLICT
POLICY_REFUSED
TRANSFER_FAILED
VERIFY_FAILED
APPLY_FAILED
REPLAY_FAILED
ROLLBACK_REFUSED_DRIFT
```

## Ownership boundary

This leaf owns only `packages/contracts/src/exchange/**`. It does not own the root package export map, module manifest, integration status, immutable release, provider registry, or provider-private code. Convergence issue #44 owns aggregate exposure and promotion.

The contract rejects unknown/inherited keys, timestamp/newest/prefer-cloud authority, path traversal, credential-bearing repository identities, secret values, file-backed secret references, and copied browser/device sessions.

## Evidence boundary

A deterministic contract test can prove classification, lease, base, path, digest, replay, and rollback rules. It does not prove a runtime provider, database reconstruction, key resharing, browser/device transport, network transfer, or production recovery.
