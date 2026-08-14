# Phase 3 runtime convergence

Issue #44 (Phase 3 / RT-90) — **the deterministic half only.**

## What this is, and what it deliberately is not

#44 owns the Phase 3 aggregate: the shared runtime registry, module and interface promotion,
`data/status/integration.json`, the release restamp, and the Human dossier. **None of that is
here**, because none of it can be written before the child leaves merge — the issue says so:

> Intended base: exact `main` after all admitted Phase 3 leaves merge; do not stack this on one
> unmerged sibling.

What *can* be built now is the part that is a function of child receipts rather than of merged
bytes. Four of #44's nine evals are exactly that:

| Eval | Here? | Why |
|---|---|---|
| RT-CONV-001 child identity | **yes** | a receipt either names the pinned subject or it does not |
| RT-CONV-002 capability uniqueness | **yes** | two owners for one capability is a set operation |
| RT-CONV-008 transitive invalidation | **yes** | computed from the manifests' `requires`/`provides` |
| RT-CONV-009 deterministic release | **yes** | a claim is either supported by a receipt or it is not |
| RT-CONV-003 local independence | no | needs the merged local provider |
| RT-CONV-004 cloud independence | no | needs the merged cloud provider |
| RT-CONV-005 hybrid protocol | no | needs the merged exchange |
| RT-CONV-006 policy/PTY composition | no | needs both providers |
| RT-CONV-007 cross-provider cleanup | no | needs the providers |

`runtimeConvergenceState` records all nine, with a compile-time floor rejecting any widening to
`PASS`.

## The rule that matters most

RT-CONV-009's control is an **unreceipted `PASS`** — the aggregate asserting a result no child
evidence supports. That is the failure mode a convergence issue exists to prevent, and it needs
no provider to check:

```text
a route may be claimed PASS   only when a child receipt for that route says PASS
a route may be claimed FAIL   only when some child receipt reports a failure
```

Both directions, because a fabricated failure is the same defect pointing the other way. Honest
downgrades are admitted: the proposal may report *less* than the receipts support, never more.

A refused proposal renders **no release digest**, so a drifted aggregate cannot leave one behind.

## Staleness follows the graph, not the commit

RT-CONV-008's control is *"restamp an unrelated module solely because HEAD changed"*. A commit
touches the whole tree; evidence staleness follows the capability graph. `invalidatedBy` computes
the dependent set from the `requires`/`provides` strings the manifests already carry — for this
repository, a `runtime-fabric` change invalidates `runtime-fabric` and `product-adapters` and
nothing else.

It is a **fixed point, not one hop**: a dependent's dependents are stale too. Stopping at depth
one looks correct on this graph and is wrong on the next one, so a three-deep chain fixture pins
it.

The proposal's set must equal the computed one exactly. Too large is the control above; too
small leaves stale evidence admissible.

## Promotion cannot happen by itself

`ADMITTED` and `HUMAN_REJECTED` are reachable **only** from `HUMAN_REVIEW`, and a deterministic
run always ends at `HUMAN_REVIEW`. There is no path from a clean run to `ADMITTED` — the state
machine, not a guard, is what makes "the convergence promoted itself" unexpressible. The eval
suite asserts that no fixture reaches either, rather than manufacturing one.

That is also why those two states have no producer here and that is correct: they are the
human's two answers.

## What the plant check found

Twenty-nine plants, twenty-nine red — after three findings, all fixtures caught by a neighbour:

- the empty-graph rule differs from `invalidatedBy`'s own refusal only in message and timing, so
  the control now asserts the message;
- the subject-digest **shape** rule was shadowed by the equality rule, because a well-formed
  expected digest always differs from a malformed one first — both sides are now malformed;
- the "no child covers this route" rule was shadowed by "a child dissents", because every
  fixture supplied all three routes.

Two of the plants were also my own bad ones: an anchor that no longer matched, and a "mutation"
that only added a comment and so could not change behaviour. Both replaced with real ones.

## Exercising it

```bash
bun test services/runtime-fabric/src/convergence/convergence.test.ts
```

Deterministic and offline. The module graph in the fixtures is the real one from
`.arena/modules/*/module.json`, so RT-CONV-008 is a statement about this repository rather than
about an invented graph.

## What #44 still owns when its children land

`services/runtime-fabric/src/index.ts` public composition, `.arena/modules/runtime-fabric/**`,
`data/status/integration.json`, `data/releases/agent-shield-module-set.json`, and the five
provider-dependent evals. This leaf is the verifier those will be checked against, not a
replacement for them.
