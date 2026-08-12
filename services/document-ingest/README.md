# Document ingest service contract and state machine

## Owner/current evidence

- Module: `document-ingest@1.1.0`
- Capability: `document.ingest/v1`
- external exposure: denied; secrets: none
- local UTF-8 text: deterministic `PASS` for exact bytes
- local PDF: `NOT_IMPLEMENTED`
- cloud provider: `NOT_IMPLEMENTED`
- malformed/encrypted/large PDF/provider canaries: `NOT_EXERCISED`

## State machine

```text
REQUESTED → INPUT_VALIDATED → PROVIDER_SELECTED
  ├── local + text/plain → PATH_AUTHORIZED → BYTES_READ → DIGESTED
  │                       → ARTIFACT/RECEIPT_EMITTED(PASS)
  ├── local + application/pdf → NOT_IMPLEMENTED
  ├── cloud provider → NOT_IMPLEMENTED
  ├── required path/tool/provider absent → ABSENT
  └── invalid/unreadable/mismatched input → FAIL
```

## Data flow

```text
explicit authorized input or future bounded carrier
  → exact bytes + media/provider identity
  → extractor/parser route
  → content digest + artifact ref + provenance
  → `agent-shield/document-ingest-receipt/v1`
```

Raw bodies do not become implicit cross-module context. Future transport should use bounded inline/content-addressed carriers rather than caller host paths.

## Implementation ownership

This documentation PR assigns no parser provider. A future issue must separately own parser SPI/provider, exact dependency/license/privacy/network/size/timeout/deletion/cleanup evals, malformed/encrypted fixtures, and convergence/status update.

## Prohibitions

No PDF support inferred from source names; no private document cloud upload without policy/broker; no temp server path/secret/unbounded body in receipt; no folding unsupported media, absent provider, parser failure, and PASS.
