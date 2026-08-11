# Evidence levels and states

## Verdict states

| State | Meaning | Must not be read as |
|---|---|---|
| `PASS` | the named assertion ran against the exact subject and satisfied its observable at the declared evidence level | permanent availability, production safety, or another environment's result |
| `FAIL` | the action ran or precondition was checked and the named assertion did not hold | tool absence or an unimplemented capability |
| `ABSENT` | required input, tool, credential/session, provider, file, ref, or environment was missing | a test failure or optional success |
| `NOT_IMPLEMENTED` | the declared capability/path does not exist | skipped, unavailable today, or partially green |
| `NOT_EXERCISED` | mechanism may exist, but this subject/action/environment was not run | `PASS`, hashed-not-run, or inferred compatibility |

Named sub-states such as `SKIPPED_BY_POLICY`, `HASHED_NOT_RUN`, `BLOCKED`, or `STALE` may refine a receipt but never collapse into `PASS`.

## Evidence ladder

1. **Source/proposal** — supplied conversation, design, table, official claim, or issue intent.
2. **Static contract** — schema, type, manifest, configuration, lint, link, or ownership assertion.
3. **Deterministic mechanism** — pure/local behavior run with fixed fixtures.
4. **Public control** — execution starts from the public port and observes effects/exits rather than private helpers.
5. **Mutation/hollow** — a load-bearing guard is disabled or the artifact is hollow and the system turns red.
6. **Adapter canary** — released host adapter reaches the mechanism with real serialization/context boundaries.
7. **Live provider/device/browser/chain canary** — exact external environment/account/session/device executes the bounded subject.
8. **Production observation** — named deployment and time-window behavior, with operational context.
9. **Human Admit** — reviewed acceptance, merge, permission, custody, promotion, or release decision.

## Non-substitutability

- A higher-sounding document cannot replace a lower missing execution step.
- Static contract green does not prove runtime behavior.
- Deterministic local green does not prove cloud or device reachability.
- Provider canary does not prove permanent availability or production outcome.
- Production observation does not prove all unobserved threat cases.
- Human Admit authorizes the reviewed subject; it does not change failed bytes into passing bytes.
- Proof, public control, mutation, consumer canary, production observation, and cleanup are separate axes.

## Subject binding

Every receipt binds the smallest valid subject:

```text
interface/schema digest
+ owned files or module closure digest
+ direct dependency interface digests
+ selected Skill/runtime/policy digests
+ fixture/eval spec digest
+ environment/provider identity when live
```

Repository commit/tree remains provenance. Unrelated changes should not invalidate an independent module receipt; changed dependencies and transitive dependents must become stale.

## Time and availability

A live receipt proves one bounded arrival at one time. Expiry, provider changes, credential rotation, policy epochs, browser/device sessions, and production deployments require explicit freshness rules. “Worked once” is never converted into “always available.”
