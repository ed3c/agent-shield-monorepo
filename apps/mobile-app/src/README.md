# Mobile application source boundary

This private source directory inherits [`../README.md`](../README.md). Its public contract is the parent `product.mobile/v1` surface; files here do not create a second interface.

## Local state machine

```text
SOURCE_CHANGE → TYPE/SCHEMA_CHECK → ACCESSIBILITY_CHECK → APP_BUILD
  → PLATFORM_INSTALL/LAUNCH → ACTION/VIEW OBSERVATION → ARTIFACT/CLEANUP RECEIPT
```

Issue #48 implements that lifecycle over a host-owned platform adapter. Build, install and
launch remain `NOT_EXERCISED` — no toolchain or simulator runs here — and the In-App bridge
remains `NOT_IMPLEMENTED` (#49).

## What is here and what is not

**No Expo build runs here and no simulator is driven here.** The toolchain and the simulators
live behind `ExpoPlatformAdapter`; this directory owns the rules around them:

| File | Owns |
|---|---|
| `types.ts` | the app lifecycle states, subjects, catalogs and the adapter boundary |
| `state-machine.ts` | the transition table, asserted for terminality and reachability at load |
| `app.ts` | toolchain admission, shipped-import closure, accessibility catalog, action closure, outcome-to-tone projection |
| `build.ts` | artifact determinism, the lane lifecycle, cleanup accounting, lane aggregation |
| `sealed-build-log.ts` | the one type that holds build output |
| `fake-platform.ts` | a deterministic stand-in with one knob per negative control |

## The import rule is an allowlist

`ALLOWED_RUNTIME_IMPORTS` names what a Hermes or JSC bundle may import. A denylist of Bun
globals would have to be extended every time the tooling grows an API, and the version that has
not been extended yet looks exactly like a passing check. An allowlist fails closed on anything
unrecognised, including the API nobody has heard of yet.

It is checked *before* the build, because a bundle importing `node:fs` builds successfully and
fails at launch — where the failure is a red screen rather than a named state.

## One platform result can never stand in for two

`ExpoBuildReceipt` carries both lane receipts and has no field a single lane can occupy. The
combined verdict is `NOT_EXERCISED` whenever a lane is missing, whatever the lane that did run
reported. That is the whole mechanism: the honest answer is available and the dishonest one is
not expressible.

An absent simulator reports `SIMULATOR_ABSENT`. It is not a pass, and it does not become one
because the other platform succeeded.

## Success is a claim about a receipt

`projectViewState` refuses to render `COMPLETED` without a content-addressed receipt digest.
Every other tone may legitimately have no receipt — that is what it is reporting. The
outcome-to-tone map is asserted injective at module load, so two situations cannot render
identically.

## Exercising it

```bash
bun test apps/mobile-app/src/expo.test.ts
```

Deterministic and offline. Named `*.test.ts` rather than `selftest.ts` because `ci.yml` runs
`bun test`, which discovers `*.test.ts` and nothing else — see #117.

Fifty-one guards were disabled one at a time and required to turn the suite red.

## Prohibitions

Do not import provider private paths, use Bun-only runtime APIs in mobile code, add a raw
listener or action dispatcher, or write implementation outside the #48/#49 path leases. Shared
status/release changes belong to #53.
