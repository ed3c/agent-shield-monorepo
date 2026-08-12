# Mobile application source boundary

This private source directory inherits [`../README.md`](../README.md). Its public contract is the parent `product.mobile/v1` surface; files here do not create a second interface.

## Local state machine

```text
SOURCE_CHANGE → TYPE/SCHEMA_CHECK → ACCESSIBILITY_CHECK → APP_BUILD
  → PLATFORM_INSTALL/LAUNCH → ACTION/VIEW OBSERVATION → ARTIFACT/CLEANUP RECEIPT
```

Current source only declares the product/tooling boundary; build and device states remain `NOT_EXERCISED`, and the In-App bridge remains `NOT_IMPLEMENTED`.

## Data flow

```text
public contracts → private TS/TSX implementation → exported app artifact/action IDs
  → host-owned platform adapter → product receipt
```

Do not import provider private paths, use Bun-only runtime APIs in mobile code, add a raw listener/action dispatcher, or write implementation outside issue #48/#49 path leases. Shared status/release changes belong to #53.
