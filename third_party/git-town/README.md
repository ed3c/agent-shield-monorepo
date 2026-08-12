# Git Town v24.0.0 dependency and host-execution state

| Field | Value |
|---|---|
| Upstream | `https://github.com/git-town/git-town` |
| Pinned version | `v24.0.0` |
| Source commit | `0f3e55f5a6bae5b319dd713a0606263d0551af66` |
| Source tree | `01547d3ad145f2fdef722e240feef59e1c934038` |
| Direct license | MIT |
| Vendored license SHA-256 | `eec8a092b92231375231488d27b959e2fa2be80559c97db60c1b0458d3298791` |
| Governance issue | #15 |
| Artifact/live issue | #31 |

## State machine

```text
SOURCE/LICENSE PINNED → MACOS_ARM64 ARTIFACT/CHECKSUM/BUILD ID VERIFIED
  → TRANSITIVE 51-MODULE REVIEW → BOUNDED HUMAN ADMIT
  → HOST-LOCAL WRAPPER CANARIES → MACOS EXECUTION PASS
```

Remaining states:

```text
Linux exact artifact/environment = ABSENT
upstream release attestation = NOT_EXERCISED
committed/distributed executable = FORBIDDEN BY CURRENT ADMISSION
promoted Worker image = NOT_IMPLEMENTED
blanket organization legal approval = NOT CLAIMED
```

## Data flow

```text
exact upstream source/license/release artifact metadata
  → `V24_DEPENDENCY_ADMISSION.md`
  → host-owned macOS binary
  → `scripts/git-town/` wrapper canaries
  → metadata-only receipts and Git/PR evidence
```

The binary is not vendored. Direct MIT plus bounded transitive review does not guarantee zero legal risk or future release equivalence. Git Town PASS applies only to branch-management assertions and cannot promote product/provider/security/release state.
