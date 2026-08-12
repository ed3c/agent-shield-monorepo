# Integration evidence-state projection

`integration.json` is the authored current-state ledger for named capabilities. It is not changed by architecture prose, package presence, or a leaf issue without its convergence owner.

## State machine

```text
CURRENT_STATE → EXACT RECEIPT VALIDATED → ASSERTION/CONTROL/CLEANUP REVIEWED
  → TRANSITION AUTHORIZED → STATUS UPDATED → RELEASE/TRACE RESTAMPED
```

Allowed states remain distinct: `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, `NOT_EXERCISED`; blocked/Human/cleanup detail lives in the owning receipt/index until schema admission.

```text
exact provider/product/driver/origin receipt
  → state-transition review
  → `integration.json`
  → README/trace/release consumer
```

Phase convergence owners: runtime #44, product #53, security #64, bettor integration #75. Unrelated module states must not change because repository HEAD moved.
