# Arena control plane

`.arena/` contains machine-readable module and consumer contracts. It is authored configuration and immutable selection metadata, not runtime state or a secret store. This file is also the nearest README for the `modules/` catalog itself; each module directory has its own child README.

## Boundaries

- `modules/` — one manifest per current module; the JSON manifest is machine-readable authority and the child README may explain but not contradict it.
- `consumer.requirements.json` — requested bettor-arena release, mode, and selected module components.
- `.consumer.lock.json`, managed manifests, and apply receipts — generated only by the admitted bettor initializer when that environment is exercised.

## Module manifest contract

Each manifest declares schema, module ID, interface version, owned roots, provided/required capabilities, local/cloud runtime state, proof command, external exposure, and secret boundary.

Current module contracts:

- [`modules/bettor-consumer/`](modules/bettor-consumer/README.md)
- [`modules/document-ingest/`](modules/document-ingest/README.md)
- [`modules/product-adapters/`](modules/product-adapters/README.md)
- [`modules/research-orchestrator/`](modules/research-orchestrator/README.md)
- [`modules/runtime-fabric/`](modules/runtime-fabric/README.md)
- [`modules/security-boundaries/`](modules/security-boundaries/README.md)

## Rules

1. Module IDs, interface versions, roots, capabilities, runtime states, proof commands, and external policy must be explicit.
2. Every owned root exists and belongs to one module boundary; ownership roots may not overlap.
3. Cross-module dependencies resolve through `requires`/`provides` and public typed contracts.
4. A manifest declaration or `SUPPORTED` runtime field is not provider execution evidence.
5. `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, and `NOT_EXERCISED` remain distinct receipt states.
6. Generated consumer locks and receipts are content-addressed and must not be hand-edited.
7. Mutable refs, host paths, credentials, sessions, and live-checkout dependencies are forbidden.
8. New manifests or owned-contract changes require an eval-first issue, path ownership, capability review, and immutable release-manifest restamp.

Internal files inherit this contract unless a nearer README overrides it.