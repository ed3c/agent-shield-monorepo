# Runtime-fabric source boundary

This leaf inherits [`../README.md`](../README.md), root `AGENTS.md`, and module `runtime-fabric`. It owns the TypeScript provider registry and typed `runtime.provider/v1` receipts.

The deterministic local disposable-worktree contract is the only current provider state marked `PASS`. Apple Container and OpenShell/tmux local routes are `NOT_EXERCISED`; E2B and Cloudflare Computer routes are `NOT_IMPLEMENTED`.

Do not borrow credentials, localhost services, live checkouts, browser/device sessions, or mutable `main`; do not infer provider availability from a registry entry. Provider work requires exact version/license review, isolation, network/secret limits, timeout, artifacts, touched-path and cleanup controls. Issue #19 / evals `E30.1`–`E30.4` govern this README.
