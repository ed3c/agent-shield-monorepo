# Document ingest service contract and state machine

## Owner/current evidence

- Module: `document-ingest@1.1.0`
- Capability: `document.ingest/v1`
- external exposure: denied; secrets: none
- local UTF-8 text: deterministic `PASS` for exact bytes
- local PDF: bounded parser implementation in issue #139; live/general PDF capability is not promoted by fixture tests
- cloud provider: `NOT_IMPLEMENTED`
- signed-in/cloud document routes: separate #139 lanes

## State machine

```text
REQUESTED -> INPUT_VALIDATED -> PROVIDER_SELECTED
  |-- local + text/plain -> BYTES_READ -> DIGESTED -> RECEIPT(PASS)
  |-- local + application/pdf
  |     -> SIZE/HEADER/ENCRYPTION_PREFLIGHT
  |     -> STREAM_ENUMERATED
  |     -> FILTER_DECODED (unfiltered | FlateDecode)
  |     -> TEXT_OPERATORS_EXTRACTED
  |     -> INPUT+TEXT_DIGESTED
  |     -> RECEIPT(PASS for this exact supported PDF)
  |     -> NOT_IMPLEMENTED for encrypted/image-only/unsupported encoding/filter
  |     -> FAIL for malformed or resource-bound violations
  |-- cloud provider -> NOT_IMPLEMENTED
  `-- unreadable/mismatched input -> FAIL
```

The local PDF parser is deliberately **bounded**, not a claim of complete ISO PDF support. It uses only platform primitives and does not widen the Bun lockfile to registry packages. The repository lockfile gate currently rejects all non-workspace registry dependencies, so `pdfjs-dist` cannot enter this lane without a separate dependency-governance decision.

## Local PDF limits

```text
input bytes        <= 16 MiB
stream count       <= 256
single stream      <= 8 MiB
decoded aggregate  <= 32 MiB
extracted text     <= 2,000,000 chars
supported filters  none, FlateDecode
```

Known image filters are not interpreted as text. Encryption, OCR/image-only pages, unsupported filters, complex font encodings, and full PDF layout fidelity remain outside this molecular leaf and must stay distinct from `PASS`.

## Data flow

```text
explicit authorized input
  -> exact bytes + media/provider identity
  -> bounded local parser route
  -> text only when supported operators are observed
  -> input digest + extracted-text digest
  -> `agent-shield/document-ingest-receipt/v1`
```

No extracted body is placed in the receipt. Only digests and bounded details cross the module boundary.

## Issue/DAG ownership

```text
#139 source closure
|-- feat/139-local-pdf-bounded-parser   (this molecular deterministic leaf)
|-- live/doc-cloud-provider             (not exercised here)
|-- live/research-signed-in-browser     (not exercised here)
`-- live/research-gcr-cloud              (not exercised here)
```

Shared `data/status/integration.json` and release promotion remain convergence-owned. A fixture test may prove parser behavior; it cannot claim cloud, authenticated browser, production, or arbitrary-PDF support.

## Prohibitions

No PDF support inferred from extension/source names; no private document cloud upload without policy/broker; no temp server path/secret/unbounded body in receipt; no folding unsupported media, absent provider, parser failure, image-only content, encryption, and PASS into one state.
