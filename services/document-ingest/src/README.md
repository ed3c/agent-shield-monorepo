# Document-ingest source boundary

This leaf inherits [`../README.md`](../README.md), root `AGENTS.md`, and module `document-ingest`. It owns the deterministic TypeScript ingest adapter behind `document.ingest/v1`.

Inputs are explicit local paths plus declared media type/provider. Outputs are `ModuleReceipt` objects with content digests and named evidence state. Other modules consume the public capability or receipt, not this private path.

Current local UTF-8 text ingestion can return `PASS`; cloud and PDF parser routes return `NOT_IMPLEMENTED`. Do not add a parser/provider, network route, or new media type without an eval-first implementation issue, exact dependency-license review, malformed-input controls, provenance, and cleanup evidence. Issue #19 / evals `E30.1`–`E30.4` govern this README.
