# Workflow contracts

Workflows in this directory are repository proof operators. They must be deterministic, least-privilege, and explicit about unavailable live environments.

## Current workflow

`ci.yml` compiles Bun/TypeScript entrypoints, runs deterministic verification and selftests, checks bettor integration state, regenerates the immutable module release, compares checked-in bytes, and runs TypeScript type checking.

## Rules

- Checkout the exact PR head, not an inferred merge ref.
- Pin runtime/tool versions where supported.
- Compile entrypoints before claiming their tests ran.
- Keep positive checks and planted negative controls distinguishable.
- Upload expected generated artifacts before comparison so drift is inspectable.
- Do not grant write permissions merely to repair generated files; use a reviewed follow-up commit/PR.
- Do not use repository secrets to turn private-provider absence into PASS.
- A live canary names exact environment, subject, cleanup, and receipt; otherwise report `NOT_EXERCISED`.
- Workflow changes require their own path lease and exact-head rerun.