# Source technology review matrix

This matrix preserves the broad technology choices from `S-001` while preventing a source table from becoming an admitted dependency list. `VERIFY_REQUIRED` means current exact-version review is absent.

| Capability | Source candidate(s) | Source-stated license class | Repository decision | Current evidence |
|---|---|---|---|---|
| stacked PRs | Git Town | MIT direct; 29 MIT, 12 BSD-family, 3 Apache-2.0, 7 MPL-2.0 active modules | v24.0.0 host-local artifact admitted by #31 / PR #33 | exact macOS arm64 checksum/build/inventory `PASS`; MPL modules Human-admitted for host-local use; attestation `NOT_EXERCISED`; no binary distribution |
| cloud sandbox | E2B, Cloudflare Computer, Daytona | Apache-2.0 / provider-specific | candidate providers behind `runtime.provider/v1` | `NOT_IMPLEMENTED`, `VERIFY_REQUIRED` |
| local sandbox | Apple Container | Apache-2.0 | candidate local provider | `NOT_EXERCISED`, `VERIFY_REQUIRED` |
| terminal lifecycle | tmux | BSD | candidate session adapter | `NOT_EXERCISED`, `VERIFY_REQUIRED` |
| policy shell | OpenShell | source states Apache-2.0 | candidate broker/provider | `NOT_IMPLEMENTED`, `VERIFY_REQUIRED` |
| ingress | Caddy, mkcert, cloudflared | Apache-2.0 / BSD | candidate providers | `NOT_IMPLEMENTED`, `VERIFY_REQUIRED` |
| web UI | Next.js ecosystem, Vercel AI SDK, shadcn/ui, Xterm.js | source states MIT | product-adapter candidates | contract only, `VERIFY_REQUIRED` |
| mobile | React Native/Expo, Bun tooling, Hermes runtime | source states MIT | Bun+TS tooling direction adopted; device engine remains Hermes/JSC | product provider `NOT_IMPLEMENTED`/`NOT_EXERCISED` |
| mobile QA/projection | Maestro, WDA, scrcpy variants | Apache-2.0 / BSD candidates | external bounded adapters only | `NOT_EXERCISED`, `VERIFY_REQUIRED` |
| VFS/object access | Mirage, R2/S3 candidates, Floci | mixed source-stated permissive/service terms | capability candidates, not canonical storage | `NOT_IMPLEMENTED`, `VERIFY_REQUIRED` |
| document parsing | AnyDoc/other parser provider | source says open source | independent provider required | local text only; PDF/provider `NOT_IMPLEMENTED` |
| memory/vector | Mem0, LanceDB | source states Apache-2.0 | no production provider admitted | `NOT_IMPLEMENTED`, `VERIFY_REQUIRED` |
| policy/workflow | OPA, Temporal | Apache-2.0 / MIT candidates | security-provider boundaries only | `NOT_IMPLEMENTED`, `VERIFY_REQUIRED` |
| verifiable ledger | immudb | source states Apache-2.0 | candidate ledger provider | `NOT_IMPLEMENTED`, `VERIFY_REQUIRED` |
| secret broker | OpenBao | source states Apache-2.0 | candidate secret provider | `NOT_IMPLEMENTED`, `VERIFY_REQUIRED` |
| MPC/TSS | tss-lib or other audited provider | source states MIT/Apache candidates | no cryptographic implementation admitted | `NOT_IMPLEMENTED`, audit required |
| account abstraction | ZeroDev/permissionless/viem candidates | source states MIT | no contract/provider admitted | inert/typed boundary only |

## Excluded-by-default classes

The source explicitly asks to avoid LGPL-3.0, GPL, AGPL, SSPL, and BSL for this commercial baseline. Agent Shield also fails closed on MPL/EPL/CDDL, custom, dual, unknown, missing, source-available, and field-of-use terms until a dedicated review says otherwise.

## Verification fields for an implementation issue

Each exact dependency row must add:

```text
name and capability
repository/package/artifact identity
version/tag/commit
artifact checksum
source availability
license text digest
transitive SBOM and scan result
NOTICE/attribution/patent/trademark obligations
runtime/provider service terms
security and maintenance state
distribution modes
owner issue and Human Admit
```

A provider benchmark, price, startup time, App Store statement, or “commercially safe” claim also requires current official evidence and a live canary where applicable.
