# document-ingest module

- Interface: `1.1.0`
- Root: `services/document-ingest`
- Provides: `document.ingest/v1`
- Runtime: local `SUPPORTED`; cloud `NOT_IMPLEMENTED`
- External exposure: false; secrets: none

The admitted deterministic subject is local UTF-8 text ingestion with content digests. PDF parsing and cloud providers are explicitly `NOT_IMPLEMENTED`. See `services/document-ingest/README.md` for inputs, outputs, prohibitions, and future eval families.

A source mention, parser package, or architecture diagram cannot change these states.