# Phase 5 security convergence

Issue #64 (Phase 5 / SEC-99) — deterministic verifier for the test/reference security package.

The exact issue state machine is implemented through `HUMAN_REVIEW`. This leaf normalizes child
receipts from #54–#63 and refuses mixed ceremony subjects, duplicate capability ownership,
high-risk hardware bypass, replay/stale authority, single-component authorization, unsafe lost
subject recovery, ledger/testnet inconsistency, secret leakage, uncleared authority and dishonest
audit/release claims.

The verifier keeps policy, hardware, signing, ledger, contract and testnet lanes separate. A
`NOT_IMPLEMENTED` native provider can be represented honestly and reviewed; it cannot support a
PASS claim or reach `TESTNET_ADMITTED` deterministically.

Controls cover all eleven issue eval families:

- exact child/provider/interface/epoch/contract/network subjects under one ceremony digest;
- low-risk limits and mandatory high-risk hardware route;
- replay, expiry, revocation and epoch staleness;
- compromised-component threshold;
- lost device/card revoke, reshare/re-provision and old-subject denial;
- intent/workflow/operation/ledger/testnet reconciliation with distinct inclusion/confirmation;
- invalid input, timeout, partition, reorg and cleanup red paths;
- secrecy/privacy scans;
- cleanup and revocation;
- measured audit scope, limitations and residual risk without absolute claims;
- graph-scoped invalidation and receipt-backed release state.

`securityConvergenceState` contains no PASS and explicitly leaves native hardware, threshold
signing, smart account and testnet submission unimplemented, with production custody/mainnet
authority absent.

```bash
bun test services/security-boundaries/src/convergence/convergence.test.ts
```
