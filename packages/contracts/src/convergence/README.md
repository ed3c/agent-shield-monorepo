# Convergence contract

The rules the four convergence issues state in four vocabularies, written once.

## Why this exists

#44 (runtime), #53 (product), #64 (security) and #75 (release) each own a phase aggregate. Their
eval lists are not merely similar — they are **the same rules renamed**:

| Rule | #44 | #53 | #64 | #75 |
|---|---|---|---|---|
| child / subject identity | CONV-001 | CONV-001 | CONV-001 | REL-001 |
| uniqueness (capability / action / tool) | CONV-002 | CONV-002 | — | REL-004 |
| transitive invalidation | CONV-008 | CONV-008 | CONV-011 | REL-010 |
| aggregate honesty / no unreceipted PASS | CONV-009 | CONV-009 | CONV-011 | REL-008 |
| human gate | — | — | — | REL-009 |

Four implementations would be four places for one rule to drift, and three of them would be
copies of the first. This family is the first, made phase-agnostic.

## What is deliberately not here

**Each phase's state machine.** #44 has three route failures, #53 has platform lanes, #64 has
eleven evals and #75 has rollback states — those are genuinely different and belong to their
leaves. The rules repeat; the vocabulary does not.

Nor is the mapping from a refusal to a phase terminal. `childIdentityRefusal` returns `absent` or
`mismatch` and lets the leaf decide which of its states that is, because #44 splits
`CHILD_ABSENT` from `SUBJECT_MISMATCH` and another phase may not.

## The rule that matters most

`aggregateRefusal` refuses an **unreceipted `PASS`** — the aggregate asserting a result no child
evidence supports. Every phase names it as a control, and it is the failure a convergence issue
exists to prevent.

```text
a lane may be claimed PASS   only when a child for that lane says PASS
a lane may be claimed FAIL   only when some child reports a failure
a lane with evidence         may not be omitted from the proposal
```

Both directions, because a fabricated failure is the same defect pointing the other way. Honest
downgrades are admitted: a proposal may report *less* than the evidence supports, never more.

## The human gate is checkable, not just documented

#75's REL-009 asks that promotion be "impossible without an explicit approved Human receipt bound
to exact head/lock/release", with **forge, stale and wrong-author** as its controls. Each is a
separate check because they are separate failures: an unknown approver is not an expired
approval, and neither is an approval for a different release.

A future-dated admit is refused too — that is a clock problem rather than freshness, and treating
it as fresh is how a skewed machine gets an indefinitely valid approval.

## Staleness follows the graph, not the commit

`invalidatedBy` computes the dependent set from the `requires`/`provides` strings the manifests
already carry, as a **fixed point** rather than one hop. Every phase's control is the same:
restamping an unrelated module *solely because HEAD changed*. A commit touches the whole tree;
evidence staleness does not.

Each phase passes its own root, and the suite asserts all four give the right answer against the
real `.arena/modules/*/module.json` graph.

## The digest separator is a zero byte, written as an escape

`aggregateDigest` joins fields with a unicode-escaped zero byte rather than a space. A space lets
two adjacent fields collide — owner `"a b"` with interface `"c"` joins identically to owner `"a"`
with interface `"b c"` — which is exactly the difference the digest exists to see. That collision
is a fixture.

Written as an escape rather than a literal, because a literal zero byte in the source makes git
classify the file as binary and the diff disappears. That happened three times in this work
before the habit stuck.

## What the plant check found

Thirty plants, thirty red, each run against **both** suites: this contract's own, and the Phase 3
leaf that consumes it. The split is informative — a rule that reddens `both` is genuinely shared,
and one that reddens `contract` only is a rule Phase 3 does not yet use (the human gate, which
belongs to #75).

Two findings, both fixtures caught by a neighbouring rule: the empty-graph rule differs from
"not in the graph" only by message, and the fractional-timestamp rule was shadowed by "older than
the window" until its fixture moved inside the window.

## Exercising it

```bash
bun test packages/contracts/src/convergence/convergence.test.ts
bun test services/runtime-fabric/src/convergence/convergence.test.ts   # the first consumer
```

Deterministic and offline.

## For #53, #64 and #75

Each needs a leaf that supplies four things and nothing more: its expected children, its lane
names, its root module, and its own state machine. The rules are already here, and the Phase 3
leaf in `services/runtime-fabric/src/convergence/` is the worked example of that shape.
