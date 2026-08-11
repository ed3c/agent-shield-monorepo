# Agent Shield modular architecture

Agent Shield is an external reference consumer for bettor-arena and a modular product skeleton. The repository separates six planes:

1. **Contracts** — host-neutral TypeScript types and evidence states.
2. **Domain modules** — document ingest, research orchestration, deterministic intent/ledger, product adapters, and security boundaries.
3. **Runtime fabric** — local and cloud provider contracts; no provider is promoted without a live receipt.
4. **Product surfaces** — web/mobile contracts and automation adapters.
5. **Bettor consumer** — immutable Claude Code/Codex CLI/MCP initialization through bettor-arena.
6. **Proof** — deterministic selftests, negative controls, and an honest integration status ledger.

## Internal and external use

A module directly reads only its own implementation. Another module is consumed through a typed function, packet, artifact reference, or receipt. Local symlinks may project shared Skills during development; release and cloud execution use immutable bindings or bundles.

## Runtime boundary

The local deterministic provider is implemented. Apple Container, E2B, OpenShell/tmux, and cloud signed-in browser providers are represented as contracts and remain `NOT_EXERCISED` or `NOT_IMPLEMENTED` until their host canaries run. Source code uses single-writer branch/patch flow; no blind newest-wins synchronization is admitted.
