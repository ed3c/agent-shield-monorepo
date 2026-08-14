# scrcpy Android projection provider

Issue #52 (Phase 4 / QA-30). Bounded, authenticated projection of an Android emulator or handset
through an exactly admitted scrcpy build on a trusted ADB host.

Device authorisation, USB/TCP transport and the ADB server stay host owned behind `ScrcpyPort`.
Nothing in this directory holds a credential, a real device serial, or a host absolute path.

## What the types make unsayable

- **No raw ADB.** `ScrcpyAction` is a closed union of `tap`, `swipe`, `type-text` and
  `press-key`. There is no command, argv, path or URL field, so QA-SCRCPY-004's "expose a raw
  ADB command" control has nowhere to arrive — and `push`/`pull` have no representation at all.
- **Keys are an allowlist, not a filter.** Android has hundreds of keycodes; `SCRCPY_KEYS` has
  five. `power` is not a member, so it cannot be sent by any caller.
- **A serial is not a location.** The serial pattern rejects paths, URLs and `host:port`, so the
  ADB client cannot be redirected by a well-formed-looking request.
- **The client and the pushed server are separate artifacts.** Admitting one digest for both is
  refused outright: it would let a swapped server ride in under a verified client.
- **Retention is a decision with a name.** `retainFrames` and `maxRetainedBytes` are separate
  rules, so "nothing was written down" and "less than the bound was written down" are different
  claims and fail differently.

## Where the reasons matter as much as the outcomes

Three rules report `ABSENT_ADB`, three report `TOOL_REFUSED`, four report `LEASE_REFUSED`.
Asserting only the outcome would let any one of them cover for the others — a rule could be
deleted and the controls would stay green. Every one of those controls pins the *reason*, which
is what makes the plant check meaningful rather than decorative.

That mattered in practice: the sibling iOS provider had two guards that were dead for exactly
this reason before the controls were tightened.

## What a receipt is worth

`targetClass` is on every receipt, and `physicalDeviceEvidence` cannot return `PASS` — the return
type has no such member. An emulator says nothing about a real handset's radio, sensors, keystore
or vendor build, and a *failed* emulator session is not negative hardware evidence either.

## Exercising it

```bash
bun services/mobile-automation/src/providers/scrcpy/selftest.ts
```

Deterministic and offline: `FakeScrcpyPort` contacts no ADB server, emulator, handset or scrcpy
process, and only ever leases an emulator.

All 47 guards in `provider.ts` were disabled one at a time and the controls were required to go
red for each.
