# Web dashboard contract and state machine

## Owner and current state

- Module: `product-adapters@1.0.0`
- Capability: `product.dashboard/v1`
- Stack: Bun + TypeScript. The projection is framework-free on purpose — a renderer is a
  separate decision, and adding one now would only produce a package declaration, which
  UX-WEB-008 explicitly refuses to count as evidence.
- dashboard projection and typed action surface: implemented by [#46](https://github.com/ed3c/agent-shield-monorepo/issues/46)
- GenUI rendering: `NOT_EXERCISED`
- terminal/PTY projection: `NOT_EXERCISED` (owned by [#47](https://github.com/ed3c/agent-shield-monorepo/issues/47))
- bettor MCP initialization: `NOT_EXERCISED`
- signed-in browser transport: `NOT_EXERCISED`
- build and preview canary: `NOT_EXERCISED`
- cloud deployment: `NOT_IMPLEMENTED`

## What the projection guarantees

The view state is the **worst** cell state, never the best: one stale, waiting, denied or
failed cell keeps the whole view out of `RENDERED`. A cell status maps to exactly one evidence
state and only `COMPLETED` is `PASS`, so nothing incomplete can be drawn as success.

Every receipt must belong to the one subject the view names, and both subject digests are part
of the view rather than hidden behind it. A receipt older than the freshness bound becomes
`STALE` regardless of what it used to say, and a disconnected view drops previous successes
instead of retaining them — a lost connection is not a completed run.

Actions are parsed by the shared `#45` product contract, so an arbitrary URL, command, file,
prompt or tool string cannot be expressed. This app adds only the surface concerns: CSRF token,
subject binding, operator identity and scope, and a session-owned spent-nonce set for replay.
An action whose catalog entry requires Human Admit is refused here rather than granted — the
dashboard can surface that it is waiting, never decide it.

Rendered text is bounded and refused outright when it is credential-shaped, because truncating
a secret still leaks its prefix.

`dashboardState` carries no `PASS`, and that is enforced by the compiler rather than by a
runtime scan: the object is `as const`, so a type alias in the controls stops compiling if any
field ever becomes `PASS`.

## State-machine ownership

[#45](https://github.com/ed3c/agent-shield-monorepo/issues/45) owns shared action/projection contracts; [#46](https://github.com/ed3c/agent-shield-monorepo/issues/46) owns dashboard/GenUI; [#47](https://github.com/ed3c/agent-shield-monorepo/issues/47) owns authenticated terminal projection; [#53](https://github.com/ed3c/agent-shield-monorepo/issues/53) owns aggregate product state/release.

### Dashboard lifecycle

```text
UNINITIALIZED → LOADING_SUBJECT → VERIFYING_RECEIPTS → READY
  → ACTION_REQUESTED → AUTHORIZING → DISPATCHED → OBSERVING → RENDERED
```

Alternative states: `STALE`, `ABSENT`, `NOT_IMPLEMENTED`, `NOT_EXERCISED`, `WAITING_FOR_HUMAN`, `WAITING_FOR_HARDWARE`, `DENIED`, `FAILED`, `DISCONNECTED`.

### Terminal projection lifecycle

```text
UNBOUND → SUBJECT_RESOLVED → AUTHENTICATED → CONNECTING → ATTACHED
  ↔ DISCONNECTED → DRAINING → CLOSED
```

Blocked/terminal: `ABSENT_SESSION`, `STALE_SUBJECT`, `AUTH_REFUSED`, `CONNECT_FAILED`, `RATE_LIMITED`, `STREAM_LIMIT`, `TASK_FAILED`, `SESSION_TERMINATED`, `CLEANUP_FAILED`.

## Data flow

```text
module/provider/product receipts + immutable artifacts + operator identity
  → subject/freshness validation
  → state-faithful accessible view model
  → optional closed typed action
  → owning public capability
  → refreshed receipt projection
```

Terminal path:

```text
task/session artifact ref + scoped operator capability
  → public PTY attach port
  → bounded output frames / allowlisted controls
  → disconnect/final task receipt
```

## Prohibitions

- no generic shell, caller-selected host session/command/cwd/env/private flag;
- no UI conversion of stale/missing/waiting/failure into success;
- no secret-bearing raw streams, browser/device profiles, tokens, host paths, or unbounded model/process output;
- no package-presence proxy for build/deploy/browser/terminal PASS;
- no bypass of risk, hardware gate, or Human Admit.

Leaf source inherits this contract. Shared product registry/status/release belongs to #53.
