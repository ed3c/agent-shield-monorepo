# WebDriverAgent iOS projection provider

Issue #51 (Phase 4 / QA-20). Bounded, authenticated projection of an iOS simulator or device
through an exactly admitted WebDriverAgent/Xcode toolchain on a trusted macOS host.

Signing identities, provisioning profiles, device trust and the simulator runtime stay host
owned behind `WdaPort`. Nothing in this directory holds a credential, a UDID of a real device,
or a host absolute path.

## What the types make unsayable

The eight evals in #51 are mostly not filters. Where a rule could be expressed as a shape
instead, it is:

- **No generic passthrough.** `WdaAction` is a closed union of `tap`, `swipe`, `type-text` and
  `press-button`. There is no XCTest method name, shell string, argv, cwd, environment or URL
  field, so QA-WDA-004's "expose a generic endpoint" control has nowhere to arrive.
- **Elements are named, not selected.** Actions address the shared `AccessibilityTarget` from
  the Phase 4 product contracts (UX-FND-002), not a framework selector language.
- **Reading and driving are separate scopes.** `wda.stream` and `wda.act` are distinct, and a
  capability is bound to a single lease, so a read-only operator cannot escalate and a token
  minted elsewhere is not a token here.
- **Redaction is a fact, not a promise.** A frame carries `secureFieldsPresent` and `redacted`
  separately, so an unredacted secure frame is a value the provider can refuse rather than a
  behaviour of a capture path nobody re-reads.

## What a receipt is worth

`targetClass` is on every receipt, and `physicalDeviceEvidence` will not return `PASS` for any
of them — the return type has no such member. A simulator session is genuine evidence about the
projection and none at all about Secure Enclave, real sensors or real signing; a *failed*
simulator session is likewise not negative hardware evidence. Only an admitted live device run
could produce a positive hardware claim, and this repository has never performed one.

`wdaProviderState` records that directly, and a compile-time floor in the selftest rejects the
file if any member of it is ever widened to `PASS`.

## Exercising it

```bash
bun services/mobile-automation/src/providers/wda/selftest.ts
```

Deterministic and offline: `FakeWdaPort` contacts no macOS host, Xcode, simulator, device,
signing identity or WebDriverAgent process, and only ever leases a simulator — so nothing
reachable from the fake can be mistaken for physical-device evidence.

Every guard in `provider.ts` was disabled one at a time and the controls above were required to
go red for each. That includes four that were dead when first written: two controls asserted
only an outcome that a second rule also produced, one action shape had no fixture, and the
simulator branch was only reachable through a failing session.
