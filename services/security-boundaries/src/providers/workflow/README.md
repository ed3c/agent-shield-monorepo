# Durable approval and signing workflow

Issue [#56](https://github.com/ed3c/agent-shield-monorepo/issues/56) owns this leaf. It consumes policy decisions and other providers only through typed activities; no provider private code or convergence path belongs here.

## Determinism is the signature

```ts
decide(history: readonly WorkflowEvent[]): WorkflowCommand
```

The decision function's only input is the recorded history. There is no clock, random source or network handle in scope, so SEC-WF-001 holds because of the shape rather than a rule about which calls to avoid. Time enters only as a recorded field on an event, and the controls prove it: shifting every timestamp in a history by a constant produces exactly the same commands, which would fail immediately if anything read absolute time.

The runtime holds no decision logic of its own. Everything it does is a consequence of `decide`, which is why a restart resumes from the history alone.

## Two waits, two events

The high-risk route waits twice, and the two waits are released by two different recorded events:

```text
await-hardware   released by  hardware-attested
sign             released by  human-approved
```

Neither can stand in for the other. A workflow with an attestation but no approval still waits, and one with an approval but no attestation still waits. The first version of this module gated both on human approval, which made the signing gate unreachable — a plant check found it immediately, because disabling a guard nothing can reach changes no control.

## Idempotency

A repeated completion event for an activity already recorded changes nothing, so a retried delivery cannot duplicate a challenge, a signature, a ledger write or a submission. The runtime derives an idempotency key from the workflow and the activity and refuses to dispatch the same key twice — which is what a compensation that itself fails runs into, and that outcome is pinned exactly rather than as "not cancelled".

## Stale evidence

The epochs recorded at start must still agree when signing or submission is about to run. A revocation landing during a wait therefore stops the workflow **before** it signs, and the receipt names the drift.

## Failure separation

Denial, cancellation, deadline, activity failure and failed compensation are five distinct outcomes. There is no catch-all completed state, and every failure fixture is pinned to its own outcome.

## Provider isolation

The activity port's entire surface is `run`, `currentEpochs`, `activeWorkers` and `shutdown` — asserted exactly, so a member that could carry a secret or name a provider path would fail the controls. An idempotency key carries the workflow and the activity and nothing else.

## Evidence boundary

`FakeActivityPort` is a deterministic in-memory fixture. No Temporal server, Worker, namespace or live replay has been exercised; `workflowProviderState` carries no `PASS` and the compiler proves it.

Workflow durability would not prove policy correctness, hardware authenticity, cryptography, ledger integrity or chain settlement in any case, and a replay PASS applies only to the exact history and code subject it ran against.

## Human boundary

Workflow schema and version promotion, compensation policy, the production namespace, and manual approval, cancellation or rollback require Human Admit.
