# Codex CLI consumer canary

Issue #71 (Phase 6 / INT-60). Runs the released Agent Shield consumer surface against the Codex
CLI carrier from a disposable immutable workspace, using the same carrier contract as #70 so the
two can later be compared without either standing in for the other.

## This leaf owns the adapter, not the contract

The lifecycle, the receipt shape, the host-isolation asymmetry, tool policy and turn admission
were created by #70 and are parameterised by carrier. This leaf reuses them and owns:

- the Codex-flavoured transport stand-in (`.codex/config.toml` in the context, `.codex` state);
- `runCodexCanary`, which is `runCarrierCanary` with the carrier pinned;
- an eval suite that drives **every shared rule through the Codex adapter**, so "the rule was
  reused" is a claim this suite checks rather than one this README asserts.

The shared contract currently lives under `claude-canary/` because #70 created it first.
Extracting it to a neutral directory is a convergence concern (#75), not something either
carrier leaf should do to the other's paths.

## Two carriers, one derivation, both directions asserted

The two rules that differ by carrier are *derived* rather than restated:

| | Claude Code | Codex CLI |
|---|---|---|
| own adapter file | `CLAUDE.md` | `.codex/config.toml` |
| shared context | `AGENTS.md`, `CONTEXT.md`, `ARCHITECTURE.md` | same |
| own state directory | `.claude`, `.config/claude` | `.codex`, `.config/codex` |
| foreign state directory | `.codex`, `.config/codex` | `.claude`, `.config/claude` |

Every cell is asserted, in both directions. A Codex context is refused against the Claude
requirement and vice versa — otherwise the parameter is decoration.

## The cross-carrier canary

Each leaf plants a **different** transcript canary. The Codex suite scans its receipts for
*both*, so a receipt that somehow carried Claude output would be caught as a cross-carrier leak
rather than passing a privacy check that only knew about its own carrier.

## A naming divergence, recorded in code

#70 names the absent-carrier terminal `ABSENT_CLAUDE` and the adapter stage
`CLAUDE_ADAPTER_VERIFIED`. #71 names the first `ABSENT_CODEX`. One shared state machine cannot
have both, and renaming after #70 is open would invalidate its own contract — so the Claude
names stand, and this suite **asserts that a Codex run really does report them**. A reader who
finds `ABSENT_CLAUDE` in a Codex receipt should find the reason in a test rather than guess that
the shared machine was not reused.

Carrier-neutral names would be better. That rename belongs to convergence #75, together with the
extraction above.

## Exercising it

```bash
bun test scripts/integration/codex-canary/codex-canary.test.ts
```

Deterministic and offline.

## Evidence boundary

A green suite proves the rules above against a deterministic transport. It does not prove that
the Codex CLI is installed, authenticated, reachable or correct; nor model correctness, provider
availability, Claude parity, origin equivalence (#74) or production promotion. **No model has
been called.**

## Human boundary

Authentication, host trust, permissions, network access, canary cost, model selection and release
promotion are Human or trusted-operator owned.
