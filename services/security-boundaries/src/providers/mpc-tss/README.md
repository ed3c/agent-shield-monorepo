# MPC/TSS keygen, signing, resharing and recovery provider

Issue #61 (Phase 5 / SEC-70). A boundary over an **audited** threshold-signature implementation,
covering the three ceremonies the issue names: distributed key generation, signing, and
resharing with old-epoch revocation.

## What is here and what is not

The cryptography is not here. SEC-TSS-001 admits an exact audited library, so the protocol lives
behind `MpcTransport` and this directory owns everything around it:

- admission — exact library identity **and an audit that covers the implementation**
- thresholds — who may sign, and how many actually contributed
- message binding — ceremony, request, round, sender, receiver, epoch, nonce
- adversarial detection — replay, reordering, duplication, equivocation, nonce reuse
- epochs — advancement, revocation, and refusing to reissue to a removed participant
- abort and cleanup — no partial success, and no retained share, transcript or process

That split is deliberate: those are the rules a deployment gets wrong, and they are testable
without performing any cryptography. `mpcProviderState` records the library, the protocol rounds
and the independent vector suite as `NOT_EXERCISED`, and a compile-time floor in the selftest
rejects the file if any member is ever widened to `PASS`.

## Unaudited is refused, not annotated

`MpcProtocolSubject.audit` is `MpcAudit | null`, and `null` fails admission. So does an audit
whose `coversProtocolImplementation` is false — a partial audit that skipped the implementation
is not an audit of the thing being admitted, however thorough it was about everything else.
That is the only reading of "audited MPC/TSS provider" that does any work.

## Share secrecy is structural

`SealedShare` holds the bytes in a private field and overrides every route out — `toJSON`,
`toString`, `Symbol.toPrimitive`, and the inspect hook Node and Bun consult before printing.
A threshold scheme's whole value is destroyed by one accidental serialization, so the controls
check each route separately. `toString` turned out to be reachable only by an explicit call
(`Symbol.toPrimitive` wins every implicit coercion) — which is exactly what a logging line
writes, so it is pinned by its own control rather than left as dead code.

## Where the reasons matter as much as the outcomes

Several rules share a terminal state, and the plant check found seven guards that were dead
because a fixture was being caught by a neighbour:

- `ROUND_MISMATCH` is reported by round validity, round ordering **and** duplicate delivery, and
  each was catching the other two's fixtures. Pinning the reason cannot separate those, so each
  control is now shaped so only its own rule can fire.
- `AUTH_REFUSED` from a duplicate registration was being produced by the message audit instead.
- `participants < 2` was genuinely unreachable — `threshold >= 2` and `threshold <= participants`
  already imply it. It was deleted rather than given a fixture; the integer check that *is*
  load-bearing (a fractional count slips past every comparison) was kept.

## Exercising it

```bash
bun services/security-boundaries/src/providers/mpc-tss/selftest.ts
```

Deterministic and offline. Every guard in `provider.ts` and every escape route in
`sealed-share.ts` was disabled one at a time with the controls required to go red.
