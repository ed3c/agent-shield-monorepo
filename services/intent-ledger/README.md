# Intent ledger service contract

## Owner

- Module: `security-boundaries`
- Interface: `1.0.0`
- Capability: `security.intent/v1`
- Runtime declaration: local `PARTIAL`; cloud `NOT_IMPLEMENTED`
- External exposure: denied; secrets: none

## Purpose

Canonicalize an intent, bind its evidence references into a SHA-256 digest, and make a deterministic MVP threshold decision. It is an intent/risk contract—not an append-only database, OPA deployment, cryptographic ledger, approval system, or settlement engine.

## Inputs

```ts
{ id, target, amountMinor, evidence[] }
```

Required fields are closed, the amount is an integer minor-unit value, and evidence is sorted for digest stability. A configurable deterministic threshold separates the reference allow/refuse paths.

## Outputs

`RiskDecision`:

- `PASS` only when the exact deterministic input is within the reference threshold;
- `FAIL` for missing closed fields or when a Human Approval boundary is required;
- a content digest binding the canonical intent.

## Current evidence

| Subject | State |
|---|---|
| canonical intent/digest logic | deterministic contract present |
| reference low-value threshold route | deterministic `PASS` for exact fixture |
| high-value Human Approval boundary | deterministic `FAIL` for exact fixture |
| durable append-only ledger | `NOT_IMPLEMENTED` |
| OPA/semantic model | `NOT_IMPLEMENTED` |
| cloud risk service | `NOT_IMPLEMENTED` |
| production financial policy | `NOT_EXERCISED` |

## Non-goals and prohibitions

- The reference threshold is not a production risk policy or financial recommendation.
- `FAIL` meaning “human approval required” is not transaction denial evidence from a production policy engine.
- Do not store personal/financial secrets or raw prompt bodies in the digest record.
- Do not describe the current function as immudb, Merkle anchoring, OPA, Temporal, AML, MPC, or chain settlement.
- No percentage or “absolute security” claim is accepted.

## Required eval families before expansion

- canonicalization stability, duplicate/empty evidence, amount boundary, target normalization, and replay controls;
- explicit policy version and decision reason;
- durable append-only write/read/audit and restore evidence;
- prompt-injection/semantic-policy disagreement controls;
- Human Approval timeout/refusal and identity receipts;
- privacy, retention, redaction, and cleanup evidence.

Issue #19 owns this README only.