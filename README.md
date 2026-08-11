# Agent Shield Monorepo

A Bun + TypeScript modular product skeleton and the first external acceptance consumer for `bettor-arena`.

The repository turns the broad source architecture into explicit modules and honest evidence states. It does not promote a PDF claim, package presence, browser login, cloud account, hardware capability, or contract idea into a production guarantee.

## Implemented structural phases

1. **Module and context foundation** — `AGENTS.md`, `CLAUDE.md`, architecture SSOT, typed contracts, module manifests, and CI.
2. **Deterministic domain kernel** — content-addressed text ingest, research routing, bounded intent decisions, and typed receipts.
3. **Stable product and SDK ports** — immutable bettor MCP subject, web/mobile state contracts, and public TypeScript functions.
4. **Runtime provider contracts** — local disposable execution is exercised; Apple Container and OpenShell/tmux are `NOT_EXERCISED`; E2B and Cloudflare Computer providers are `NOT_IMPLEMENTED`.
5. **Product adapter contracts** — Expo, Maestro, WDA, scrcpy, browser, and dashboard adapters remain separate from device/session evidence.
6. **Security boundaries** — MPC/TSS, Secure Enclave/NFC, smart account, ledger anchor, and settlement are typed but `NOT_IMPLEMENTED` until audited native providers and adversarial receipts exist.
7. **Bettor integration** — a Bun driver can ask an exact bettor release to transactionally generate Claude Code, Codex CLI, selected Skills, consumer lock, and the Bun stateless MCP launcher.

## Verify

```bash
bun run check:all
```

Without a generated `.arena/consumer.lock.json`, bettor integration reports `NOT_EXERCISED` and exits successfully. It never reports PASS from absence.

## Initialize through bettor-arena

The bettor checkout must contain the merged Phase 5/6 Bun implementation and must be clean.

```bash
bun scripts/bootstrap-bettor.ts \
  --bettor-root /path/to/bettor-arena \
  --commit <exact-40-hex-commit>

# Review the content-addressed plan, then apply it.
bun scripts/bootstrap-bettor.ts \
  --bettor-root /path/to/bettor-arena \
  --commit <exact-40-hex-commit> \
  --apply
```

Use `--embedded` for a self-contained no-hardlink bettor clone. Remote mode uses the host-owned `BETTOR_ARENA_ROOT`; the host path is never committed.

## Source architecture boundary

The source document proposes E2B/Firecracker sandboxes, OpenShell/tmux, cloud/local hot sync, PDF parsing, mobile simulators, MPC/TSS, wallets, and settlement. Those proposals are represented as provider contracts and staged modules. Live provider, hardware, chain, Claude/Codex, Forgejo, and signed-in browser evidence remains environment-owned and is never inferred by CI.
