# Git Town dependency notice

This directory records the direct license evidence for the Git Town executable used by the repository's stacked-PR Bash tooling.

| Field | Value |
|---|---|
| Upstream | `https://github.com/git-town/git-town` |
| Pinned version | `v24.0.0` |
| Direct license | MIT |
| Vendored license SHA-256 | `7bc26795871e4f7f5b89aaa68cd0318283530abaf0e0b4f72a0ce88fa7d0ff7d` |
| Admission issue | #15 |

The executable itself is not vendored here. A Worker image must obtain an exact `24.0.0` artifact from an admitted source and record artifact checksum, SBOM/transitive-license result, notices, and provenance before reporting the runtime dependency admitted.

Direct MIT evidence lowers licensing risk but does not guarantee zero legal risk. See `docs/git/GIT_TOWN_ADMISSION.md` and `docs/licensing/README.md`.
