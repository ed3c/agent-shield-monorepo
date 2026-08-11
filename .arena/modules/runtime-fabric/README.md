# runtime-fabric module

- Interface: `1.1.0`
- Root: `services/runtime-fabric`
- Provides: `runtime.provider/v1`
- Runtime: local `SUPPORTED`; cloud `NOT_IMPLEMENTED`
- External exposure: false; secrets: broker-only

The current deterministic provider is `local-disposable-worktree`. Apple Container and OpenShell/tmux are `NOT_EXERCISED`; E2B and Cloudflare Computer are `NOT_IMPLEMENTED`.

Provider declarations are not executions. Every future adapter must prove immutable acquisition, isolation, allowlists, artifacts, timeout/cancellation, and cleanup without borrowing live owner dependencies.