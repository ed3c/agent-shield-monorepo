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

| Subject | State |
|---|---|
| Parent contract | `ed3c/bettor-arena#35` open |
| Agent Shield route binding | `ed3c/agent-shield-monorepo#77` this documentation terminal leaf |
| Shared method binding | `ed3c/skills-shared#84` independent sibling |
| Runtime binding | `ed3c/runtime-env#29` independent sibling |
| Bettor binding | `ed3c/bettor-arena#36` independent sibling |
| Final exact merged/cold-start convergence | future bettor leaf; `NOT_IMPLEMENTED` until siblings merge |

## Git Town topology

The existing Phase 3–6 DAG remains canonical in [`../implementation/STACKED_IMPLEMENTATION_PLAN.md`](../implementation/STACKED_IMPLEMENTATION_PLAN.md). Independent provider leaves are siblings. True interface dependencies form child branches. Each phase has a separate convergence owner. Issue #77 is documentation-only and based on merged `main`, not a child of product/runtime leaves.

PR and commit metadata remain publication truth. Documentation completion does not imply live providers, route-checker execution, GitHub/Forgejo equivalence, product acceptance, or Human promotion.
