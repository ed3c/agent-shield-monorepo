# Canonical contracts package

## Purpose

`packages/contracts` is the shared TypeScript vocabulary for evidence and module boundaries. Its exports are portable data contracts; they do not execute providers.

## Current public types

- `EvidenceState`: `PASS | FAIL | ABSENT | NOT_IMPLEMENTED | NOT_EXERCISED`
- `ArtifactRef`
- `ModuleReceipt`
- `BrowserWorkflowRequest`
- `ProviderReceipt`
- `ProductAdapterReceipt`
- `SecurityCapabilityReceipt`

## Rules

1. Every receipt names its module/provider/adapter/capability and exact state.
2. `PASS` requires an exercised immutable subject; callers may not infer it from a type or artifact reference.
3. Artifact paths are optional and must never expose temporary server or host-private paths across trust boundaries; prefer digest plus typed bytes/reference.
4. New fields default to closed validation. Unknown fields require a schema/interface version decision.
5. Cross-module imports use the public package entrypoint, not another module's private source.
6. Contract changes require compatibility evals, mutation controls, consumer impact review, and immutable release regeneration.

## Non-goals

No network, storage, secret resolution, browser session, runtime, device, cryptography, wallet, or chain behavior belongs in this package.