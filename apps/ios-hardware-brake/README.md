# iOS hardware brake

The native iOS hardware boundary named in
[`../../docs/architecture/PLANNED_REPOSITORY_TREE.md`](../../docs/architecture/PLANNED_REPOSITORY_TREE.md).
It inherits [`../README.md`](../README.md) with one deliberate exception: the sibling product
surfaces own projections and typed user actions and explicitly do **not** own cryptography, and
this directory is the one place under `apps/` that does. It exists here because the code is
platform-native rather than because it is a product surface.

## Directory/state ownership

| Directory | Capability | Current state | Issue |
|---|---|---|---|
| `SecureEnclave/` | `security.provider-boundaries/v1` hardware evidence | contract and lifecycle present; device key generation, user-presence authorization and attestation verification `NOT_EXERCISED` | #59 |
| `NFC/` | CoreNFC card possession | `ABSENT` | #60 |

`SecureEnclave/` owns no shared registry, module manifest, integration status, release manifest
or public provider index. `services/security-boundaries/src/index.ts` still reports
`secure-enclave-nfc` as `NOT_IMPLEMENTED`; promoting that capability belongs to convergence #64
and requires the device canary this directory cannot run.

## Data flow

```text
provisioning policy + device/app identity
  → Secure Enclave key generation
  → public key/attestation registration
  → bound challenge + user-presence control
  → non-exportable signature
  → metadata-only hardware evidence receipt
  → rotation/revocation record
```

## Prohibited coupling

No product adapter, runtime provider, MPC/TSS ceremony, smart-account contract or settlement
path may import these private paths. Evidence crosses the boundary as
`HardwareEvidence` and the receipt families in `SecureEnclave/types.ts`, never as a key, a
device credential, a biometric result or an attestation blob.

## Human boundary

Provisioning, entitlements, key registration, rotation, revocation, lost-device recovery and
production signing authority require Human Admit and independent security review. Nothing in
this directory performs any of them; the rotation ceremony parks at `ROTATING` until an
approval reference exists, and a device that cannot confirm a revocation reports
`RECOVERY_REQUIRED` rather than replacing the key.
