# Git Town 24.0.0 dependency admission

## Scope and decision

This record admits one exact Git Town release artifact for **host-local execution** by Agent Shield's bounded Git-management scripts. It does not vendor or distribute the executable, promote a Worker image, approve later Git Town versions, or grant blanket organization/legal approval.

The repository owner gave Human Admit in [issue #31](https://github.com/ed3c/agent-shield-monorepo/issues/31#issuecomment-5261914557) for the seven named MPL-2.0 modules under that boundary. Any binary distribution, image bundling, version change, or expanded use requires a new admission.

## Exact subject

| Field | Admitted value |
|---|---|
| Release | [`git-town/git-town` `v24.0.0`](https://github.com/git-town/git-town/releases/tag/v24.0.0) |
| Tag/source commit | [`0f3e55f5a6bae5b319dd713a0606263d0551af66`](https://github.com/git-town/git-town/commit/0f3e55f5a6bae5b319dd713a0606263d0551af66) |
| Source tree | `01547d3ad145f2fdef722e240feef59e1c934038` |
| Host asset | `git-town_macos_arm_64.tar.gz` (7,390,960 bytes) |
| Asset SHA-256 | `0de42d52bad34316413c9d0ba0052d09d4ba8746930aa2cc6eaa5931562a91b2` |
| `checksums.txt` SHA-256 | `7532377166cb59dc01c74f86e3a71c54ba9567a461313a5d203a1ea99c571b24` |
| Reported version | `Git Town 24.0.0` |
| Go module | `github.com/git-town/git-town/v24 v24.0.0` |
| Build target | `darwin/arm64`, `CGO_ENABLED=0` |
| Build revision | `0f3e55f5a6bae5b319dd713a0606263d0551af66`, `vcs.modified=false` |
| Direct license | MIT |
| Exact upstream/vendored LICENSE SHA-256 | `eec8a092b92231375231488d27b959e2fa2be80559c97db60c1b0458d3298791` |

The local archive digest matched both the release asset metadata and the exact entry in the release `checksums.txt`. The extracted binary's Go build information matched the version and source commit above. These checks establish identity for the named local artifact; they are not a substitute for the release-attestation lane below.

## Active dependency inventory

`go version -m` named 51 active third-party modules. Their source license files were classified as follows; no active module had an absent or unknown license after recognizing `COPYING` as a license filename.

| License family | Module count | Treatment |
|---|---:|---|
| MIT | 29 | permissive; preserve required notices if distribution is later proposed |
| BSD family | 12 | permissive; preserve required notices if distribution is later proposed |
| Apache-2.0 | 3 | permissive with notice/patent terms; distribution is outside this admission |
| MPL-2.0 | 7 | Human Admit applies only to unchanged host-local execution |
| **Total** | **51** | exact binary inventory |

The seven MPL-2.0 modules are:

- `github.com/hashicorp/go-cleanhttp v0.5.2`
- `github.com/hashicorp/go-immutable-radix v1.3.1`
- `github.com/hashicorp/go-memdb v1.3.5`
- `github.com/hashicorp/go-retryablehttp v0.7.8`
- `github.com/hashicorp/go-version v1.9.0`
- `github.com/hashicorp/golang-lru v1.0.2`
- `github.com/shoenig/test v1.13.2`

This classification is a bounded dependency review, not a promise of zero legal risk. Notices, patents, trademarks, export constraints, and distribution obligations remain Human-owned if the use boundary changes.

## Evidence states

| Exact subject | State | Evidence boundary |
|---|---|---|
| GT-LIVE-001 release/tag/tree identity | `PASS` | GitHub release/tag data and exact Git object identity were inspected |
| archive digest against release metadata and `checksums.txt` | `PASS` | exact `git-town_macos_arm_64.tar.gz` bytes were hashed |
| executable version/build identity | `PASS` | exact extracted executable ran and `go version -m` was inspected |
| active dependency inventory and license classification | `PASS` | 51 modules from that executable were classified |
| direct upstream/vendored LICENSE byte identity | `PASS` | exact SHA-256 is enforced by `require_git_town_license` and `selftest.sh` |
| wrong-digest and wrong-version negative controls | `PASS` | planted digest and `24.0.1` expectations both exited nonzero |
| GitHub release-attestation verification | `NOT_EXERCISED` | three verification attempts did not yield a valid attestation; no fourth attempt was made |
| Git Town sync/background/conflict/portability canaries | `PASS` on the admitted macOS arm64 host artifact | GT-LIVE-002 through GT-LIVE-005 and the macOS part of GT-LIVE-006 ran under issue #31 Phase B; states are owned by `docs/git/GIT_TOWN_ADMISSION.md` |
| Linux Worker artifact and execution environment | `ABSENT` | GT-LIVE-006 makes no Linux runtime claim |
| binary commit/distribution or Worker-image promotion | `NOT_IMPLEMENTED` | explicitly outside this admission |

The pre-admission finding and Human Admit are preserved in [issue #31](https://github.com/ed3c/agent-shield-monorepo/issues/31). Candidate downloads and executable bytes are host-owned temporary evidence and must not enter Git.
