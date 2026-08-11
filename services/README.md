# Services

`services/` contains typed domain and provider boundaries. Services are library-style Bun + TypeScript modules in the current baseline; they are not independently deployed production services unless a later issue proves that environment.

## Current boundaries

| Directory | Module | Capability | Current summary |
|---|---|---|---|
| `document-ingest/` | `document-ingest@1.1.0` | `document.ingest/v1` | local text path supported; PDF/cloud absent |
| `research-orchestrator/` | `research-orchestrator@1.1.0` | `research.route/v1` | deterministic raw-primary routing; live signed-in routes unexercised |
| `runtime-fabric/` | `runtime-fabric@1.1.0` | `runtime.provider/v1` | local disposable provider PASS; external providers separate |
| `mobile-automation/` | `product-adapters@1.0.0` | `product.automation/v1` | adapter state catalog; no simulator/device run |
| `intent-ledger/` | `security-boundaries@1.0.0` | `security.intent/v1` | deterministic intent digest and threshold boundary |
| `security-boundaries/` | `security-boundaries@1.0.0` | `security.provider-boundaries/v1` | high-risk provider capability states; native implementations absent |

## Rules for Worker Agents

- Read the nearest README and module manifest before editing.
- Public calls use `packages/contracts`; private source paths are not cross-module APIs.
- Every returned `PASS` names the exact deterministic subject exercised.
- External providers, credentials, sessions, hardware, devices, and chains require separate adapters and receipts.
- No service may silently borrow a live owner checkout or another service's process state.
- New deployable boundaries require explicit ingress, auth, secret, timeout, cleanup, and observability contracts.

Issue #19 changes local documentation only and does not promote service evidence states.