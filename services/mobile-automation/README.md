# Mobile automation service contract and implementation stack

## Owner/current adapter states

- Module: `product-adapters@1.0.0`
- Capability: `product.automation/v1`
- Requires: `runtime.provider/v1`
- secrets: host-only; external exposure denied

| Adapter | State |
|---|---|
| Expo, Maestro, WDA, scrcpy | `NOT_EXERCISED` |
| cloud iOS, In-App bridge | `NOT_IMPLEMENTED` in their owning product routes |
| unknown adapter | `ABSENT` |

## State machine

```text
REQUESTED → ADAPTER/PLATFORM_VALIDATED → CATALOG_LOOKUP
  → ARTIFACT/TARGET/LEASE CHECK
  → TOOL/PROVIDER EXECUTION
  → REPORT/MEDIA/STATE RECEIPTS
  → TARGET/PROCESS/PORT/LEASE CLEANUP
```

Blocked states preserve missing tool/target, unsupported platform, lease/auth refusal, invalid flow/action, assertion failure, timeout, artifact failure, and cleanup failure.

## Data flow

```text
exact app artifact + target lease + bounded action/flow
  → selected Maestro/WDA/scrcpy public provider
  → accessibility/action execution
  → content-addressed JUnit/screenshot/video/frame artifacts
  → ProductAdapterReceipt + cleanup receipt
```

## Molecular Stack PR ownership

- #45 shared product/action/projection contracts
- #50 External MCP-to-Maestro
- #51 iOS WDA
- #52 Android scrcpy
- #53 public automation registry/module/status/release and cross-provider matrix

Expo app #48 and In-App bridge #49 are app owners, not automation provider code.

## Prohibitions

No inferred simulator/device/session; no unauthenticated WDA/ADB port; no arbitrary remote script/path/shell/device ID; no signing/profile/key/session/host path in Git/MCP/artifacts; no YAML or accessibility declaration as E2E PASS; no platform/provider proxying.
