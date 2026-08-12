# Research orchestrator service contract and state machine

## Owner/current evidence

- Module: `research-orchestrator@1.1.0`
- Capability: `research.route/v1`
- Requires: `document.ingest/v1`, `bettor.browser-contract/v2`
- raw-primary `external-verify` route: deterministic selection `PASS`
- DR deterministic core: contract present
- signed-in DR Stage 1: `NOT_EXERCISED`
- local signed-in GCR: `NOT_EXERCISED`
- cloud signed-in GCR broker: `NOT_IMPLEMENTED`

## State machine

```text
REQUESTED → WORKFLOW_VALIDATED → ENVIRONMENT_SELECTED → TRUST_POLICY_EVALUATED
  → ROUTED
    ├── RAW_PRIMARY_SELECTED
    ├── BROWSER_OPTIONAL_SELECTED
    ├── SIGNED_IN_LOCAL_PENDING
    ├── SIGNED_IN_CLOUD_NOT_IMPLEMENTED
    └── UNSUPPORTED/ABSENT
  → downstream artifact/provider receipt remains separate
```

## Data flow

```text
BrowserWorkflowRequest + immutable input artifact ref
  → raw-primary-first/browser/session router
  → `agent-shield/research-route/v1` receipt
  → downstream file-only body artifact + bounded metadata receipt
```

Routing PASS proves only the decision. It cannot prove source truth, browser execution, subscription availability, or evidence quality.

## Implementation ownership

Future raw/provider/browser/session leaves require separate issues and isolated host/provider receipts; a convergence owner aggregates only compatible same-subject routes. No terminal issue is assigned by #37.

## Prohibitions

No signed-in body in main context; no actor inheriting another actor's browser session; no cookie/profile/OAuth/session in Git or local↔cloud sync; no browser downgrade when raw/API bytes exist; no route fallback hidden as PASS.
