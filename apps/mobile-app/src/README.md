# Mobile app source boundary

This leaf inherits [`../README.md`](../README.md), root `AGENTS.md`, and module `product-adapters`. It contains only Bun/TypeScript-side mobile contract projections; the shipped iOS/Android JavaScript runtime is Hermes or JavaScriptCore.

Allowed work: typed actions, state projections, accessibility identifiers, and adapter-neutral receipts. Forbidden work: arbitrary shell/file execution, unauthenticated listeners, credentials/signing material, direct WDA/ADB/Maestro internals, or claims of device/store evidence without receipts.

Current implementation is a contract declaration. Build, simulator/device, External Maestro, In-App MCP, and store-distribution lanes remain named `NOT_EXERCISED` or `NOT_IMPLEMENTED`. Issue #19 / evals `E30.1`–`E30.4` govern this README.
