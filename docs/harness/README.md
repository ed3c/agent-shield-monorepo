# Harness documentation

A Harness turns a project contract into a repeatable, falsifiable execution subject. It names what is being tested, isolates it, runs positive and negative controls, captures artifacts, reports evidence state, and accounts for cleanup.

Harness documentation does not itself execute providers, merge branches, widen permissions, or promote a capability.

## Lifecycle

```text
intent/source
→ repository decision
→ eval-first issue + path lease
→ immutable subject and isolated worktree/environment
→ positive mechanism
→ independent public control
→ negative/mutation/absence control
→ bounded artifacts and receipt
→ cleanup/residue verdict
→ comparison and Human Admit
```

## Invariants

1. One Harness run judges one exact subject.
2. A load-bearing gate must prove it can disagree.
3. Provider, session, device, hardware, chain, and production states are independent.
4. `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, and `NOT_EXERCISED` remain distinct.
5. Success with leaked worktree, process, session, port, artifact, runtime, or lock is not a clean success.
6. Raw bodies, secrets, profiles, keys, credential-bearing URLs, and host paths stay outside portable receipts.
7. Implementation, live execution, promotion, and Human Admit are separate transitions.
8. Cross-module execution starts at a public typed boundary, not a private helper or temp directory.

## Documents

- [`HARNESS_CATALOG.md`](HARNESS_CATALOG.md) — reusable Harness classes and evidence requirements.
- [`EXAMPLES.md`](EXAMPLES.md) — narratives for current module/provider boundaries.
- [`RECEIPT_CONTRACT.md`](RECEIPT_CONTRACT.md) — portable subject/artifact/state/cleanup receipt.
- [`WORK_PACKET.md`](WORK_PACKET.md) — path-disjoint multi-Worker assignment and handoff.
- [`../evals/README.md`](../evals/README.md) — eval authority and navigation.
- [`../evals/EVAL_CATALOG.md`](../evals/EVAL_CATALOG.md) — stable eval families.

## Ownership

The issue owns the eval and allowed paths; the module owns implementation; the execution plane owns live credentials/sessions/devices; the trusted operator owns merge, custody, permission widening, promotion, and rollback. A Worker receives no broader authority than its work packet.

Issue #22 owns this documentation. Future mechanical enforcement should be implemented primarily in Bun + TypeScript under a separate eval-first issue; no product or provider implementation is admitted here.
