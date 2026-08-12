# Services

`services/` contains typed domain logic, provider catalogs, and future provider adapters. Current services are Bun + TypeScript library modules, not independently deployed production services unless a later issue produces that environment receipt.

## Directory/state ownership

| Directory | Module/capability | Current state | Next issue stack |
|---|---|---|---|
| `document-ingest/` | `document-ingest@1.1.0`, `document.ingest/v1` | local text PASS; PDF/cloud `NOT_IMPLEMENTED` | future parser/provider issue |
| `research-orchestrator/` | `research-orchestrator@1.1.0`, `research.route/v1` | raw route PASS; signed-in lanes gaps | future browser/provider issue |
| `runtime-fabric/` | `runtime-fabric@1.1.0`, `runtime.provider/v1` | local disposable PASS; external providers gaps | #38–#44 |
| `mobile-automation/` | `product-adapters@1.0.0`, `product.automation/v1` | catalog only; provider canaries unexercised | #45/#50–#53 |
| `intent-ledger/` | `security-boundaries@1.0.0`, `security.intent/v1` | deterministic intent/threshold contract | #54–#58/#64 |
| `security-boundaries/` | `security-boundaries@1.0.0`, provider-boundary capability | high-risk providers `NOT_IMPLEMENTED` | #54–#64 |

## Shared service lifecycle

```text
REQUEST_RECEIVED → CLOSED_VALIDATION → CAPABILITY/PROVIDER_RESOLUTION
  → AUTH/POLICY CHECK → BOUNDED_EXECUTION → ARTIFACT/RECEIPT VALIDATION
  → CLEANUP → COMPLETED
```

Blocked/terminal states preserve `ABSENT`, `NOT_IMPLEMENTED`, `NOT_EXERCISED`, policy/auth refusal, timeout, provider failure, artifact failure, and cleanup failure separately.

## Data flow

```text
public contract request
  → module public entrypoint
  → optional provider adapter in its own private root
  → content-addressed artifact + typed receipt + cleanup receipt
  → consumer/status/release only through convergence owner
```

## Worker rules

- Read parent/child README, module manifest, state-machine index, Stack plan, and assigned issue.
- Cross-module imports use `packages/contracts` public exports only.
- Provider leaves do not edit shared public indexes/status/release; phase convergence owns them.
- No live owner checkout, sibling process/temp, arbitrary host path, generic shell, secret/session, or implicit fallback.
- Source/provider/package presence is not execution evidence.
