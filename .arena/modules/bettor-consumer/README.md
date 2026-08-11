# bettor-consumer module

- Interface: `1.0.0`
- Roots: `scripts/bootstrap-bettor.ts`, `scripts/verify-bettor-integration.ts`
- Provides: `bettor.consumer/v1`, `bettor.browser-contract/v2`
- Runtime: local/cloud `NOT_EXERCISED`
- External exposure: false; secrets: none

This module plans or applies an exact bettor-arena consumer projection and verifies the generated lock, Claude/Codex entries, Skill requirements, and MCP subject. It does not import bettor private implementation.

Missing trusted private checkout, live Claude/Codex sessions, Forgejo, or browser receipts remain `NOT_EXERCISED`. Mutable refs, host paths in committed files, and fabricated initialization PASS are forbidden.