# Runtime fabric service contract

## Owner

- Module: `runtime-fabric`
- Interface: `1.1.0`
- Capability: `runtime.provider/v1`
- Runtime declaration: local `SUPPORTED`; cloud `NOT_IMPLEMENTED`
- External exposure: denied; secrets: broker-only

## Purpose

Register runtime-provider capabilities and report each provider state without borrowing live environments. The current deterministic provider is a disposable local Git worktree contract. Other provider entries are declarations awaiting host/provider receipts.

## Current provider catalog

| Provider | Scope | State | Credential boundary |
|---|---|---|---|
| `local-disposable-worktree` | local | deterministic `PASS` | none |
| `apple-container` | local | `NOT_EXERCISED` | host-only |
| `openshell-tmux-local` | local | `NOT_EXERCISED` | host-only |
| `e2b-firecracker` | cloud | `NOT_IMPLEMENTED` | broker-only |
| `cloudflare-computer` | cloud | `NOT_IMPLEMENTED` | broker-only |
| unknown provider | declared by request | `ABSENT` | none |

## Inputs

- exact provider ID;
- immutable source/release identity where applicable;
- bounded workload and artifact contract;
- broker-owned credentials supplied outside repository state.

## Outputs

A `ProviderReceipt` containing provider ID, scope, state, capabilities, immutable subject when exercised, and detail. A provider catalog entry is not a live execution receipt.

## Non-goals and prohibitions

- Do not import a sibling live checkout, `node_modules`, venv, browser profile, Keychain, or host session.
- Do not copy `.env` or provider credentials into a workspace or artifact.
- Do not treat E2B/OpenShell/Apple Container package presence or source benchmarks as runtime evidence.
- Do not use bidirectional timestamp-based source overwrite; source exchange uses Git/patch/content identity.
- Do not expose generic shell-over-MCP.

## Required eval families before provider implementation

- exact immutable source and provider-version acquisition;
- fresh isolated workspace and dependency closure;
- local-only, cloud-independent, and hybrid route independence;
- network/secret allowlist refusal;
- timeout, cancellation, artifact bounds, process/session/worktree cleanup;
- planted provider absence and execution failure;
- license/SBOM/notices, cost, performance, and isolation receipts for the exact release.

Issue #19 owns this README only. Provider adapters require separate eval-first issues.