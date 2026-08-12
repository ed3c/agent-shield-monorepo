# Web dashboard contract and state machine

## Owner and current state

- Module: `product-adapters@1.0.0`
- Capability: `product.dashboard/v1`
- Future stack: Bun + TypeScript with a Next.js-compatible adapter
- dashboard contract: present
- GenUI rendering: `NOT_EXERCISED`
- terminal/PTY projection: `NOT_EXERCISED`
- bettor MCP initialization: `NOT_EXERCISED`
- signed-in browser transport: `NOT_EXERCISED`
- cloud deployment: `NOT_IMPLEMENTED`

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
