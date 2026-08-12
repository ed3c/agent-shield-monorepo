# Security boundary contract and molecular implementation stack

## Owner/current evidence

- Module: `security-boundaries@1.0.0`
- Capability: `security.provider-boundaries/v1`
- local runtime: `PARTIAL`; cloud: `NOT_IMPLEMENTED`
- closed settlement-intent validation: present
- OPA, durable workflow, OpenBao, verified ledger/anchor, Secure Enclave, CoreNFC, MPC/TSS, smart account, bundler/paymaster, settlement: `NOT_IMPLEMENTED`

## Target state machine

Foundation [#54](https://github.com/ed3c/agent-shield-monorepo/issues/54):

```text
DRAFT → INTENT_VALIDATED → RISK_EVALUATED → ROUTED
LOW:  → SESSION_AUTHORIZED → OPERATION_PREPARED → SUBMISSION_PENDING
HIGH: → CHALLENGE_ISSUED → WAITING_FOR_HARDWARE → EVIDENCE_VERIFIED
      → SIGNING_AUTHORIZED → OPERATION_PREPARED → SUBMISSION_PENDING
```

Terminal/blocked: `DENIED`, `EXPIRED`, `REVOKED`, `REPLAY_REFUSED`, `WAITING_FOR_HUMAN`, `WAITING_FOR_HARDWARE`, provider absence/unimplemented/unexercised, and separate policy/evidence/signing/ledger/submission/recovery failures.

## Data flow

```text
canonical settlement intent/evidence refs
  → OPA policy #55
  → durable workflow #56
  → OpenBao reference/broker #57
  → ledger #58
  → Secure Enclave #59 + CoreNFC #60
  → MPC/TSS #61
  → audited smart-account contracts #62
  → testnet submission #63
  → adversarial/recovery convergence #64
```

Each provider emits an independent receipt. No component or license/source claim produces end-to-end security PASS.

## Provider state ownership

| Issue | Private owner | Evidence class |
|---|---|---|
| #55 | OPA policy bundle/adapter | policy epoch decision |
| #56 | durable workflow | replay/idempotency/wait/compensation |
| #57 | OpenBao broker | metadata-only lease/audit |
| #58 | append-only ledger/restore | append/proof/replay/invariants |
| #59 | Secure Enclave native provider | non-exportable key/challenge evidence |
| #60 | CoreNFC provider | card challenge/anti-replay/revocation |
| #61 | MPC/TSS | audited protocol/ceremony/sign/reshare |
| #62 | smart-account contracts | reproducible bytecode/audit/local validation |
| #63 | testnet bundler/paymaster | simulate/submit/include/confirm |
| #64 | aggregate adversarial/recovery/status/release/Human dossier | reference/testnet admission only |

## Prohibitions

No custody/signing authority/key/shard/device session/transaction broadcast in current code; no raw secret/key/NFC/attestation/wallet token in Git/log/MCP/receipt; no source/dependency/interface as PASS; no simulator/testnet proxy for hardware/mainnet; no absolute security/immunity/compliance/financial-safety claim.
