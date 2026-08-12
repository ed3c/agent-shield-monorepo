# Project intent contract

## North star

Agent Shield is intended to become a modular, inspectable control system for Agent-initiated work across local and cloud runtimes, product surfaces, research/document flows, and high-risk security boundaries. It should be consumable through immutable bettor-arena releases by Claude Code, Codex CLI, and other bounded Agent drivers.

The project favors composable contracts and evidence over a single large framework. A capability is useful only when another Agent or human can identify its owner, invoke its public boundary, falsify it, inspect its artifacts, and distinguish implementation from live execution.

## Stable intent IDs

### INT-001 — Bun + TypeScript primary stack

Future control-plane, service, CLI, SDK, and Harness work is primarily Bun + TypeScript. Native provider languages remain possible only where the platform requires them and after a dedicated issue admits the boundary.

### INT-002 — low commercial-license risk

Direct and transitive dependencies are deny-by-default. The preferred classes are permissive licenses such as MIT, Apache-2.0, BSD, and ISC after exact-version review. Copyleft, source-available, field-of-use, unknown, or conflicting terms require rejection or Human Admit. No document may guarantee absolute zero legal risk.

### INT-003 — honest evidence states

`PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, and `NOT_EXERCISED` must remain distinct for modules, providers, environments, and releases.

### INT-004 — modular ownership

Every public/module/control-plane directory has a local README contract. Cross-module work uses typed interfaces, packets, artifacts, or receipts rather than private path coupling.

### INT-005 — local and cloud independence

Local-only and cloud-independent routes must be able to fail or succeed independently. Hybrid repair must not create a hidden live-checkout, credential, session, or timestamp-based source-of-truth dependency.

### INT-006 — stacked, parallel delivery

Large work is divided into eval-first stacked PRs. A shared foundation may have path-disjoint child PRs so multiple Worker Agents can proceed concurrently. Each branch has one writer, one isolated worktree, explicit parentage, and a bounded path lease.

### INT-007 — Harness-first verification

Each issue defines subject, preconditions, action, observable, negative control, artifact, state transition, and owner before implementation. Load-bearing gates must prove they can disagree.

### INT-008 — content-addressed repair

Git ancestry, immutable commits, tree identity, manifests, and content digests govern source repair. `newest`, `prefer-cloud`, and `prefer-beta` are not valid semantic merge policies.

### INT-009 — immutable bettor consumption

Agent Shield consumes bettor-arena through an exact release and generated Claude/Codex/Skill/MCP projections. It does not import bettor private implementation or treat a mutable branch as a release.

### INT-010 — documentation before the next implementation wave

The current phase completes provenance, directory contracts, Git Town governance, data flows, Harness examples, eval catalogs, and traceability before adding product/provider code.

## Current admitted work

- Markdown architecture, source, intent, decision, Harness, eval, and directory contracts;
- Git Town team configuration;
- bounded Bash scripts that manage branches, worktrees, proposals, and synchronization;
- issue/PR templates and documentation-only CI specifications;
- generated documentation/release digest updates required by changed immutable contract bytes.

## Current forbidden work

This documentation stack does not implement or promote:

- E2B, Apple Container, OpenShell/tmux, Cloudflare Computer, VFS, or hot-sync providers;
- PDF parsing or signed-in research browsers;
- Expo, Next.js product features, Maestro, WDA, scrcpy, simulators, or devices;
- MPC/TSS, Secure Enclave/NFC, smart accounts, ledger anchoring, or settlement;
- live Claude Code, Codex CLI, Forgejo, browser, device, hardware, or chain canaries.

## Completion of this phase

This phase is complete only after [issue #23](https://github.com/ed3c/agent-shield-monorepo/issues/23) proves link closure, README coverage, stack ancestry, trace closure, documentation-only scope, and an implementation-handoff backlog.