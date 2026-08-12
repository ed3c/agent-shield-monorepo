# product-adapters module state route

- Interface: `1.0.0`
- Roots: `apps/mobile-app`, `apps/web-dashboard`, `services/mobile-automation`
- Provides: `product.mobile/v1`, `product.dashboard/v1`, `product.automation/v1`
- Requires: `runtime.provider/v1`
- Runtime: local `NOT_EXERCISED`; cloud `NOT_IMPLEMENTED`
- External exposure: false; secrets: host-only

## Current state/data flow

```text
typed action/adapter request → catalog/product contract
  → Expo/Maestro/WDA/scrcpy: NOT_EXERCISED
  → In-App bridge/cloud iOS/deploy gaps: NOT_IMPLEMENTED
  → unknown adapter: ABSENT
```

## Implementation stack

Foundation #45; dashboard #46; terminal #47; Expo #48 → In-App bridge #49; Maestro #50; WDA #51; scrcpy #52; convergence #53.

```text
authenticated action + immutable app/target artifact
  → product/QA/projection adapter
  → accessible state/artifacts/receipt + cleanup
```

#53 alone owns shared product/automation registry, interface/status/release and cross-surface evidence. Host credentials/sessions never become module bytes.

See [`../../../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](../../../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md#phase-4--product-and-mobile-automation).
