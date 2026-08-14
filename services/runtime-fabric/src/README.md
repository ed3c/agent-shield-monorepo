# Runtime fabric source boundary

This directory inherits [`../README.md`](../README.md).

- `index.ts` remains the aggregate provider/status projection and is not changed by issue #93.
- `spi/` owns the exact-subject Runtime v2 provider-neutral boundary.
- `state-machine/` owns lifecycle legality and deterministic repair controls.
- `providers/` and `exchange/` remain provider/convergence-owned; this repair changes no provider-private implementation.

```text
closed v2 request
  → exact provider and environment subjects
  → bounded provider SPI
  → content-addressed artifacts
  → explicit cleanup/preservation receipt
```

The transitional v1 parser is available only for already-merged policy/session envelopes. `runRuntimeProvider` uses the strict v2 parser, so a legacy unbound envelope cannot execute or produce provider PASS.

Module manifests, `data/status/integration.json`, immutable release bytes, and provider live evidence remain unchanged.
