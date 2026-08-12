# TypeScript ambient declarations

## Purpose

`types/` contains repository-local ambient declarations needed by the Bun + TypeScript baseline when upstream runtime/library types are intentionally absent from the minimal dependency graph.

## Boundary

These declarations may describe compile-time shapes only. They must not redefine business contracts from `packages/contracts`, hide a missing runtime dependency, claim Node compatibility for Bun-only behavior, or introduce provider/product execution semantics.

## Rules

- Keep declarations minimal and tied to an exact compiler error/use site.
- Prefer official package/runtime types when that dependency is admitted.
- Do not add `any` as a blanket escape from validation.
- A typecheck green is static evidence only; it does not prove runtime behavior.
- Changes require TypeScript compile checks and a negative fixture or documented incompatibility that the declaration resolves.

Issue #21 / evals `E40.1`–`E40.5` govern this directory. No runtime implementation belongs here.
