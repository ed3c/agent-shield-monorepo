# Module catalog

Each child directory contains exactly one `module.json` plus an optional README for human/Agent interpretation. The JSON manifest is the machine-readable authority; the README may explain but may not contradict it.

## Manifest contract

Required fields:

- schema and module ID;
- interface version;
- owned roots;
- provided and required capabilities;
- local/cloud runtime states;
- proof command;
- external exposure and secret boundary.

## Catalog rules

- IDs and capabilities are stable, lowercase versioned identities.
- Owned roots may not overlap across modules.
- Cross-module dependencies resolve through `requires`/`provides` and shared TypeScript contracts.
- `SUPPORTED` in a runtime declaration means the module has an admitted deterministic path; it does not automatically mean a provider or live environment was exercised.
- `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, and `NOT_EXERCISED` remain receipt states.
- Manifest or owned-contract changes require rebuilding `data/releases/agent-shield-module-set.json` and exact-head CI comparison.

## Current modules

- [`bettor-consumer/`](bettor-consumer/README.md)
- [`document-ingest/`](document-ingest/README.md)
- [`product-adapters/`](product-adapters/README.md)
- [`research-orchestrator/`](research-orchestrator/README.md)
- [`runtime-fabric/`](runtime-fabric/README.md)
- [`security-boundaries/`](security-boundaries/README.md)