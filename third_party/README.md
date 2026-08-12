# Third-party dependency records

`third_party/` stores reviewed license/provenance notices required to understand an admitted external tool. It does not vendor executables, credentials, caches, or provider sessions unless a dedicated supply-chain decision explicitly allows them.

## Rules

- One child directory per dependency/tool identity.
- Record upstream source, exact version, direct license, license-byte digest, admission issue, and remaining SBOM/transitive/notice work.
- A permissive direct license lowers risk but does not guarantee zero legal risk.
- Executable acquisition requires exact artifact identity/checksum and trusted provenance outside this notice directory.
- `UNKNOWN`, conflicting, copyleft, source-available-only, or field-of-use-restricted terms fail closed until Human Admit.
- Never copy a license file without retaining its required notice and upstream identity.

Current record: [`git-town/`](git-town/README.md).