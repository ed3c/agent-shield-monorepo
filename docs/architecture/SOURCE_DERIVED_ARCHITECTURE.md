# Source-derived architecture map

## Status and authority

This document translates source `S-001` into reviewable architecture planes. Every item is either a source proposal, an existing repository contract, or a future evidence requirement. It is not provider execution evidence.

The current repository authority remains `ARCHITECTURE.md`, module manifests under `.arena/modules/`, and `data/status/integration.json`.

## Source proposal → repository treatment

| Plane | S-001 proposal | Current Agent Shield treatment | Evidence required before promotion |
|---|---|---|---|
| ingress | Caddy, mkcert, Cloudflare Tunnel/WebMCP | planned provider boundary | exact-version license review, auth policy, local/cloud route canary |
| dual UI | Next.js/GenUI and Xterm.js/PTY | bounded product-adapter contract | build, accessibility, authenticated stream, cleanup and residue evidence |
| Agent runtime | Claude Code/Codex under OpenShell and tmux | actor/runtime contracts; live provider unexercised | immutable runtime profile, allowlist, process/session lifecycle receipt |
| cloud sandbox | E2B/Firecracker, Cloudflare Computer or Daytona | cloud runtime `NOT_IMPLEMENTED` | exact provider version, isolation, network, secret, timeout, cost and cleanup canary |
| local sandbox | Apple Container/local virtualization | provider contract only | exact host/tool version, relocation and cleanup receipt |
| VFS/document | Mirage, object storage, AnyDoc/PDF tooling | text ingest supported; PDF/provider path planned | malformed-file, provenance, parser-version and content-addressed output controls |
| memory/state | Mem0/LanceDB and ledger proposals | no production memory provider admitted | schema, isolation, retention, deletion, corruption and recovery evidence |
| mobile | Expo/Bun tooling, Hermes on device, Maestro/WDA/scrcpy | TypeScript contracts; device/provider paths unexercised | exact build, simulator/device, auth, accessibility and artifact receipts |
| security | OPA, Temporal, OpenBao, immudb | typed security boundary, not provider execution | policy governance, durable replay, secret broker and tamper/restore evidence |
| wallet/settlement | MPC/TSS, Secure Enclave/NFC, ERC-4337/ZeroDev | typed/inert boundary, `NOT_IMPLEMENTED` | threat model, audit, adversarial tests, recovery, testnet, rollback and Human Admit |
| integration | stateless MCP and external Agent consumption | bettor consumer contract present | exact immutable release, selected closure, Claude/Codex canaries and origin receipts |

## Current six-plane repository model

```text
Contracts
  → Domain modules
  → Runtime fabric
  → Product surfaces
  → Bettor consumer
  → Proof and evidence-state ledger
```

The source architecture contains more implementation-specific components than the current repository. Those names remain candidate providers behind versioned capabilities. A candidate does not become a module dependency until a dedicated implementation issue and license/evidence gate admit it.

## Bun + TypeScript boundary

Repository decision `INT-001` uses Bun + TypeScript for the control plane, services, CLI, SDK, Harness, web, and Expo tooling. The source explicitly distinguishes this from the mobile runtime: React Native TypeScript is bundled for Hermes/JSC on iOS and Android; Bun is not embedded as the on-device engine.

Platform-native languages remain allowed only at required boundaries such as Secure Enclave/CoreNFC, and only after a dedicated issue admits those paths.

## Local, cloud, and hybrid rule

The source proposes three modes:

1. pure local operation;
2. cloud-independent operation;
3. local/cloud synchronization and repair.

Agent Shield adopts independence as a requirement but rejects one generic bidirectional filesystem as the authority for every data class. See `ENVIRONMENT_MODES.md`.

## Security statement

Source `S-001` also states that information security has no absolute flawless state. Agent Shield therefore rejects absolute immunity and ungrounded percentages. Security claims name a subject, threat model, evidence level, residual risk, and rollback/recovery boundary.

## Trace links

- source: `S-001`, pages 1–41;
- intent: `INT-001` through `INT-010`;
- architecture/evidence issue: #17;
- provider implementation issues: #3–#6;
- final documentation convergence: #23.
