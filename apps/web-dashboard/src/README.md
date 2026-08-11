# Web dashboard source boundary

This leaf inherits [`../README.md`](../README.md), root `AGENTS.md`, and module `product-adapters`. It contains adapter-neutral TypeScript dashboard state and future UI projection code.

Allowed work: typed dashboard views, bounded action requests, accessibility contracts, and receipt rendering. Forbidden work: generic PTY/shell exposure, credentials or browser/session state, direct runtime-provider imports, or treating a framework/package declaration as a live dashboard.

Current code is a `nextjs-contract` state declaration. GenUI, terminal, bettor MCP, authenticated browser, and deployment evidence remain `NOT_EXERCISED`, `NOT_INITIALIZED`, or `NOT_IMPLEMENTED`. Issue #19 / evals `E30.1`–`E30.4` govern this README.
