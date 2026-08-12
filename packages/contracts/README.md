# Canonical contracts package and state-machine foundations

`packages/contracts` is the host-neutral TypeScript vocabulary for closed requests, capabilities, artifacts, evidence states, provider/product/security/integration receipts, and cleanup boundaries. It executes no provider.

## Current public types

`EvidenceState`, `ArtifactRef`, `ModuleReceipt`, `BrowserWorkflowRequest`, `ProviderReceipt`, `ProductAdapterReceipt`, and `SecurityCapabilityReceipt` are the current baseline. `PASS` requires an exercised immutable subject.

## Contract lifecycle

```text
PROPOSED → SCHEMA_DEFINED → CLOSED_VALIDATION → POSITIVE/NEGATIVE TESTED
  → COMPATIBILITY CLASSIFIED → INTERFACE_VERSIONED → EXPORTED → CONSUMER_LOCKED
```

## Phase foundations

| Issue | Contract family | Downstream leaves |
|---|---|---|
| #38 | runtime request/provider lifecycle/artifact/cleanup | #39–#44 |
| #45 | product action/accessibility/projection/authorization | #46–#53 |
| #54 | security intent/challenge/evidence/workflow/key/ledger/operation | #55–#64 |
| #65 | consumer/release/closure/bindings/surfaces/origins/rollback | #66–#75 |

## Data flow

```text
untrusted input → closed schema and semantic validation
  → versioned typed packet/capability
  → owning module public port
  → typed artifact/receipt
```

No network, storage, secret resolution, browser/device session, runtime, cryptography, wallet, chain, or Human decision belongs in this package. A leaf may not bypass the public entrypoint or edit another foundation's contract without a compatibility/Stack decision.
