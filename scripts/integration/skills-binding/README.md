# Skills binding resolver

Issue [#67](https://github.com/ed3c/agent-shield-monorepo/issues/67) owns this leaf. It resolves only the Skills the selected modules require, preserving `skills-shared` canonical ownership and repo-owned differentiation, and renders Claude and Codex projections. No canonical shared body is modified and no live host adapter is contacted.

## One name, one origin

A skill name belongs to exactly one origin — shared or repo-owned — and a name appearing under both is refused **before anything is selected**. Even an identical duplicate under the same origin is refused: two bodies claiming one name means the consumer has to pick, and picking silently is the defect this rule exists to stop.

## Selection is driven by requirements

The bundle is built by walking the requirement list, so injecting an entire upstream registry changes nothing. An optional skill is materialized only when it is named in `approvedOptional`. Both directions are controlled.

## Change needs promotion

A body whose digest differs from what the consumer was built against is admissible only with a compatible interface major **and** a Human-owned promotion reference. Without the reference it is a digest conflict; with an incompatible major it is an interface conflict whether or not a reference exists.

## Host parity has one source

Both projections come from `projectSkills` over the same bundle, so they cannot differ at render time — and a comparison that cannot fail would be dead code. Parity is enforced where it can actually be violated: `verifyBinding` recomputes both projections from the selected bodies, which is what catches a binding tampered with after the fact.

Verification is a pure function of the binding bytes. Round-tripping a binding through JSON — which is all a consumer without an upstream checkout has — verifies identically, with no sibling checkout, network or filesystem involved.

## Five guards removed for being unable to fire

The plant check found five checks that read like protection and could not fail, each dominated by something else in the same file:

| Removed | Dominated by |
|---|---|
| an unrequested-skill scan over the bundle | the bundle is built from the requirement list |
| a parity comparison of the two projections | both are rendered by one function from one input |
| a projection-count check in verification | requiring the sorted host list to be exactly two names implies it |
| a second orphan pass over the previous binding | the first pass is strictly more general |
| — | — |

Three more came back green because a control was too broad rather than because the guard was dead: the projection-digest comparison, the host-coverage rule and the schema check each needed a fixture shaped so only that rule could fire.

## Evidence boundary

`skillsBindingState` carries no `PASS` and the compiler proves it. Binding PASS would prove selected Skill bytes and projections only — not model-carrier invocation, prompt effectiveness, live provider capability or production behaviour.

## Human boundary

The shared versus repo-owned ruling, interface exceptions, Skill promotion and deletion or migration require Human Admit. Rollback is the exact prior binding and source release.
