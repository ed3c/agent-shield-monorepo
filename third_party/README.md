# Third-party dependency admission records

`third_party/` stores reviewed source/license/provenance/admission records. It does not vendor executables, credentials, caches, provider sessions, or unreviewed binaries.

## Admission state machine

```text
CANDIDATE → SOURCE/RELEASE PINNED → DIRECT LICENSE VERIFIED
  → ARTIFACT/CHECKSUM/PROVENANCE VERIFIED
  → TRANSITIVE/SBOM/NOTICES/SERVICE TERMS REVIEWED
  → PLATFORM CANARY → HUMAN/LEGAL ADMIT → ADMITTED
```

Blocked states include mutable release, wrong artifact/checksum, `UNKNOWN` or disallowed terms, missing source/notices/SBOM, unsupported platform, attestation gap, or Human rejection.

## Data flow

```text
upstream source/release/license/artifact metadata
  → dependency admission record
  → host-owned exact executable/package
  → provider/tool canary receipt
  → consumer policy
```

Direct MIT/Apache/BSD evidence lowers risk but never proves zero legal/commercial risk. One child directory owns each dependency identity; new provider issues #39–#63 must create exact records where required. Current record: [`git-town/`](git-town/README.md).
