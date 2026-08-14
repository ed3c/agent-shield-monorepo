# Product contract family

Issue [#45](https://github.com/ed3c/agent-shield-monorepo/issues/45) owns this Phase 4 foundation. Web, mobile, terminal and QA adapters consume these contracts; they do not import one another's private source, and no adapter implementation lives here.

## Public schemas

```text
agent-shield/product-action/v1
agent-shield/product-automation-request/v1
agent-shield/product-action-receipt/v1
```

An action binds the request ID, the admitted action ID/version, surface, environment, one platform-neutral accessibility target, closed arguments, an actor/scope/nonce/expiry authorization, and named exclusions. An automation request binds the action digest, the adapter subject, projection bounds and artifact kinds. A receipt binds the same action digest and adapter plus the full lifecycle trace, outcome, derived evidence state, frame count, artifacts, cleanup and exclusions.

## State machine

```text
UNRESOLVED → ACTION_VALIDATED → AUTH_CHECKED → RISK_CHECKED → ROUTED
  → EXECUTING → OBSERVING → COMPLETED
```

Named blocked and terminal states:

```text
WAITING_FOR_HUMAN   WAITING_FOR_HARDWARE   DENIED             ABSENT_ADAPTER
NOT_IMPLEMENTED     NOT_EXERCISED          FAILED_ACTION      FAILED_PROVIDER
FAILED_OBSERVATION  FAILED_CLEANUP
```

Each progress state declares the exact set it may reach, so a trace that skips validation, authorization or observation is rejected rather than normalized. A lifecycle that continues past an outcome also fails.

## Data flow

```text
authenticated user/Agent action
  → precompiled typed action
  → product adapter
  → optional automation/projection provider
  → domain/risk decision
  → view-state transition
  → artifact/receipt projection
```

## Closed by construction

The caller selects an admitted action ID and admitted argument keys. Command, argv, shell, script, SQL, XPath, CSS selector, URL, route, deep link, host path, `cwd`, environment and `bun` keys are rejected at parse depth, including nested inside argument objects. `productEvidenceForOutcome` derives the evidence state from the outcome, so a producer cannot assert its own `PASS`; `validateProductActionReceipt` rejects a receipt whose declared state disagrees.

A privileged action cannot be published as self-admitting: the catalog rejects `riskClass: "privileged"` without `humanAdmitRequired`.

## Evidence boundary

These bytes prove deterministic schemas, transition legality, authorization/expiry checks, projection bounds and receipt binding only. They do not prove Next.js, Expo, Maestro, WDA, scrcpy, a simulator, a device, a store listing, or any cloud surface. Bun is tooling here; the shipped mobile runtime remains Hermes/JSC, and a claim otherwise cannot even be expressed as an action argument.

Adapter absence (`ABSENT_ADAPTER`), implementation absence (`NOT_IMPLEMENTED`) and an unrun canary (`NOT_EXERCISED`) stay three distinct states. `validateProductAdapterSubject` refuses live evidence for an unimplemented adapter and refuses `PASS` for an unavailable one.

## Controls

`product.test.ts` runs UX-FND-001 through UX-FND-008 with positive and disagreement controls. It is a plain Bun script in the repository's test convention, so `bun test` executes it and any failed assertion throws.

## Human boundary

Human review owns public action admission, production listener and auth scope, and any action that changes risk, funds, keys or permissions.
