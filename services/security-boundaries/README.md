# Security boundary service contract

## Owner

- Module: `security-boundaries`
- Interface: `1.0.0`
- Capability: `security.provider-boundaries/v1`
- Runtime declaration: local `PARTIAL`; cloud `NOT_IMPLEMENTED`
- External exposure: denied; secrets: none

## Purpose

Validate the closed shape of a settlement intent and report whether high-risk security/provider capabilities are implemented. The directory deliberately prevents architecture sketches from being mistaken for cryptographic, hardware, wallet, ledger, or chain execution.

## Inputs

A `SettlementIntent` with non-empty target, positive integer minor amount, constrained uppercase currency code, and unique evidence references.

## Outputs

- validation success or explicit exception for malformed intent;
- `SecurityCapabilityReceipt` entries for named high-risk capabilities.

## Current capability states

| Capability | State | Missing proof boundary |
|---|---|---|
| MPC/TSS | `NOT_IMPLEMENTED` | audited native provider, ceremonies, adversarial/recovery receipts |
| Secure Enclave + NFC | `NOT_IMPLEMENTED` | native implementation, attestation, anti-replay, revocation, device evidence |
| smart account | `NOT_IMPLEMENTED` | audited bytecode, deployment address, chain/testnet receipt |
| ledger anchor | `NOT_IMPLEMENTED` | append-only store, restore, Merkle/anchor receipt |
| settlement | `NOT_IMPLEMENTED` | chain, bundler, paymaster, policy, rollback and Human Admit |

## Non-goals and prohibitions

- No custody, signing authority, key generation, key shard, device session, transaction broadcast, or financial settlement.
- No source document, dependency name, contract interface, or deterministic validation can promote a capability to `PASS`.
- No claim of absolute security, immunity, fixed resistance percentage, legal compliance, or financial safety.
- No private key, shard, NFC secret, attestation token, wallet session, seed, `.env`, or provider credential may enter Git, logs, MCP payloads, or receipts.
- High-risk operations cannot bypass independent policy, hardware evidence, and Human Admit.

## Required eval families before any implementation

- threat model and exact cryptographic/security assumptions;
- independent code/security and dependency/license review;
- malicious node, replay, downgrade, substitution, lost device, compromised host, split-brain, and recovery controls;
- key ceremony, resharing, revocation, backup, and destruction receipts;
- audited bytecode/deployment/testnet/rollback evidence;
- Human Admit for every custody, permission, network, hardware, or settlement expansion.

Issue #19 owns this README only. All listed provider states remain unchanged.