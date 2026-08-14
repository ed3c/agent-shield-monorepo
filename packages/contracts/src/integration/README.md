# Integration contract family

Issue [#65](https://github.com/ed3c/agent-shield-monorepo/issues/65) owns this Phase 6 foundation. Closure resolution, Skills binding, runtime binding, CLI/MCP parity, the Claude and Codex canaries, the GitHub and Forgejo origins and the release/rollback convergence consume these contracts. bettor, model carriers, forges, browsers and providers are not invoked here.

## Public schemas

```text
agent-shield/consumer-requirements/v1
agent-shield/consumer-lock/v1
agent-shield/consumer-rollback-plan/v1
```

## State machine

```text
UNRESOLVED → RELEASE_PINNED → REQUIREMENTS_VALIDATED → CLOSURE_RESOLVED
  → CONFLICTS_CHECKED → SKILLS_BOUND → RUNTIME_BOUND → SURFACES_GENERATED
  → OFFLINE_VERIFIED → ADAPTERS_PENDING
```

Each stage may only fail into the blocked state that names its own subject, so a closure failure cannot be reported as a skill conflict. This foundation stops at `ADAPTERS_PENDING`; `CANARIES_PENDING` through `ADMITTED` belong to the child issues, and no transition here can reach them.

## Immutable identity

A release is `repository` + `commit` + `tree` + `releaseId` + `releaseDigest`, where the commit and tree must be full 40-hex object IDs. There is deliberately no denylist of moving names: `main`, `HEAD`, `latest` and every tag fail the object-ID rule by construction, and a denylist on top would be dead code. The repository must be a credential-free HTTPS identity with no query, fragment or port.

## Interface versus implementation

`externalInterfaceDigest` covers the module ID, interface version, sorted capabilities and exposure flag — and nothing else. A private refactor moves `manifestSha256` and `roots` without moving the digest; an interface version, capability, requirement or exposure change moves it. Both directions are controlled.

## Default deny

An MCP tool projection is derived from the CLI catalog, never supplied. A command that policy did not expose produces no tool at all, and a command whose name reads as a shell, a private internal path, or an owner of a live subject — promote, rollback, publish, release, login, token — is refused even when policy marks it exposed. A consumer lock carrying such a tool is refused for the same reason.

## Evidence ladder

```text
offline → adapter → live-carrier → origin → equivalence → release → production
```

Ordered, and each rung is a different subject. A rung may be `PASS` only when every rung below it is `PASS`, so a live-carrier claim cannot rest on an unrun adapter and nothing rests on an unmade offline verification. `integrationEvidenceForOutcome` never returns `PASS`: this foundation's only non-failure outcome is `ADAPTERS_PENDING`, which is `NOT_EXERCISED`.

## Rollback

`planRollback` names the exact prior release, refuses when the observed target has drifted from the lock it claims to restore, refuses a rollback to the current release or across two consumers, and reports every tool and skill projection the prior lock did not have so none is orphaned.

## Controls

`integration.test.ts` runs INT-FND-001 through INT-FND-008. Each control names the message fragment its own rule produces rather than asserting only that something threw — a control that accepts any throw passes when an unrelated `TypeError` fires, which makes a dominated guard look load-bearing.

## Human boundary

Interface, lock, adapter and origin policy, merge, promotion, permission changes and rollback all require Human Admit.
