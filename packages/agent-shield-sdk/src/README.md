# Agent Shield SDK source boundary

This leaf inherits [`../README.md`](../README.md), root `AGENTS.md`, and the `bettor-consumer` module contract. It contains the TypeScript implementation behind the package's public exports.

Consumers import only through the package entrypoint. Direct imports from private source files, mutable refs, local absolute paths, private loop names, credentials, browser/device sessions, or generic shell surfaces are forbidden.

Current deterministic validation proves the shape of an immutable bettor MCP subject only. Repository/origin reachability, selected module closure, MCP exposure, Claude/Codex execution, cleanup, and production availability remain separate evidence lanes. Issue #21 / evals `E40.1`–`E40.5` govern this README.
