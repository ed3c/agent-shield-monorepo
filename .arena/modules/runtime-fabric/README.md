# runtime-fabric module state route

- Interface: `1.1.0`
- Root: `services/runtime-fabric`
- Provides: `runtime.provider/v1`
- Runtime: local `SUPPORTED`; cloud `NOT_IMPLEMENTED`
- External exposure: false; secrets: broker-only

## Current state/data flow

```text
provider request → catalog
  → local-disposable-worktree: deterministic PASS
  → Apple Container/OpenShell-tmux: NOT_EXERCISED
  → E2B/Cloudflare: NOT_IMPLEMENTED
  → unknown: ABSENT
```

## Implementation stack

Foundation #38; provider leaves #39–#43; convergence #44. The target lifecycle is resolve → admission → materialize → run → collect → cleanup → completed, with absence/policy/failure/timeout/cancel/cleanup states separate.

Leaves own private adapters; #44 owns public provider registry, module/interface, status, release and cross-provider controls.

See [`../../../services/runtime-fabric/README.md`](../../../services/runtime-fabric/README.md) and [`../../../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](../../../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md#phase-3--runtime-fabric).
