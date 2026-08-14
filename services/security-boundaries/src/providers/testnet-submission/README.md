# Testnet bundler/paymaster submission provider

Issue #63 (Phase 5 / SEC-90). Constructing, simulating, submitting, confirming and recording
bounded account-abstraction operations against an exact admitted testnet.

## What is here and what is not

**No chain is contacted here.** RPC, bundler, paymaster and ledger sit behind `ChainTransport`,
reached through broker-held credentials this provider never holds. What this directory owns:

- admission — exact chain, RPC, bundler, entry point and contract subjects
- subject closure — intent, policy epoch, workflow, signing and hardware receipts
- simulation gating — nothing is submitted past a failed or foreign simulation
- idempotency — a retry reconciles against the chain rather than double-submitting
- economic limits — value, gas, fee-per-gas, total fee, and fee routing
- confirmation policy — inclusion is not finality, and a reorg is a second read
- cleanup accounting — retained processes, nonce leases and open subscriptions

`testnetSubmissionState` records the submission, the inclusion and the sponsorship as
`NOT_EXERCISED`, with a compile-time floor in the eval suite rejecting any widening to `PASS`.

## The contracts are an input, not an output

#62 owns the smart-account and validator contracts. This provider consumes their identity as a
`ContractSubject` — addresses, bytecode digests, a deployment receipt digest and the chain they
were deployed on — and never compiles, deploys or modifies anything.

That is why this leaf can exist before #62 does: the dependency is on the *shape* of a
deployment receipt, not on a particular deployment. When #62 lands it produces the subjects this
provider already validates. A contract subject whose `chainId` disagrees with the network is
refused, because the same address on another chain is another contract.

## Testnet safety is an allowlist

`ADMITTED_TESTNET_CHAIN_IDS` enumerates the four chains this provider will talk to. Everything
else is refused, including chains that really are testnets, until one is added deliberately.

The two alternatives were both rejected:

- An `isTestnet: boolean` on the network subject puts the decision in the hands of the caller,
  and the caller is the thing being constrained.
- A denylist of mainnet chain IDs refuses the chains someone thought of and admits every chain
  they did not.

The endpoint's own answer then outranks the subject: a testnet RPC that has been repointed
passes every static check, so `probeNetwork().chainId` is compared against the admitted one.

## Included is not settled

Three separate rules, because collapsing them is how a mempool state gets reported as a payment:

- `pending`, `dropped` and `replaced` are distinct outcomes. Dropped may be retried; replaced
  means another operation took the nonce; pending means keep waiting.
- Five confirmations are required past the inclusion block. One block is inclusion.
- The inclusion block is **read twice**. A reorg is a different block hash at the same height on
  the second read, and reading once and trusting it is exactly what makes `INCLUDED` look like
  `CONFIRMED`.

A head *behind* the inclusion block is a transport reporting something impossible. It shares the
`CONFIRMATION_FAILED` outcome with a shallow confirmation and differs in the detail — which the
plant check caught, because asserting only on the outcome could not tell them apart.

## Idempotency is answered by the chain

`submittedHashFor` is consulted before anything is simulated or spent. A local ledger of
in-flight operations is exactly the thing a crash destroys, and the retry after that crash is
the case idempotency exists for. If the chain already knows the operation ID, the run skips
straight to observation and `submit` is never called — asserted by a call counter rather than
inferred.

## Wei is BigInt, not a double

Value and fee amounts arrive as decimal strings because they do not fit in a double. A cap
compared as a float stops working exactly at the top of the range where it matters, so every
comparison goes through `BigInt`.

The per-gas cap and the total cap are different bounds. A modest gas price on an enormous gas
limit passes the first and fails the second, which is the case a single cap misses.

## Fee routing is named or absent

A fee with no recipient goes somewhere the receipt does not name. A recipient with no fee is a
field nobody will keep in step. Either alone is refused; together or absent together is
admitted.

## What the plant check found

Sixty-four plants, sixty-four red — after five findings:

- The `chainId` integer check was dead: a fractional ID is not a key of the allowlist either, so
  the allowlist was already refusing it. Deleted rather than given a fixture.
- The version *shape* rule had no fixture of its own — the "no moving channels" rule was
  catching all of them.
- The gas cap and the per-gas cap were both being caught by the total-fee cap. Each fixture is
  now shaped to breach exactly one.
- The impossible-head rule and the shallow-confirmation rule share an outcome and differ only in
  what they report, so the control now asserts the detail.

## Exercising it

```bash
bun test services/security-boundaries/src/providers/testnet-submission/testnet-submission.test.ts
```

Deterministic and offline. Named `*.test.ts` rather than `selftest.ts` because `ci.yml` runs
`bun test`, which discovers `*.test.ts` and nothing else — see #117.

## Evidence boundary

A green suite proves the rules above. It does not prove a testnet submission, bundler behaviour,
paymaster solvency, chain conditions, economic safety, custody, provider uptime, legal or
compliance status. No mainnet path exists in this provider and none is proposed.
