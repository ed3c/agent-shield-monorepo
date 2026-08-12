# TypeScript ambient declarations

`types/` contains minimal repository-local compile-time declarations used when an intentionally omitted dependency lacks types in the current Bun + TypeScript baseline.

## State machine

```text
EXACT COMPILER GAP IDENTIFIED → MINIMAL DECLARATION PROPOSED
  → POSITIVE TYPECHECK → NEGATIVE/INCOMPATIBILITY FIXTURE
  → REVIEWED → RETAINED | REPLACED BY ADMITTED OFFICIAL TYPES
```

Blocked: blanket `any`, business/provider contract duplication, hiding a missing runtime dependency, claiming Node compatibility for Bun-only behavior, or adding execution semantics.

## Data flow

```text
exact compiler error/use site
  → minimal ambient shape
  → TypeScript typecheck and disagreement fixture
```

A typecheck PASS is static evidence only. The public business/state contracts live in `packages/contracts`. The implementation issue owning the exact use site also owns the declaration and nearest README update; provider leaves cannot use ambient types to fake package/runtime availability.
