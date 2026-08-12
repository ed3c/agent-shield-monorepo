# Four-repository routing traceability

This document extends the canonical [`TRACEABILITY_INDEX.md`](TRACEABILITY_INDEX.md) without replacing its intent/source/decision/delivery matrix.

## Common trace chain

```text
source / intent
→ repository decision
→ parent issue
→ molecular issue
→ sibling or true-child PR
→ eval and disagreement control
→ immutable subject
→ status / receipt
→ Human Admit
```

## Documentation stack

| Plane | Issue | PR | Stack class | State |
|---|---|---|---|---|
| Parent contract | `ed3c/bettor-arena#35` | n/a | parent | open |
| Agent Shield product binding | `ed3c/agent-shield-monorepo#77` | `#78` | independent terminal sibling | Draft |
| Shared method binding | `ed3c/skills-shared#84` | `ed3c/skills-shared#85` | independent sibling | Draft |
| Runtime binding | `ed3c/runtime-env#29` | `ed3c/runtime-env#30` | independent sibling | Draft |
| Bettor binding | `ed3c/bettor-arena#36` | `ed3c/bettor-arena#37` | independent sibling | Draft |
| Exact merged/cold-start convergence | `ed3c/bettor-arena#38` | future | convergence leaf | blocked by four PRs |

Exact candidate heads are read from GitHub PR metadata. The convergence leaf records immutable merged commit/tree identities after all four inputs exist.

## Git Town topology

The existing Phase 3–6 DAG remains canonical in [`../implementation/STACKED_IMPLEMENTATION_PLAN.md`](../implementation/STACKED_IMPLEMENTATION_PLAN.md). Independent provider leaves are siblings. True interface dependencies form child branches. Each phase has a separate convergence owner. Issue #77 / PR #78 is documentation-only and based on merged `main`, not a child of product/runtime leaves.

PR and commit metadata remain publication truth. Documentation completion does not imply live providers, route-checker execution, GitHub/Forgejo equivalence, product acceptance, or Human promotion.
