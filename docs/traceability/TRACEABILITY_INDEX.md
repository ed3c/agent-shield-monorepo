# Traceability index

`PENDING_PR` means the eval-first issue exists and the branch is reserved, but no reviewed PR is yet admitted. This is not an evidence state.

## Intent and delivery matrix

| Intent | Source / rationale | Decision | Owner issue | Branch | Eval IDs | Current repository state |
|---|---|---|---|---|---|---|
| INT-001 Bun + TypeScript primary | S-001 pages 20–24; S-002; S-003 | existing architecture contract | #11 | documentation stack | E00.4 | structural baseline `PASS`; future provider work deferred |
| INT-002 low commercial-license risk | S-001 pages 23–25; S-004 | ADR pending in #15 | #15 | `docs/10-git-town-governance` | E10.1 | policy documentation `PENDING_PR`; exact dependency review required |
| INT-003 honest evidence states | S-002; S-003 | ADR-0001 and existing contracts | #13 | `docs/00-intent-traceability` | E00.2 | documentation subject in progress; live states unchanged |
| INT-004 modular ownership | S-001 planned trees; S-002 module contracts | ADR-0001 | #19, #21 | sibling README branches | E30.1–E30.4, E40.1–E40.5 | README coverage `PENDING_PR` |
| INT-005 local/cloud independence | S-001 pages 39–41; S-002 | decision documentation pending | #17 | `docs/20-runtime-source-flows` | E20.2, E20.4, E20.5 | architecture docs `PENDING_PR`; providers unchanged |
| INT-006 stacked parallel delivery | S-006; Git review requirements | ADR-0001 plus Git Town ADR pending | #11, #15 | stack root plus siblings | E10.2–E10.5, E60.3 | issue graph created; tool/config `PENDING_PR` |
| INT-007 Harness-first verification | S-002 proof rules; S-006 | ADR-0001 | #22 | `docs/50-harness-evals` | E50.1–E50.5 | catalog `PENDING_PR` |
| INT-008 content-addressed repair | S-001 sync proposal contrasted with S-002 | repository rejection of newest-wins | #15, #17 | Git and architecture siblings | E10.3, E10.4, E20.5 | policy documented in root; detailed contracts `PENDING_PR` |
| INT-009 immutable bettor consumption | S-003; S-005 | existing integration contract | existing Phase 6 plus future consumer work | current main | existing integration checks | contract present; live private initialization `NOT_EXERCISED` |
| INT-010 documentation before implementation | S-006 | ADR-0001 | #11, #13–#23 | full documentation stack | E00.4, E60.5 | `IN_PROGRESS` as a delivery label; product evidence unchanged |

## Documentation stack

```text
main
└── docs/00-intent-traceability        # issue #13
    ├── docs/10-git-town-governance    # issue #15
    ├── docs/20-runtime-source-flows   # issue #17
    ├── docs/30-apps-services-readmes  # issue #19
    ├── docs/40-control-plane-readmes  # issue #21
    └── docs/50-harness-evals          # issue #22
        └── docs/60-index-convergence  # issue #23, created after siblings stabilize
```

Sibling branches are allowed to proceed concurrently because their writable paths are disjoint. They all depend on the root documentation contract and are retargeted only after their parent is merged.

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

## Convergence checks

Issue #23 must replace every `PENDING_PR` label with an actual PR reference or explicit deferral, verify every relative link and directory README, and ensure no documentation PR changed a product/provider evidence state.