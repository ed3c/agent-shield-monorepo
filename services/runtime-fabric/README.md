# Runtime fabric service contract and implementation stack

## Owner/current provider states

- Module: `runtime-fabric@1.1.0`
- Capability: `runtime.provider/v1`
- secrets: broker-only; external exposure denied

| Provider | State |
|---|---|
| `local-disposable-worktree` | deterministic `PASS` |
| `apple-container` | `NOT_EXERCISED` |
| `openshell-tmux-local` | `NOT_EXERCISED` |
| `e2b-firecracker` | `NOT_IMPLEMENTED` |
| `cloudflare-computer` | `NOT_IMPLEMENTED` |
| unknown ID | `ABSENT` |

## Current state machine

```text
REQUESTED → PROVIDER_ID_VALIDATED → CATALOG_LOOKUP
  → exact provider state/capability receipt
```

Only `local-disposable-worktree` currently performs an isolated deterministic run. Catalog declaration is not execution.

## Target provider lifecycle

Foundation [#38](https://github.com/ed3c/agent-shield-monorepo/issues/38):

```text
UNRESOLVED → RESOLVED → ADMISSION_CHECKED → MATERIALIZING → READY
  → RUNNING → COLLECTING → CLEANING → COMPLETED
```

Blocked/terminal states include absence, not implemented, not exercised, policy/admission/materialization/execution/artifact/cleanup failure, cancellation, and timeout.

## Data flow

```text
closed runtime request + immutable selected closure + broker refs
  → provider resolver/admission
  → fresh isolated workspace
  → exact environment/network/secret/timeout limits
  → bounded execution
  → content-addressed artifacts and touched-path/exit receipt
  → process/workspace/session/lease cleanup receipt
```

Hybrid exchange is data-class-specific: Git/patch for source, immutable object for artifacts, epoch for policy, image rebuild for OS, replay for data, broker refs for secrets/sessions. Timestamp/newest-wins is forbidden.

## Molecular Stack PR ownership

- #38 SPI/state machine
- #39 Apple Container
- #40 E2B
- #41 OpenShell policy
- #42 tmux/PTY
- #43 exchange/repair
- #44 public registry/module/status/release and cross-provider convergence

Leaves own private provider roots and receipts. #44 alone promotes public registry/interface/status/release.

## Prohibitions

No sibling live checkout/node_modules/venv/profile/Keychain/session; no credential in workspace/artifact; no generic shell-over-MCP; no source benchmark/license/provider name as runtime PASS; no local/cloud proxying.
