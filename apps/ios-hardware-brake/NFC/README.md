# CoreNFC challenge, anti-replay and revocation provider

Issue #60 (Phase 5 / SEC-60). Card profile admission, card registration, challenge-response,
counter and nonce anti-replay, expiry, revocation and metadata-only possession evidence.

## What is here and what is not

**No Swift is here, and no CoreNFC session happens here.** The reader and the card key live
behind `CoreNfcBridge`; this directory owns everything around it:

- admission — exact card, protocol, application, OS, entitlement and key-management identity
- challenge binding — nonce, intent, policy epoch, audience, card and device, with expiry
- anti-replay — two ledgers, because a replayed challenge and a replayed response are different
- card substitution — reference, application and echoed nonce, checked separately
- cancellation, absence and timeout — three facts, none of which is approval
- revocation — the epoch a card stops being admissible from
- cleanup accounting — retained reader sessions and APDU buffers

`verify` sits on the bridge rather than in this repository for a specific reason: verifying a
card response needs the card key, and the card key is in the broker (#57). A verifier here would
mean a key here.

`corenfcProviderState` records the reader session, the card exchange and cryptogram verification
as `NOT_EXERCISED`, with a compile-time floor in the eval suite rejecting any widening to `PASS`.

## DESFire is not assumed

#60 says not to assume DESFire EV3 or any proprietary credential scheme without exact protocol,
key-management, entitlement and legal/security review. So:

- `NfcProtocol` is a closed union. An unknown protocol string cannot be constructed, which is a
  stronger form of "unknown card treated as supported" than any runtime check.
- `PROPRIETARY_PROTOCOLS` classifies every member as data rather than as a comment, so adding a
  protocol without deciding which side it falls on is a compile error.
- A proprietary protocol with `review: null` is **refused**, not annotated. So is a review whose
  `coversKeyManagement` or `coversEntitlementTerms` is false — a review that skipped those did
  not review the two things #60 says a proprietary scheme has to be reviewed for.

`mifare-desfire-ev3` is therefore present as an admissible-with-review protocol and admissible
under no other condition. Nothing in this repository asserts that such a review exists.

## Two replay ledgers, not one

A spent nonce and a seen cryptogram catch different attacks, and the eval fixtures are shaped so
only one of them can fire at a time:

- **Replayed challenge** — the same nonce reused. The card answers with a fresh counter and a
  fresh cryptogram, so neither other rule can claim the fixture.
- **Replayed response** — a recorded exchange played back under a *new* challenge. It looks
  fresh on every dimension except the cryptogram, which is why a counter check alone misses it.
- **Stale counter** — a value the card has already used, with a cryptogram never seen before.

The counter only advances on a *verified* exchange. Advancing it on a rejected one would burn
every value below it, so one refused attempt would lock the card out.

## Card keys never exist here

`CardKeyRef` is a broker identifier, a key identifier and a digest. There is no field anywhere
in this provider that can hold a key, and the receipts do not carry even the reference —
nothing downstream needs it.

`SealedApdu` holds the exchange bytes in a private field and overrides every route out. This is
deliberately a second copy of the Secure Enclave leaf's wrapper rather than a shared module:
#59 and #60 are sibling leaves with disjoint path leases, and a shared file would sit in neither.
Convergence #64 is where a shared version belongs.

## What the plant check found

Every guard in `provider.ts`, every escape route in `sealed-apdu.ts` and the transition table in
`state-machine.ts` were disabled one at a time and required to turn the suite red. Sixty-one
plants, sixty-one red — after three fixes:

- The application-identifier *format* rule was dead against its own fixture: the "app does not
  declare this identifier" rule was catching it. The fixture now declares the malformed value.
- `advanceCounter` had no control at all. Every fixture stopped before a second successful
  exchange, so nothing observed that the recorded counter had moved.
- The "card is not registered" guard in revocation was shadowed: the fixture reused a bridge
  with `revokes = false`, which produced `RECOVERY_REQUIRED` for the other reason.

## Exercising it

```bash
bun test apps/ios-hardware-brake/NFC/corenfc.test.ts
```

Deterministic and offline. The file is named `*.test.ts` rather than `selftest.ts` because
`ci.yml` runs `bun test`, which discovers `*.test.ts` and nothing else — see #117.

## Evidence boundary

A green suite proves the rules above. It does not prove Secure Enclave possession, user
identity, MPC/TSS, end-to-end approval, card unclonability, wallet custody or physical security.
Possession of the named card under the named protocol is the whole claim.
