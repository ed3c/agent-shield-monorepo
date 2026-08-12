# Intent ledger reference contract and future security flow

## Owner/current evidence

- Module: `security-boundaries@1.0.0`
- Capability: `security.intent/v1`
- local runtime: `PARTIAL`; cloud: `NOT_IMPLEMENTED`
- canonical intent/digest logic: present
- low-value reference threshold: deterministic PASS for exact fixture
- high-value Human Approval boundary: deterministic FAIL for exact fixture
- durable ledger, OPA, workflow, cloud risk: `NOT_IMPLEMENTED`

## Current state machine

```text
REQUESTED → CLOSED_FIELDS_VALIDATED → EVIDENCE_NORMALIZED/SORTED → DIGESTED
  ├── amount within reference threshold → PASS for exact deterministic fixture
  ├── threshold requires Human Approval → FAIL for exact deterministic fixture
  └── malformed/missing input → FAIL
```

This `FAIL` is a reference Human-boundary result, not production policy denial.

## Target flow and owners

```text
canonical intent
  → OPA policy #55
  → durable workflow #56
  → optional hardware/signing providers #59–#61
  → verified ledger #58
  → contract/testnet #62–#63
  → convergence/Human dossier #64
```

Foundation #54 defines the shared security intent/challenge/evidence states.

## Data flow

```text
{id,target,amountMinor,evidence refs}
  → canonicalization and SHA-256 content identity
  → reference decision/current receipt
  → future versioned policy/workflow/ledger providers through public contracts
```

## Prohibitions

The threshold is not financial policy; no raw prompt/personal/financial secret in digest record; no current claim of immudb/Merkle/OPA/Temporal/AML/MPC/chain; no absolute or percentage security claim; provider leaves do not edit shared status/release outside #64.
