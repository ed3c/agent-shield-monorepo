# Traceability index

## Intent and delivery matrix

| Intent | Source / rationale | Decision | Delivery | Eval IDs | Current repository state |
|---|---|---|---|---|---|
| INT-001 Bun + TypeScript primary | S-001 pages 20–24; S-002; S-003 | existing architecture contract | #11; #13 / PR #25 | E00.4 | structural baseline `PASS`; future provider work separately gated |
| INT-002 low commercial-license risk | S-001 pages 23–25; S-004 | licensing policy; bounded Git Town admission | #17 / PR #26; #31 / PR #33 | E20.1; E10.1; GT-LIVE-001 | policy and exact v24 host artifact review `PASS`; attestation `NOT_EXERCISED`; other dependencies unadmitted |
| INT-003 honest evidence states | S-002; S-003 | ADR-0001 and typed contracts | #13 / PR #25; #23 | E00.2; E60.7 | integration-status blob unchanged; live states unchanged |
| INT-004 modular ownership | S-001 planned trees; S-002 module contracts | ADR-0001 and nearest-README rule | #19 / PR #28; #21 / PR #29; #23 | E30.1–E30.4; E40.1–E40.5; E60.4 | governed-directory coverage audited `PASS` |
| INT-005 local/cloud independence | S-001 pages 39–41; S-002 | architecture environment/data-flow contracts | #17 / PR #26 | E20.2; E20.4; E20.5 | documentation merged; provider states unchanged |
| INT-006 stacked parallel delivery | S-006; Git review requirements | ADR-0001 and `docs/git/` | #15 / PR #27; #23 | E10.2–E10.5; E60.3; E60.5 | governance merged; final PR identities recorded; GT-LIVE-002 through GT-LIVE-005 and the macOS part of GT-LIVE-006 `PASS` on the admitted host artifact, Linux `ABSENT` |
| INT-007 Harness-first verification | S-002 proof rules; S-006 | ADR-0001; Harness/eval contracts | #22 / PR #30; #32 deferred | E50.1–E50.5; E60.6 | catalog/templates complete; mechanical Bun enforcement explicitly deferred to #32 |
| INT-008 content-addressed repair | S-001 sync proposal contrasted with S-002 | reject newest-wins; use Git/content identity | #15 / PR #27; #17 / PR #26 | E10.3; E10.4; E20.5 | detailed policy merged; semantic recovery stays fail-closed |
| INT-009 immutable bettor consumption | S-003; S-005 | existing integration contract | Phase 6 baseline; blocked epic #6 | existing integration checks | deterministic contract present; live private initialization `NOT_EXERCISED` |
| INT-010 documentation before implementation | S-006 | ADR-0001 | #11; #13–#23 | E00.4; E60.1–E60.10 | convergence candidate is based on exact post-#33 main; phase closes only after reviewed #23 PR merges |

## Documentation stack

| Issue | PR | Exact reviewed head | GitHub landed commit |
|---|---|---|---|
| #13 | #25 | `83a270b33ca65a29c1856ff20cf53469c1a21761` | `09d1b565cf8799cf345c8fe0ff70167381de7084b9c` |
| #17 | #26 | `3953dde6bc244d24094c025a5db625d58c46aee1` | `83a270b33ca65a29c1856ff20cf53469c1a21761` |
| #15 | #27 | `bbd0263071a43b615aa493ea5a99d7b4ea42bdfd` | `d51463450e2bdec9f3155ff618456966336d8c6b` |
| #19 | #28 | `93514dea943e3a816cd59252e5bf7f1f25f71189` | `0d6f316fcf031e1416167dee582375b885bdf2ba` |
| #21 | #29 | `83ef4a5ba9b1a4f55d15574315d71db9b1cf73e3` | `5e09734da48caee205a045d0db1a1f1ffe943341` |
| #22 | #30 | `0fc37b16149a73988206f09f9e1bec223ab8d19c` | `60fbe036f5ff544c3a9a557f10c67cfddfec0e21` |
| #31 Phase A | #33 | `edaee5ab0ab249487f35c7d5ee9c5da63d15f659` | `533583eff9b647006a001b69f57db3895dc5e8b1` |

The exact audit, links, authority owners, controls, exclusions, and handoff live in [`DOCUMENTATION_CONVERGENCE.md`](DOCUMENTATION_CONVERGENCE.md). GitHub PR metadata remains the authority for delivery events; this table is the repository snapshot.

## Capability state map

| Capability group | Source locator | Current contract | Required next evidence |
|---|---|---|---|
| text ingest | S-001 document parsing discussions | local text path supported | deterministic receipts and negative controls remain authoritative |
| PDF/document provider | S-001 pages 1–2, 11–14 | typed/planned only | exact provider implementation and malformed-PDF controls |
| local runtime | S-002/S-003 | local disposable route supported | keep cleanup and mutation evidence current |
| E2B/cloud runtime | S-001 page 1, lines 5–8; pages 40–41 | `NOT_IMPLEMENTED` | exact-version license review, provider adapter, isolation and cleanup canary |
| OpenShell/tmux | S-001 pages 1–3 and 40 | `NOT_EXERCISED` or planned | host runtime profile and long-session/cleanup receipts |
| signed-in browser workflows | S-005 Browser Contract v2 | `NOT_EXERCISED` / cloud broker `NOT_IMPLEMENTED` | host-owned session canary without profile leakage |
| Expo/web/mobile adapters | S-001 pages 15–23 | contract only | build, simulator/device, accessibility, and residue evidence |
| Maestro/WDA/scrcpy | S-001 pages 15–19 | `NOT_EXERCISED` / `NOT_IMPLEMENTED` by provider | platform-specific canaries and artifacts |
| MPC/TSS and hardware brake | S-001 pages 24–39 | typed boundary, `NOT_IMPLEMENTED` | threat model, audited implementation, adversarial and recovery receipts |
| wallet, ledger, settlement | S-001 pages 24–39 | typed boundary, `NOT_IMPLEMENTED` | license-reviewed exact dependencies, testnet, rollback, and Human Admit |
| bettor consumption | S-003/S-005 | deterministic contract present | authenticated private-checkout and live Claude/Codex receipts |

## Convergence status

Issue #23 has replaced pre-merge placeholders with exact delivery identities or explicit deferrals. The convergence report records link and README coverage, state/no-product-drift checks, negative controls, the unexercised Agent cold-start lane, and the post-documentation backlog.
