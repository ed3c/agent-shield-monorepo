# Source provenance

This directory indexes supplied source material without turning it into repository truth.

## Classification

- `SOURCE_PROPOSAL` — directly stated in a supplied source.
- `REPOSITORY_DECISION` — intentionally adopted by Agent Shield.
- `INFERENCE` — reasoning derived from one or more sources.
- `LIVE_EVIDENCE` — an immutable executed receipt.

A single claim may have a source record and a different repository status. For example, a source may describe a provider as fast or available while the repository keeps that provider `NOT_IMPLEMENTED` until a canary exists.

## Citation format

Use a stable source ID plus the most precise available locator:

```text
S-001, page 1, parsed lines 5-8
S-002, AGENTS.md at commit <sha>
S-004, Git Town 24.0 official sync documentation
```

Do not paste long transcripts into implementation documents. Link to [`SOURCE_LEDGER.md`](SOURCE_LEDGER.md), preserve the original wording in the source record, and state the repository treatment separately.

## Distribution boundary

Access-controlled conversation exports and attachments are indexed but are not automatically redistributed in this open-source repository. A later source-import issue may add a redacted, license-reviewed source pack with a digest and provenance receipt.