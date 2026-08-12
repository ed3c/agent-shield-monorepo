# Mobile-automation source boundary

This leaf inherits [`../README.md`](../README.md), root `AGENTS.md`, and module `product-adapters`. It owns the TypeScript registry that reports mobile adapter capability states.

Inputs are adapter identifiers. Outputs are typed `ProductAdapterReceipt` values. Expo, Maestro, WDA, scrcpy, and cloud-iOS remain provider boundaries; no private device/session implementation is imported here.

Do not turn a registered adapter name into `PASS`, run arbitrary paths/commands, store profiles/certificates/device IDs, or conflate local and cloud providers. Real adapters require exact tool/license review, trusted-host authorization, build/device artifacts, failure controls, and cleanup receipts. Issue #19 / evals `E30.1`–`E30.4` govern this README.
