# Agent Shield SDK contract

## Purpose

The current SDK validates a portable, immutable bettor MCP subject:

```ts
{ repository, commit, tool }
```

The repository must be a portable GitHub identity, the commit must be exact 40-hex, and the tool must be a public `loopctl_*` MCP name.

## Outputs

A `BettorMcpSubject` value suitable for a later consumer or transport. Construction success proves input validation only; it does not prove the repository is reachable, the release is admitted, the tool is exposed, or the MCP call ran.

## Rules

- No mutable `main`, `HEAD`, branch, or floating tag.
- No local absolute path or owner live checkout identity.
- No generic shell or private loop name.
- No credential, token, cookie, profile, or session inside subject values.
- Network acquisition, module closure, policy exposure, call execution, and cleanup each require separate receipts.
- New public exports require an interface/version and consumer compatibility decision.

## Current evidence

Input validation is deterministic. Bettor private initialization, GitHub/Forgejo origin equivalence, Claude/Codex live sessions, and MCP execution remain separate and may be `NOT_EXERCISED`.