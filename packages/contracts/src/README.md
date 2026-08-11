# Contracts source boundary

This leaf inherits [`../README.md`](../README.md), root `AGENTS.md`, and all module manifests that consume the shared contract package. It contains TypeScript type/data-contract implementation only.

Allowed work: portable closed types, state vocabularies, artifact references, canonical validation helpers, and versioned compatibility changes. Forbidden work: provider execution, storage, secrets, browser/device sessions, cryptography, wallet/chain behavior, private module imports, or host-specific paths.

A type or interface declaration never proves its runtime behavior. Contract changes require compatibility replay, negative controls, consumer impact review, and immutable release regeneration. Issue #21 / evals `E40.1`–`E40.5` govern this README.
