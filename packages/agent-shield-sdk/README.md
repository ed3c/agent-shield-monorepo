# Agent Shield SDK consumer-subject contract

## Current state

The SDK validates:

```ts
{ repository, commit, tool }
```

The repository is a portable GitHub identity, `commit` is exact 40-hex, and `tool` is an admitted public `loopctl_*` MCP name. Construction success proves input validation only.

## Current state machine

```text
SUBJECT_INPUT → REPOSITORY_VALIDATED → COMMIT_VALIDATED → TOOL_VALIDATED
  → BettorMcpSubject READY
```

Network acquisition, release admission, module closure, policy exposure, MCP execution, Claude/Codex, GitHub/Forgejo and cleanup remain separate states and mostly `NOT_EXERCISED`.

## Target consumer flow

```text
immutable release #65 → closure #66 → Skills #67 + runtime #68
  → CLI/MCP #69 → Claude #70 / Codex #71 / origins #72–#74
  → promotion/rollback #75
```

No mutable branch/tag/HEAD, local path/live checkout, generic shell/private loop, credential/session, or inferred reachability. Public exports and interface changes require compatibility review; aggregate promotion belongs to #75.
