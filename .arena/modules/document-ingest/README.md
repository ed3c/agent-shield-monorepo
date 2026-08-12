# document-ingest module state route

- Interface: `1.1.0`
- Root: `services/document-ingest`
- Provides: `document.ingest/v1`
- Runtime: local `SUPPORTED`; cloud `NOT_IMPLEMENTED`
- External exposure: false; secrets: none

## State machine/data flow

```text
request → validate media/provider
  → local text: exact bytes → digest → PASS receipt
  → local PDF/cloud: NOT_IMPLEMENTED
  → missing input/provider: ABSENT
  → invalid/unreadable input: FAIL
```

A source mention, parser package, or architecture diagram cannot change these states. Future parser/provider work requires an eval-first issue and may not edit shared module/status/release outside its convergence owner.

See [`../../../services/document-ingest/README.md`](../../../services/document-ingest/README.md) and [`../../../docs/state-machines/README.md`](../../../docs/state-machines/README.md#3-document-ingest).
