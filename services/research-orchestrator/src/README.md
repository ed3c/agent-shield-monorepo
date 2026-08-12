# Research orchestrator private source boundary

This directory inherits [`../README.md`](../README.md). The current code implements deterministic route selection, not browser or source-verification execution.

```text
typed workflow/environment/artifact request
  → route policy
  → route ID + evidence state + artifact ref receipt
```

Cross-module consumers use `research.route/v1`, not this private path. Any live actor/transport/session provider requires its own issue, exact environment receipt, file-only body boundary, cleanup, and status transition.
