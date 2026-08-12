# GitHub control plane

`.github/` owns review intake, exact-head CI, and repository-hosted automation metadata. It does not own product logic, provider credentials, or evidence that only an external environment can produce.

## Boundaries

- `workflows/` — immutable CI subjects checked out at the exact PR head.
- `ISSUE_TEMPLATE/` — eval-first task intake; delivered by the Git Town governance stack.
- `PULL_REQUEST_TEMPLATE.md` — stack parentage, path lease, eval, evidence, and merge checklist.

## Rules

1. Workflows use least-privilege permissions and exact PR-head checkout.
2. A workflow step proves only its named subject.
3. Secrets are host-managed; values never appear in YAML, logs, artifacts, or receipts.
4. Actions and external binaries require exact-version/source/license review before admission.
5. Generated expected artifacts are uploaded even on comparison failure when useful for diagnosis.
6. Environment-owned providers may report `NOT_EXERCISED` rather than silently skip as PASS.
7. Human review/merge remains separate from Worker-Agent synchronization.

See `workflows/README.md` for workflow-local rules.