# Harness documentation

A Harness turns a project contract into a repeatable, falsifiable execution subject. It names what is being tested, isolates it, runs positive and negative controls, captures artifacts, reports evidence state, and cleans up.

Harness documentation does not itself execute providers or promote a capability.

## Lifecycle

```text
intent/source
→ repository decision
→ versioned contract
→ immutable subject
→ environment admission
→ positive control
→ negative/mutation control
→ bounded execution
→ artifact and receipt
→ cleanup/residue check
→ comparison and Human Admit
```

## Invariants

1. One Harness run judges one exact subject.
2. A load-bearing gate must prove it can disagree.
3. Provider, session, device, hardware, and chain states are independent.
4. `PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, and `NOT_EXERCISED` remain distinct.
5. Success with leaked worktree, process, session, port, artifact, or lock is not a clean success.
6. Raw bodies, secrets, profiles, keys, and host paths stay outside portable receipts.
7. Implementation, live execution, promotion, and Human Admit are separate transitions.

## Documents

- [`HARNESS_CATALOG.md`](HARNESS_CATALOG.md) — reusable Harness classes and evidence requirements.
- [`EXAMPLES.md`](EXAMPLES.md) — narrative examples tied to current module boundaries.
- [`../evals/README.md`](../evals/README.md) — eval design rules.
- [`../evals/EVAL_CATALOG.md`](../evals/EVAL_CATALOG.md) — stable eval families.

Issue #22 owns this documentation. No product or provider implementation is admitted here.