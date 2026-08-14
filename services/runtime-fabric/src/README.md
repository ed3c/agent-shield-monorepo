# Runtime fabric source boundary

This directory inherits [`../README.md`](../README.md).

## Current planes

- `index.ts` — existing provider catalog/status projection and disposable local-worktree subject; unchanged by issue #38.
- `spi/` — exact-subject provider-neutral admission/materialization/execution/collection/cleanup boundary.
- `state-machine/` — lifecycle graph plus deterministic RT-FND evals and interruption/cleanup controls.

```text
closed runtime request
  → exact provider + environment subjects
  → bounded provider SPI
  → content-addressed artifacts
  → explicit workspace cleanup/preservation receipt
```

Issues #39–#43 own disjoint provider/repair roots. They may consume only the public runtime contract/SPI and cannot edit another provider, `index.ts`, module manifests, `data/status/integration.json`, release bytes or aggregate evidence. Issue #44 is the single convergence owner.

The issue #38 fixture is in-memory only. It does not change any live provider, platform, performance, cost, security or production state.
