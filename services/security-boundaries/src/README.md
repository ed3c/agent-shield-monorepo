# Security-boundaries source boundary

This leaf inherits [`../README.md`](../README.md), root `AGENTS.md`, and module `security-boundaries`. It owns typed settlement-intent validation and explicit capability-state declarations, not cryptographic or custody implementation.

Inputs are closed settlement intent fields with unique evidence references. Outputs are validation failure or typed capability receipts. MPC/TSS, Secure Enclave/NFC, smart account, ledger anchor, and settlement all remain `NOT_IMPLEMENTED`.

Do not accept private keys, shards, device secrets, signatures, chain endpoints, or deployed-address claims in ordinary contracts/logs. No source text, package, hash chain, or UI approval may proxy for audited crypto, hardware attestation, testnet execution, recovery, rollback, and Human Admit. Issue #19 / evals `E30.1`–`E30.4` govern this README.
