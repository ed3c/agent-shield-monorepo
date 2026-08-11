# Arena control plane

`.arena/` contains machine-readable module and consumer contracts. It is authored configuration and immutable selection metadata, not runtime state or a secret store.

## Boundaries

- `modules/` — one manifest per current module.
- `consumer.requirements.json` — requested bettor-arena release, mode, and selected module components.
- `.consumer.lock.json`, managed manifests, and apply receipts — generated only by the admitted bettor initializer when that environment is exercised.

## Rules

1. Module IDs, interface versions, roots, capabilities, runtime states, proof commands, and external policy must be explicit.
2. Every owned root exists and belongs to one module boundary.
3. A manifest declaration is not provider execution evidence.
4. Generated consumer locks and receipts are content-addressed and must not be hand-edited.
5. Mutable refs, host paths, credentials, sessions, and live-checkout dependencies are forbidden.
6. New manifests require an eval-first issue, path ownership, capability review, and release-manifest restamp.

Internal files inherit this contract unless a nearer README overrides it.