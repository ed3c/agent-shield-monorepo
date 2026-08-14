# OPA policy adapter

Issue [#55](https://github.com/ed3c/agent-shield-monorepo/issues/55) owns this leaf. It evaluates canonical settlement intents from the [#54](https://github.com/ed3c/agent-shield-monorepo/issues/54) contracts against a versioned policy bundle and emits a decision bound to a policy epoch. It owns no Temporal, OpenBao, device, crypto or chain code, and no convergence path.

## Determinism is a property of the rule signature

```ts
apply(input: OpaEvaluationInput, limits: OpaLimits): { state; reason; requiredEvidence? } | null
```

A rule receives the closed evaluation input and the limits, and nothing else. There is no clock, network handle or random source it could reach for, so SEC-OPA-002 holds because of the shape rather than because someone remembered not to call `Date.now()`.

The most restrictive hit wins regardless of rule order, so reordering a bundle cannot turn a deny into an allow.

## Untrusted text never enters

`buildEvaluationInput` does not carry the intent's `purpose` across. That field is the only free text on a settlement intent, and the simplest way to guarantee it never becomes instruction is to not pass it to the engine at all — an injected override string is then data that was never read, rather than instruction that was filtered.

The intent digest still binds the text, so an injected purpose changes the digest while leaving the policy outcome identical. Both halves are controlled: a digest that ignored the text would be the real defect.

## Failure is never an allow

`ABSENT_ENGINE`, `ABSENT_BUNDLE`, `INVALID_POLICY`, `INVALID_INPUT`, `EVALUATION_FAILED`, `POLICY_EPOCH_STALE` and `FAILED_CLEANUP` are lifecycle outcomes, not decision states, and `decision` is `null` on every one of them. A failure therefore cannot arrive at a call site shaped like an allow.

The adapter re-derives the decision and refuses to forward one it cannot reproduce, so an engine that returns `ALLOW_SESSION` for a denied target produces `EVALUATION_FAILED`.

A bundle declares the rule IDs it contains. A bundle that no longer matches the compiled rule set is an invalid policy rather than a policy that quietly lost a rule.

## Epoch freshness

An intent from an epoch below the bundle's is `POLICY_EPOCH_STALE`, so a prior allow cannot be replayed after a policy promotion. An intent from an epoch above the bundle's is stale too: this bundle is not the one that can judge it.

## Mutation control

SEC-OPA-007 asks for a mutation control, so the suite is one: each rule is dropped in turn and some fixture must change its decision. A rule that no fixture depends on is not load-bearing, and that is caught here rather than in review. A bundle with no rules is refused at construction, because an empty policy is what an assertion-free suite would produce.

Every guard in the adapter was separately disabled and required to turn the controls red — including the per-fixture outcome pinning, which replaced a set-membership check where two different defects had been covering for each other.

## Privacy

A decision receipt carries codes and digests only. Target, amount, currency, actor and purpose are all asserted absent from the serialized decision, so a portable receipt does not become a copy of the input.

## Evidence boundary

`FakeOpaEngine` is a deterministic in-memory fixture. No OPA binary, Rego bundle, network call or clock has been exercised: `opaProviderState` carries no `PASS`, and the compiler proves it. Policy promotion and rollback are separate Human-governed operations.
