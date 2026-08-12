# Document ingest service contract

## Owner

- Module: `document-ingest`
- Interface: `1.1.0`
- Capability: `document.ingest/v1`
- Runtime declaration: local `SUPPORTED`; cloud `NOT_IMPLEMENTED`
- External exposure: denied; secrets: none

## Purpose

Convert an explicitly named local input into a content-addressed receipt. The current deterministic path reads UTF-8 text. PDF and cloud-provider branches intentionally return `NOT_IMPLEMENTED` rather than pretending to parse.

## Inputs

```ts
{ path, mediaType: "text/plain" | "application/pdf", provider: "local" | "cloud" }
```

The caller owns path authorization and immutable input selection. A future carrier should use bounded inline/content-addressed artifacts rather than arbitrary host paths.

## Outputs

`agent-shield/document-ingest-receipt/v1` with module/interface identity, evidence state, artifact digests, and detail. Raw input bodies are not implicit cross-module context.

## Current evidence

| Route | State |
|---|---|
| local UTF-8 text | deterministic `PASS` when exact bytes are read |
| local PDF | `NOT_IMPLEMENTED` |
| cloud document provider | `NOT_IMPLEMENTED` |
| malformed/encrypted/large PDF matrix | `NOT_EXERCISED` |
| provider licensing/runtime canary | `NOT_EXERCISED` |

## Non-goals and prohibitions

- Do not infer PDF support from Firecrawl AnyDoc, PDF Inspector, or another source mention.
- Do not send private documents to a cloud provider without an explicit policy and brokered credentials.
- Do not return secret-bearing content, temporary server paths, or unbounded document bodies.
- Do not collapse unreadable input, unsupported media, absent provider, and parser failure into one success state.

## Required eval families before expansion

- exact-byte and output-digest determinism;
- path escape, symlink, size, media mismatch, malformed text/PDF, and timeout controls;
- local/provider route independence;
- provider license, privacy, deletion, network, artifact, and cleanup receipts;
- mutation proving a claimed parser can disagree with malformed/encrypted fixtures.

Issue #19 owns this README. Provider implementation remains a separate issue.