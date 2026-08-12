# Integration status ledger

`integration.json` is the compact, reviewed view of current named capability states. It helps Agents avoid inferring implementation from architecture prose.

## Semantics

- `PASS` — exact deterministic subject exercised successfully.
- `FAIL` — exact subject exercised and disagreed.
- `ABSENT` — required subject/input does not exist.
- `NOT_IMPLEMENTED` — adapter/provider/mechanism intentionally does not exist.
- `NOT_EXERCISED` — contract exists but its live/environment-owned canary has not run.

## Rules

1. Every `PASS` must be traceable to a deterministic test or immutable receipt.
2. A successful routing decision cannot promote its downstream provider.
3. Optional skips, missing private checkout, missing auth, or unavailable device/browser remain non-PASS states.
4. Status keys are stable identities; renames require traceability migration.
5. Manual status changes require an issue/PR that names the exact new evidence.
6. The ledger is not a progress percentage and must not collapse multiple provider states.

The current ledger intentionally keeps PDF/cloud runtime/product/security/bettor/live session gaps visible.