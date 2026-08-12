# Mobile application contract and state machine

## Owner and current state

- Module: `product-adapters@1.0.0`
- Capability: `product.mobile/v1`
- Future tooling: Bun + TypeScript
- Shipped mobile runtime: Hermes or JavaScriptCore, not Bun
- Expo/React Native contract: present
- iOS/Android build/install/launch: `NOT_EXERCISED`
- External Maestro: `NOT_EXERCISED`
- In-App typed action bridge: `NOT_IMPLEMENTED`
- cloud mobile provider: `NOT_IMPLEMENTED`
- store release/compliance: `NOT_EXERCISED`

## State-machine ownership

Foundation [#45](https://github.com/ed3c/agent-shield-monorepo/issues/45) owns product-action/accessibility contracts. [#48](https://github.com/ed3c/agent-shield-monorepo/issues/48) owns the Expo app/build lifecycle. [#49](https://github.com/ed3c/agent-shield-monorepo/issues/49) is a real child because the In-App bridge changes the shipped runtime surface. #50–#52 own external QA/projection providers. [#53](https://github.com/ed3c/agent-shield-monorepo/issues/53) owns shared promotion/status/release.

### App lifecycle

```text
UNBUILT → TOOLCHAIN_CHECKED → CONFIG_VALIDATED → BUILDING → ARTIFACT_READY
  → INSTALLING → LAUNCHED → ACTION_READY → OBSERVING → CLOSED
```

Blocked/terminal: `ABSENT_TOOLCHAIN`, `BUILD_FAILED`, `ARTIFACT_FAILED`, `SIMULATOR_ABSENT`, `INSTALL_FAILED`, `LAUNCH_FAILED`, `ACTION_DENIED`, `TEST_NOT_EXERCISED`, `FAILED_CLEANUP`.

### In-App bridge lifecycle

```text
DISABLED → CONFIG_VALIDATED → BOUND_LOCAL → AUTHENTICATING → READY
  → REQUEST_VALIDATING → AUTHORIZING → DISPATCHING → RESPONDING → READY
  → DRAINING → DISABLED
```

Blocked/terminal: `AUTH_REFUSED`, `REPLAY_REFUSED`, `UNKNOWN_ACTION`, `INVALID_ARGUMENTS`, `RISK_REFUSED`, `RATE_LIMITED`, `TRANSPORT_FAILED`, `ACTION_FAILED`, `FAILED_SHUTDOWN`.

## Inputs and data flow

```text
typed product/security contracts + app source
  → Bun/TypeScript checks + Expo/RN artifact
  → host-owned simulator/device adapter
  → accessible view + precompiled action
  → risk/domain public capability
  → receipt-backed waiting/denied/failure/completion state
```

For the optional In-App route:

```text
brokered actor/session capability
  → framed typed request
  → schema/replay/rate/risk checks
  → closed action registry
  → app state/navigation public action
  → typed response/event receipt
```

## Outputs

- stable accessibility/test identifiers;
- typed UI/action requests;
- content-addressed build/test artifacts;
- state transition and cleanup receipts.

## Prohibitions

- no Bun/server-only APIs in shipped runtime;
- no arbitrary shell, filesystem, module/function, URL, downloaded code, or unauthenticated public listener;
- no device ID, certificate, signing material, token, profile, local-network secret, or host path in Git/portable receipts;
- no source-prose inference of App Store/Play compliance;
- no direct private coupling to Maestro, WDA, ADB, scrcpy, cloud-device, hardware, wallet, or settlement internals.

Full eval families are in issues #45, #48, #49, and #53. Leaf source inherits this README.
