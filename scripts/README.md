# Repository scripts

`scripts/` contains owner-side Bun + TypeScript control-plane entrypoints. Scripts are not public provider APIs unless a module manifest explicitly exposes them.

## Current entrypoints

| Script | Role | Mutation |
|---|---|---|
| `verify.ts` | validate module catalog, roots, capabilities, forbidden tokens, and integration status | none |
| `selftest.ts` | deterministic positive and negative controls across current module contracts | temporary fixtures only |
| `release-manifest.ts` | generate deterministic portable module release JSON | writes only the named output |
| `bootstrap-bettor.ts` | drive exact bettor project plan/apply for this consumer | target repository only when explicitly applied |
| `verify-bettor-integration.ts` | validate generated bettor consumer state | none |
| `git-town/` | documentation/Git-management Bash operators; delivered by issue #15 | Git refs/worktrees/PR metadata under explicit guards |

## Rules

- Bun + TypeScript are primary for product/control logic; Bash is limited to Git/process orchestration where requested.
- Every mutating script exposes explicit arguments, validates exact subject/state, and fails closed.
- Dry-run/planning is separate from apply/publish.
- No script reads or writes secrets to Git, logs, receipts, or generated projections.
- No generic shell-over-MCP.
- Provider/environment absence remains `ABSENT`, `NOT_IMPLEMENTED`, or `NOT_EXERCISED`.
- New entrypoints require a module owner, interface/receipt contract, evals, negative controls, timeout, artifact, and cleanup policy.

Internal source files inherit this README unless a nearer contract exists.