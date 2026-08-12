# research-orchestrator module state route

- Interface: `1.1.0`
- Root: `services/research-orchestrator`
- Provides: `research.route/v1`
- Requires: `document.ingest/v1`, `bettor.browser-contract/v2`
- Runtime: local `SUPPORTED`; cloud `PARTIAL`
- External exposure: false; secrets: none

## State machine/data flow

```text
workflow/artifact request → route policy
  → external-verify raw-primary selection: deterministic route PASS
  → signed-in DR/GCR local: NOT_EXERCISED
  → cloud signed-in GCR: NOT_IMPLEMENTED
  → downstream browser/source receipt remains separate
```

Routing never proves browser execution, source truth, subscription availability, or body isolation. Profile/cookie/OAuth/session state stays host-owned.

See [`../../../services/research-orchestrator/README.md`](../../../services/research-orchestrator/README.md) and [`../../../docs/state-machines/README.md`](../../../docs/state-machines/README.md#4-research-routing).
