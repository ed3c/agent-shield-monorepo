# Runtime fabric source boundary

This directory inherits [`../README.md`](../README.md).

## Current planes

- `index.ts` — existing provider catalog/state projection and disposable local-worktree subject; unchanged by issue #38.
- `spi/` — exact-subject provider-neutral admission, materialization, execution, collection, recovery-cleanup, and cleanup boundary.
- `state-machine/` — lifecycle graph and RT-FND contract, availability, execution, timeout/cancellation, recovery, artifact, and cleanup controls.

```text
closed immutable runtime request
  → bounded stage contexts
  → provider SPI and lifecycle
  → stage-aware artifact/cleanup receipt
```

Issues #39–#43 own provider-private roots after this foundation is admitted. They may consume the public runtime subpath and SPI but may not import sibling provider internals. `index.ts`, `.arena` manifest/interface version, `data/status/integration.json`, immutable release bytes, aggregate evidence, and promotion remain convergence #44 ownership.

The issue #38 fixture runs in memory only. It changes no live provider, platform, credential, isolation, performance, cost, cleanup, or production evidence state.
