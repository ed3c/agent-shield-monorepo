# Current and planned repository tree

This document prevents the source proposal from being mistaken for current implementation. Paths under **Current** exist on the documentation-stack parent. Paths under **Planned** are capability slots only and must not be created as empty implementation directories.

## Current governed tree

```text
agent-shield-monorepo/
├── AGENTS.md
├── ARCHITECTURE.md
├── README.md
├── .arena/modules/
│   ├── bettor-consumer/
│   ├── document-ingest/
│   ├── product-adapters/
│   ├── research-orchestrator/
│   ├── runtime-fabric/
│   └── security-boundaries/
├── apps/
│   ├── mobile-app/
│   └── web-dashboard/
├── services/
│   ├── document-ingest/
│   ├── intent-ledger/
│   ├── mobile-automation/
│   ├── research-orchestrator/
│   ├── runtime-fabric/
│   └── security-boundaries/
├── packages/
│   ├── agent-shield-sdk/
│   └── contracts/
├── scripts/
├── data/
│   ├── releases/
│   └── status/
└── docs/
```

The current tree is a Bun + TypeScript structural and deterministic-contract baseline. Module/provider live states remain those declared by manifests and the status ledger.

## Planned capability slots derived from S-001

```text
contracts/                         # audited smart-account/plugin boundary
services/
├── runtime-providers/
│   ├── local-apple-container/     # candidate provider
│   ├── cloud-e2b/                 # candidate provider
│   ├── openshell-policy-broker/   # candidate provider
│   └── tmux-pty-lifecycle/        # candidate provider
├── security-providers/
│   ├── policy-opa/                # candidate provider
│   ├── workflow-temporal/         # candidate provider
│   ├── secret-openbao/            # candidate provider
│   ├── ledger-immudb/             # candidate provider
│   └── mpc-tss/                   # candidate provider
├── document-providers/
│   └── pdf-parser/                # independently releasable provider
└── mobile-automation/
    ├── maestro/
    ├── ios-wda/
    └── android-scrcpy/
apps/
├── mobile-app/                    # production Expo adapter, not only contract
├── ios-hardware-brake/            # native Swift boundary
└── web-dashboard/                 # production dashboard/terminal adapter
packages/
├── agent-shield-sdk/
├── contracts/
└── provider-spi/                  # typed provider interfaces
```

These are not promised names or implementation roots. An implementation issue may rename or split them after inspecting current upstream APIs and ownership conflicts.

## Admission transaction for a new path

```text
source/need
  → requirement and owner issue
  → exact dependency/license review
  → module/capability contract
  → path ownership update
  → evals and negative controls
  → implementation PR
  → deterministic proof/control/mutation
  → live canary
  → immutable release and Human Admit
```

Creating an empty directory, package manifest, diagram, or provider name does not advance the evidence state.

## Placement rules

- TypeScript contracts live under `packages/contracts` until a new public package has a distinct release boundary.
- Provider-specific code belongs behind `runtime.provider/v1`, document, product, or security capabilities; other modules do not import its private paths.
- Native mobile/hardware code is isolated from Bun runtime assumptions.
- Generated release/status data is not manually edited except through its admitted generator.
- Every new public/module/control-plane directory adds or updates the nearest `README.md` in the same PR.
