# Portable Harness receipt contract

A receipt records one bounded arrival. It is not a requirement document, credential store, permanent availability guarantee, or automatic release authorization.

## Required fields

```json
{
  "schema": "agent-shield/harness-receipt/v1",
  "run_id": "stable-per-attempt-id",
  "eval_id": "EV-… or issue-scoped ID",
  "subject": {
    "kind": "commit|module-closure|release|provider|device|production-window",
    "id": "immutable identity",
    "digest": "sha256-or-null"
  },
  "environment": {
    "class": "deterministic|adapter|live|production|human",
    "provider": "name-or-null",
    "identity": "redacted non-secret identity-or-null"
  },
  "action": "fixed public operation",
  "states": {
    "mechanism": "PASS|FAIL|ABSENT|NOT_IMPLEMENTED|NOT_EXERCISED",
    "control": "PASS|FAIL|ABSENT|NOT_IMPLEMENTED|NOT_EXERCISED",
    "cleanup": "PASS|FAIL|NOT_EXERCISED"
  },
  "exit": 0,
  "artifacts": [{"kind": "report", "ref": "content-addressed-reference", "sha256": "…"}],
  "log": {"sha256": "…", "truncated": false, "limit_bytes": 1048576},
  "started_at": "RFC3339",
  "finished_at": "RFC3339",
  "exclusions": ["named capability not proved"],
  "rollback_subject": "immutable commit/release/policy/provider identity"
}
```

Module/provider-specific receipts may add fields but cannot weaken these semantics.

## Subject rules

- Bind the smallest valid subject: interface/schema, owned bytes or module closure, direct dependency interfaces, eval/fixture digest, selected Skill/runtime/policy, and live environment identity where applicable.
- Record repository commit/tree as provenance without invalidating unrelated module evidence.
- A dirty subject is named as dirty and cannot impersonate a committed release.
- Rerunning against changed bytes creates a new receipt; do not silently restamp an old subject.

## Artifact rules

- Prefer content-addressed references and digests over host paths.
- Raw documents, screenshots, video, logs, or model output follow their own privacy/retention policy.
- A portable receipt never contains secret values, cookies, browser/device profiles, private keys/shards, OAuth material, `.env`, credential-bearing URLs, or signed production transactions.
- Truncation is explicit and the retained bytes are hashed.

## State rules

- `mechanism`, `control`, and `cleanup` are independent.
- Dry-run or hashed-not-run is `NOT_EXERCISED`, not `PASS`.
- A missing tool/input/provider is `ABSENT`, not a successful denial.
- An unimplemented adapter is `NOT_IMPLEMENTED` even when its schema exists.
- A task can pass while cleanup fails; the combined report must remain red for release purposes.

## Append-only and replacement

Receipts are append-only by default. A path collision fails unless the operator explicitly selects a replacement mode, and the replacement records the superseded digest. Promotion aggregates receipts for the same immutable release/closure subject; it does not rewrite their history.

## Ownership and retention

The issue/eval owns the receipt schema; the execution plane owns sensitive raw evidence; the repository may retain portable redacted receipts or content references. Production and Human Admit receipts follow organization retention and access policy.
