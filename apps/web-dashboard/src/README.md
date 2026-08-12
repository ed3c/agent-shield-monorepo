# Web dashboard source boundary

This private source directory inherits [`../README.md`](../README.md). Public cross-module use goes through `product.dashboard/v1` and typed receipt/action contracts.

## Local state machine

```text
SOURCE_CHANGE → TYPE/BUILD CHECK → RECEIPT-STATE FIXTURE CHECK
  → ACCESSIBILITY/AUTH/BOUNDS CONTROLS → PREVIEW CANARY → CLEANUP RECEIPT
```

Current implementation is a contract skeleton; GenUI, terminal, browser and cloud deployment remain unexercised or unimplemented as listed by the parent.

## Data flow

```text
typed receipts/actions → private view model/components → accessible rendered state
  → optional public action request → owning module receipt
```

Do not import runtime/provider private source, add generic terminal/action passthrough, persist sessions/secrets, or change shared status/release outside #53.
