# Git Town dependency notice

This directory records the exact release and license evidence for the Git Town executable used by the repository's stacked-PR Bash tooling.

| Field | Value |
|---|---|
| Upstream | `https://github.com/git-town/git-town` |
| Pinned version | `v24.0.0` |
| Source commit | `0f3e55f5a6bae5b319dd713a0606263d0551af66` |
| Source tree | `01547d3ad145f2fdef722e240feef59e1c934038` |
| Direct license | MIT |
| Vendored license SHA-256 | `eec8a092b92231375231488d27b959e2fa2be80559c97db60c1b0458d3298791` |
| Policy issue | #15 |
| Artifact admission issue | #31 |

The executable itself is not vendored here. [`V24_DEPENDENCY_ADMISSION.md`](V24_DEPENDENCY_ADMISSION.md) records the exact macOS arm64 release artifact, build identity, 51-module inventory, license classification, and bounded Human Admit. That decision allows host-local execution only: it does not admit committing or distributing the binary, promote a Worker image, or turn the unverified release-attestation lane into `PASS`.

Direct MIT evidence lowers licensing risk but does not guarantee zero legal risk. See `docs/git/GIT_TOWN_ADMISSION.md` and `docs/licensing/README.md`.
