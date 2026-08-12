# Document ingest private source boundary

This directory inherits [`../README.md`](../README.md). The current public state machine is implemented through the package entrypoint only.

```text
validated request
  → local text branch: read exact bytes → SHA-256 → PASS receipt
  → PDF/cloud branch: NOT_IMPLEMENTED receipt
```

Source changes require exact-byte determinism, path/media/error controls, and compatibility with `document.ingest/v1`. Do not import this private path cross-module, add a provider without its eval-first issue, or edit shared status/release from a provider leaf.
