# Runtime fabric source boundary

This directory inherits [`../README.md`](../README.md).

## Current source planes

- `index.ts` — the existing provider catalog/state projection and disposable local worktree subject; its registry and evidence states are unchanged by issue #38.
- `spi/` — provider-neutral admission, materialization, execution, artifact, and cleanup boundary.
- `state-machine/` — explicit lifecycle graph plus deterministic RT-FND controls.

```text
closed immutable runtime request
  → provider SPI and lifecycle
  → bounded artifact and cleanup receipt
```

Future provider roots are owned by issues #39–#43. They use the SPI and runtime contract, keep local and cloud evidence independent, and avoid cross-provider implementation imports. `index.ts`, module manifests, `data/status/integration.json`, release bytes, and aggregate evidence remain convergence #44 ownership.

The issue #38 fixture runs in memory only and changes no live provider, performance, cost, or production evidence state.
