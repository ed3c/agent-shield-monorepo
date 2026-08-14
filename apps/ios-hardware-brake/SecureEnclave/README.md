# Secure Enclave key lifecycle and attestation provider

Issue #59 (Phase 5 / SEC-50). Key creation, public-key registration, challenge signing,
attestation metadata, access-control policy, rotation and revocation for an iOS Secure Enclave
key.

## What is here and what is not

**No Swift is here, and no Secure Enclave call happens here.** SEC-SE-001 admits an exact device
subject, so the platform lives behind `SecureEnclaveBridge` and this directory owns everything
around it:

- admission — exact OS, device, app, team, entitlement and toolchain subject, and a real device
- access control — the policy the key is created under, and the authorization actually used
- challenge binding — nonce, intent, policy epoch, audience, key and device, with expiry
- anti-replay — a spent-nonce ledger scoped to the key
- revocation — the epoch a key stops being admissible from, applied to new and old evidence
- verification — a verifier reachable without going through the producing path
- cleanup accounting — retained challenges and authorization sessions

That split is the same one `services/security-boundaries/src/providers/mpc-tss` makes, and for
the same reason: those are the rules a deployment gets wrong, and they are testable without a
device. It is also the honest one. A simulator executes every line below and produces something
shaped exactly like hardware evidence, so `secureEnclaveProviderState` records device key
generation, user-presence authorization and attestation verification as `NOT_EXERCISED`, and a
compile-time floor in the eval suite rejects the file if any member is ever widened to `PASS`.

The Swift side is `ABSENT`. When it lands it implements `SecureEnclaveBridge` and nothing else
in this directory changes.

## The simulator is the control that matters

Every other admission failure here is loud: a malformed team ID, an absent entitlement, a
moving version channel. A simulator is quiet — it succeeds. So `environment` and `hardware` are
fields of the admitted subject *and* facts the bridge reports, and disagreement is resolved in
favour of the live probe: a subject claiming `device` while the bridge answers `simulator`
describes a different device than the one responding.

## Non-exportability is structural

`SecureEnclaveBridge` has no `exportKey`, `privateKey` or `serializeKey` member, and `CreatedKey`
carries no private material. Both are pinned by type-level assertions in the eval suite, so an
edit that adds an export route fails to compile rather than failing a test somebody can delete.

The runtime half is the platform's own answer: a key reported as `exportable`, or backed by
`software` rather than `secure-enclave`, did not come from the enclave whatever else the call
reported. It is refused at creation, before it can be registered — the only point where the
property is still establishable.

## Attestation blobs cannot be serialized

`SealedAttestation` holds the bytes in a private field and overrides every route out — `toJSON`,
`toString`, `Symbol.toPrimitive`, and the inspect hook Node and Bun consult before printing. The
digest stays readable because that is what evidence binds to. `PLANTED_SECRET` in
`fake-bridge.ts` is a canary the privacy control searches serialized receipts for, so a
redaction that stops working turns the suite red instead of turning it quiet.

`PresenceMethod` has two members, `biometry` and `device-passcode`. Neither is a measurement, so
there is no biometric result anywhere in this provider to redact.

## What the plant check found

Every guard in `provider.ts`, every escape route in `sealed-attestation.ts` and the transition
table in `state-machine.ts` were disabled one at a time and required to turn the suite red.
Forty-three plants, forty-three red — after four rounds of fixes:

- `biometry === "none"` was dead. The stricter `!== "current-biometry-set"` rule already caught
  it, so it was deleted rather than given a fixture.
- The device binding is checked twice for different reasons — against the device this process is
  running on, and against the device the key was registered to. One fixture was satisfying both.
  Only evidence produced on one device and presented on another tells them apart.
- The intent binding is checked for shape and for equality, and the equality rule was catching
  the shape rule's fixture. Binding the caller's expectation to the same malformed value leaves
  only the shape rule able to fire.
- `assertSecureEnclaveTransition` was never executed. The provider only ever builds legal
  traces, so the enforcement point was type-checked and never run until `transitionLegality`
  called it directly.
- The "device refused an approved rotation" branch had no control. The revocation path had one
  and the rotation path did not.

## Exercising it

```bash
bun test apps/ios-hardware-brake/SecureEnclave/secure-enclave.test.ts
```

Deterministic and offline. The file is named `*.test.ts` rather than `selftest.ts` on purpose:
`.github/workflows/ci.yml` runs `bun test`, which discovers `*.test.ts` and nothing else, so a
`selftest.ts` here would be type-checked by `bunx tsc --noEmit` and never executed.
