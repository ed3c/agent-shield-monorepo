# Security contract family

Issue [#54](https://github.com/ed3c/agent-shield-monorepo/issues/54) owns this Phase 5 foundation. OPA, Temporal, OpenBao, immudb, Secure Enclave, CoreNFC, MPC/TSS, smart-account and bundler/paymaster providers consume these contracts. No cryptographic, hardware, custody, ledger or chain provider is implemented here.

## Public schemas

```text
agent-shield/settlement-intent/v1
agent-shield/security-challenge/v1
agent-shield/security-settlement-receipt/v1
```

## State machine

```text
DRAFT → INTENT_VALIDATED → RISK_EVALUATED → ROUTED
```

Low-risk route:

```text
ROUTED → SESSION_AUTHORIZED → OPERATION_PREPARED → SUBMISSION_PENDING
```

High-risk route:

```text
ROUTED → CHALLENGE_ISSUED → WAITING_FOR_HARDWARE → EVIDENCE_VERIFIED
  → SIGNING_AUTHORIZED → OPERATION_PREPARED → SUBMISSION_PENDING
```

Blocked and terminal: `DENIED`, `EXPIRED`, `REVOKED`, `REPLAY_REFUSED`, `WAITING_FOR_HUMAN`, `WAITING_FOR_HARDWARE`, `ABSENT_PROVIDER`, `NOT_IMPLEMENTED`, `NOT_EXERCISED`, `FAILED_POLICY`, `FAILED_EVIDENCE`, `FAILED_SIGNING`, `FAILED_LEDGER`, `FAILED_SUBMISSION`, `FAILED_RECOVERY`.

## One enforcement point per rule

Each rule is enforced in exactly one place, and the transition table is that place wherever it can be. Three guards were written, proved unable to fire, and removed rather than kept as reassurance:

- a high-risk submission re-check for `EVIDENCE_VERIFIED` and `SIGNING_AUTHORIZED` — an exhaustive walk of the declared transitions finds no legal path to `SUBMISSION_PENDING` that skips either;
- a "lifecycle continued past an outcome" scan — a non-resumable outcome has no successors, so the transition walk already rejects it;
- a denylist of secret-looking field names — every object here is closed by `exactKeys` and no field takes free-form JSON, so `privateKey` is refused by the same rule that refuses `x`.

What those arguments depend on is two tables agreeing, and no type makes them agree. So the agreement is asserted once at module load: a terminal outcome that declares successors, a resumable state that cannot resume, or a declared state unreachable from `DRAFT` throws on import. `FAILED_RECOVERY` is reachable only from `WAITING_FOR_HUMAN`, because recovery approval is human-owned — a state no producer can emit would not exist.

## Secret boundary

Every reference into a secret-bearing system is a `SecurityOpaqueRef`: `kind`, `id`, `sha256`, and nothing else. There is no field anywhere in this family for a key, shard, PIN, token, session cookie, certificate or NFC byte to travel in, so the boundary is a property of the shapes rather than of a filter that has to be maintained.

## Evidence boundary

Only contracts and deterministic validators pass here. `securityEvidenceForOutcome` never returns `PASS`: the strongest state this family projects is `NOT_EXERCISED`, and a receipt that declares a different state than its outcome implies is rejected.

An audited capability — `hardware`, `crypto`, `chain` — cannot report `PASS` without naming an audit reference, and no schema check can supply one. Every policy, workflow, secret-broker, ledger, native-device, cryptographic and chain capability needs its own child issue and an independent reviewer.

## Residual risk

`validateSecurityClaim` rejects absolute security language outright, and rejects a percentage or comparative number unless the claim names the measurement model that produced it. This applies to claims carried inside a settlement receipt, so a receipt cannot ship `100% immune to replay`.

## Human boundary

Human Admit owns interface admission, policy/custody/permission expansion, key ceremonies, production authority and recovery approval. A high-risk decision that does not require Human Admit is rejected, and a settlement still awaiting it cannot reach submission.
