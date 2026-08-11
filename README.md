# agent-shield-monorepo

Agent Shield is the **domain product repository** for a policy-gated Agent transaction pipeline. It is intentionally separate from `bettor-arena`, which owns cross-repository composition, proof aggregation, stateless MCP publication, and eventual project bootstrap.

This first implementation slice is a Bun + TypeScript monorepo that turns the PDF architecture into executable, falsifiable contracts instead of pretending every proposed provider is already production-ready.

## What is executable now

- typed intent, risk, approval, ledger, settlement, sandbox, CLI, and JSON-RPC tool contracts;
- deterministic risk routing: autonomous, human approval, or deny;
- approval state machine that refuses high-risk settlement without the required evidence shape;
- append-only SHA-256 hash-chain ledger with tamper detection;
- settlement planning that never claims real MPC, Secure Enclave, NFC, or on-chain execution;
- allowlisted stateless tool gateway with no generic shell, arbitrary `cwd`, host path, or secret argument;
- bettor-compatible `.arena` module manifests, composition requirements, ownership checks, and a deterministic lock;
- per-module verify, selftest, independent control, and hollow/mutation checks;
- relocation verification outside the source checkout;
- explicit `skills-shared` and `runtime-env` consumer requirements.

## Quick start

```bash
sh bootstrap.sh
bun run verify
bun run selftest
bun run test
bun run contract
```

Evaluate a typed intent:

```bash
bun shieldctl/shieldctl.ts intent evaluate --input tests/fixtures/allow.json --json
```

Run the end-to-end deterministic simulation:

```bash
bun shieldctl/shieldctl.ts workflow simulate \
  --input tests/fixtures/require-human.json \
  --approval tests/fixtures/approval.json \
  --now 2026-08-11T00:01:00.000Z \
  --ledger data/receipts/demo-ledger.jsonl \
  --json
```

Start the Bun HTTP control plane:

```bash
bun run dev
```

Start the stdio tool gateway:

```bash
bun run mcp:serve
```

## Trust boundary

Real provider integrations remain fail-closed and named `NOT_IMPLEMENTED` or `NOT_EXERCISED`: E2B, Apple Container, OpenShell, tmux PTY, Cloudflare ingress, React Native/Expo, iOS Secure Enclave + NFC, MPC-TSS, OPA, Temporal, immudb, ZeroDev, OpenBao, and live Claude/Codex canaries.

Read [`AGENTS.md`](AGENTS.md), then [`ARCHITECTURE.md`](ARCHITECTURE.md), before changing the repository.
