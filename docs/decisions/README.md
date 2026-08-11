# Repository decisions

Decision records explain which source proposals become Agent Shield policy, which are rejected, and which remain deferred.

## States

- `PROPOSED` — discussion is open; not binding.
- `ACCEPTED` — repository policy; implementation may still be absent.
- `SUPERSEDED` — replaced by a newer decision.
- `REJECTED` — intentionally not adopted.
- `DEFERRED` — valid question without enough evidence or current scope.

## Required fields

Every decision record contains:

1. decision ID and state;
2. intent IDs;
3. source IDs and precise locators;
4. context and alternatives;
5. decision and consequences;
6. issue/PR/eval references;
7. evidence boundary and supersession rule.

## Index

| Decision | State | Summary |
|---|---|---|
| [`ADR-0001`](0001-documentation-before-implementation.md) | ACCEPTED | complete provenance, directory contracts, Git governance, Harness, and eval design before the next implementation wave |

Git Town admission, licensing details, and unattended sync policy are owned by issue #15 and receive a dedicated decision record in that PR.