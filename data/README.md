# Repository data

`data/` stores checked-in status and release projections. It does not store user documents, secrets, live sessions, provider workspaces, mutable caches, or production databases.

## Boundaries

- `status/` — authored integration-state ledger for currently named capabilities.
- `releases/` — deterministic content-addressed portable module release manifests.

## Rules

1. Generated release files are rebuilt and byte-compared in CI.
2. Status files preserve `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, and `NOT_EXERCISED` exactly.
3. A release manifest binds portable module/contract bytes; it is not a live provider receipt.
4. Live receipts belong to an evidence system with immutable subject, environment, command, exit, artifact digests, and cleanup—not to ad hoc JSON edits here.
5. No credential, browser profile, device identifier, private key, `.env`, host path, or temporary artifact is checked in.
6. Data schema changes require an eval-first issue, migration/compatibility analysis, and negative control.

Internal files inherit the nearest child README.