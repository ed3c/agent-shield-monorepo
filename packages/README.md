# Shared packages

`packages/` contains portable TypeScript contracts and client helpers shared across modules. Packages are not deployment environments and may not hide provider sessions or product logic.

## Current packages

| Directory | Role |
|---|---|
| `contracts/` | canonical evidence, artifact, provider, product, browser-workflow, and security-capability types |
| `agent-shield-sdk/` | validates immutable bettor MCP subject identities for external consumers |

## Rules

- Public exports are the only supported cross-module import surface.
- Internal `src` paths inherit the nearest package README and are private unless explicitly exported.
- Types preserve all evidence states; no helper converts absence/unexercised state into PASS.
- Portable contracts contain no host paths, credentials, sessions, device IDs, or mutable refs.
- Breaking changes require a new interface/schema version and transitive consumer review.
- New dependencies require exact direct/transitive license and distribution review.

Package presence proves type availability only, not provider or product execution.