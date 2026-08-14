# Authenticated In-App typed action bridge

Issue #49 (Phase 4 / UX-40). A closed request surface that maps authenticated, replay-protected
requests onto precompiled product actions, and routes anything it is not allowed to satisfy to
the gate that owns it.

## Why this is testable without React Native

The bridge is a protocol boundary, not a screen. The application is reached through
`AppActionPort` — three methods, no navigation stack, no store, no component tree. UX-BRIDGE-007
forbids server-only host primitives inside the shipped runtime, so the runtime files are plain
TypeScript by requirement, which is exactly what this repository typechecks and runs.

A boundary that can only be exercised by booting an app is one that will be exercised by booting
an app, which is to say rarely.

## What the types make unsayable

- **No public listener.** `BridgeBinding` is `loopback | brokered` with no host, address or
  interface field anywhere. UX-BRIDGE-001's `0.0.0.0` control is not a case to filter — it is a
  sentence the type cannot form. `enabled` defaults closed, and a disabled bridge never reaches
  `READY`.
- **No dynamic code.** A request names an `actionId` from the compiled registry and supplies
  admitted argument keys. There is no `method`, `module`, `url`, `script`, `command`, `path` or
  `code` field, so "download and run this" has nowhere to arrive.
- **No self-admission.** `routeFor` reads risk off the action definition. No argument, header or
  flag a caller can supply changes it, which is what UX-BRIDGE-004 has to mean to be worth
  anything. A privileged action routes to `WAITING_FOR_HARDWARE`, a human-admit action to
  `WAITING_FOR_HUMAN`, a missing scope to `DENIED` — three different answers, not one.
- **No leaky log.** `BridgeLogEntry` has four fields and none of them can hold an argument value,
  a nonce or a digest. Redaction is a property of the shape rather than a step at each call site.
  The log is bounded, and the getter returns copies so a caller cannot empty it.

## The runtime scan is real bytes

UX-BRIDGE-007 is enforced by reading each file in `SHIPPED_RUNTIME_FILES` and refusing any that
names a server-only primitive. It is a plain substring match, so it has **no false negatives** —
and it does not spare comments. That is why nothing in the shipped files names one of those
tokens even in prose: an exemption for comments is an exemption an import can hide behind. The
first run of this selftest failed on a comment in `index.ts`, and the comment was reworded rather
than the scan weakened.

The selftest itself is excluded from that list, which is load-bearing rather than an oversight:
it imports a filesystem module, so including it would fail the scan.

## Falsifiability

Every guard was disabled one at a time with the controls required to go red, including four
plants of real host primitives into a shipped file (`node:` import, `Bun` global, `process`
reference, `require` call) and one that shrinks the scanned file list to hide a file.

The `NeverPass` floor is checked separately, because it is a **compile-time** arrival and the
plant harness only runs `bun`. Widening any member of `bridgeProviderState` to `PASS` is
confirmed to fail `bunx tsc --noEmit` with `Type 'true' is not assignable to type 'never'`.

## Exercising it

```bash
bun apps/mobile-app/src/bridge/selftest.ts
bunx tsc --noEmit
```

Deterministic and offline. No device, simulator, Expo build, Hermes/JSC runtime or store
submission has been exercised, and `storeComplianceEvidence()` cannot return anything else.
