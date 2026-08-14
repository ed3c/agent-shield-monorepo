# Web dashboard source boundary

This private source directory inherits [`../README.md`](../README.md). Public cross-module use goes through `product.dashboard/v1` and typed receipt/action contracts.

## Local state machine

```text
SOURCE_CHANGE → TYPE/BUILD CHECK → RECEIPT-STATE FIXTURE CHECK
  → ACCESSIBILITY/AUTH/BOUNDS CONTROLS → PREVIEW CANARY → CLEANUP RECEIPT
```

Implemented by [#46](https://github.com/ed3c/agent-shield-monorepo/issues/46):

- `types.ts` — view schema, dashboard states, cell and operator shapes, rendering bounds;
- `state-machine.ts` — lifecycle, cell-status to evidence mapping, and worst-cell view state;
- `view-model.ts` — subject and freshness validation, bounded sanitized cells, announcements;
- `actions.ts` — session CSRF, subject binding, operator scope, replay set, Human Admit refusal;
- `dashboard.test.ts` — UX-WEB-001 through UX-WEB-008 with positive and disagreement controls.

GenUI rendering, terminal projection, browser transport, build and cloud deployment remain unexercised or unimplemented as listed by the parent. No renderer or HTTP server is included: a package declaration alone would be `NOT_EXERCISED` under UX-WEB-008, so it would add surface without adding evidence.

Each control names the message fragment its own rule produces, or asserts a compile-time
property. A control that accepts any thrown error lets a dominated guard look load-bearing when
the guards are disabled one at a time.

## Data flow

```text
typed receipts/actions → private view model/components → accessible rendered state
  → optional public action request → owning module receipt
```

Do not import runtime/provider private source, add generic terminal/action passthrough, persist sessions/secrets, or change shared status/release outside #53.
