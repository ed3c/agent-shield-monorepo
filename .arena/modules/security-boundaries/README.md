# security-boundaries module

- Interface: `1.0.0`
- Roots: `services/intent-ledger`, `services/security-boundaries`
- Provides: `security.intent/v1`, `security.provider-boundaries/v1`
- Runtime: local `PARTIAL`; cloud `NOT_IMPLEMENTED`
- External exposure: false; secrets: none

The current deterministic subjects validate closed intent shapes, content digests, and a reference Human Approval threshold boundary. MPC/TSS, Secure Enclave/NFC, smart account, ledger anchor, and settlement are all `NOT_IMPLEMENTED`.

This module owns refusal and capability-state contracts; it owns no production custody, key material, hardware attestation, deployed bytecode, or chain authority.