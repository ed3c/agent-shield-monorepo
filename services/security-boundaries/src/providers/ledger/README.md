# Verified append-only ledger

Issue [#58](https://github.com/ed3c/agent-shield-monorepo/issues/58) owns this leaf. Workflow and chain consumers use the public receipts here; no chain anchor submission, workflow private code or convergence path belongs to this directory.

## A root hash is not recoverability

The issue's sharpest requirement is that an append-only claim must not be treated as full recoverability without replay and domain-invariant checks, and the design follows it literally. Restore runs four separate gates, and each one catches something the others cannot:

```text
snapshot identity   schema, server identity, encryption and broker refs
count and digest    the entries actually returned, not the ones claimed
chain replay        every hash recomputed from genesis to the snapshot head
domain invariants   balances replayed per intent, ordering of declare/settle/reverse
```

Dropping an entry changes the count and the entries digest, so it fails at the second gate: `RESTORE_FAILED`. Tampering with an entry's content leaves its recorded hash — and therefore the digest — unchanged, so only recomputing the chain catches it: `REPLAY_FAILED`. A ledger whose bytes are all intact but whose history does not mean anything, such as a reversal larger than what settled, reaches the fourth gate: `INVARIANT_FAILED`.

Those are three different failures for three different defects, and the controls pin each one to its own outcome rather than asserting that something went wrong.

## Tamper detection is a property of the chain

Each entry commits to the one before it, so mutating, reordering or deleting any historical entry changes every hash after it. The append path fetches the whole chain as its proof and recomputes it, so a server that reports a head it cannot reproduce from its own entries fails rather than being believed — the hollow proof-only success the eval names, controlled on both the append and the restore path.

The pinned server identity is checked on every operation, so a forked or replaced server answering on the same address is refused.

## Idempotency

Appends are idempotent by event ID. A duplicate delivery returns the original receipt marked `duplicate` and appends nothing.

## Privacy

An entry carries digests and references, never payloads, and an event with any field beyond the declared ten is refused. A receipt carries the event ID, sequence, entry hash and head — no amount, direction, epoch or payload digest.

## Evidence boundary

`FakeLedger` is a deterministic in-memory fixture. No immudb server, backup key, restore drill or chain anchor has been exercised; `ledgerProviderState` carries no `PASS` and the compiler proves it.

A ledger PASS would not prove L2 anchoring, reserve solvency, chain finality, signing authorization, database operational security or absolute tamper immunity in any case.

## Human boundary

Schema migrations, retention, backup keys, destructive restore, anchor promotion and production data authority require Human Admit.
