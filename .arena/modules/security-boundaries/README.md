# security-boundaries module state route

- Interface: `1.0.0`
- Roots: `services/intent-ledger`, `services/security-boundaries`
- Provides: `security.intent/v1`, `security.provider-boundaries/v1`
- Runtime: local `PARTIAL`; cloud `NOT_IMPLEMENTED`
- External exposure: false; secrets: none

## Current state/data flow

```text
closed intent → canonical digest/reference threshold decision
high-risk capability lookup
  → OPA/workflow/broker/ledger/Secure Enclave/NFC/MPC/account/settlement: NOT_IMPLEMENTED
```

## Implementation stack

Foundation #54; provider leaves #55–#62; testnet submission #63 depends on audited contracts #62; adversarial/recovery convergence #64.

```text
intent → policy → durable workflow → optional hardware evidence
  → threshold signing → ledger → audited contract → testnet observation
  → residual-risk/Human dossier
```

No provider, license, simulator, testnet, or deterministic validation creates production custody/security PASS. #64 alone owns shared security registry/interface/status/release.

See [`../../../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](../../../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md#phase-5--security-hardware-and-testnet-settlement).
