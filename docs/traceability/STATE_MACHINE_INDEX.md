# Directory, state-machine, issue, eval, and receipt index

This is the bidirectional routing table from repository path and module to current state, data flow, terminal implementation issues, eval families, and eventual evidence owner. It supplements [`TRACEABILITY_INDEX.md`](TRACEABILITY_INDEX.md).

Snapshot basis: `main` `30e020616d8a20847b197f259ff8692a1af46bde` / tree `a2c9fa53a271aaf1c9c7b2fea0cff187e16640a6`.

## Directory → current state → implementation owner

| Directory | Module/state machine | Current state source | Data flow | Terminal issues/evals |
|---|---|---|---|---|
| `docs/`, `third_party/` | provenance/admission | source ledger, decisions, exact dependency records | source → class → decision → requirement/issue | #37 / `SM70.*` |
| `packages/contracts/` | contract lifecycle | `src/index.ts` | closed packet → validation → typed state/receipt | #38 `RT-FND`, #45 `UX-FND`, #54 `SEC-FND`, #65 `INT-FND` |
| `.arena/` | module/composition lifecycle | manifests/consumer requirements | module roots/capabilities → lock → release | convergence #44/#53/#64/#75 |
| `services/document-ingest/` | ingest route | implementation + module/status | input bytes → route → digest/receipt | local text PASS; PDF/cloud future issue |
| `services/research-orchestrator/` | research route | implementation + module/status | workflow/artifact → route receipt → downstream evidence | signed-in provider issue not yet assigned |
| `services/runtime-fabric/` | runtime provider lifecycle | implementation/catalog/module/status | request → provider → artifacts/cleanup | #38–#44 / `RT-*` |
| `apps/web-dashboard/` | dashboard/action projection | app contract/module/status | receipts/artifacts → view → typed action | #45/#46/#47/#53 / `UX-*` |
| `apps/mobile-app/` | mobile build/action/bridge | app contract/module/status | contracts → build/app → action/state receipt | #45/#48/#49/#53 / `UX-*` |
| `services/mobile-automation/` | QA/projection provider | adapter catalog/module/status | target/artifact/flow → provider → media/report/cleanup | #45/#50–#53 / `QA-*`, `UX-CONV` |
| `services/intent-ledger/` | canonical intent/reference risk | implementation/module/status | intent/evidence → digest → reference decision | #54/#55/#56/#58/#64 / `SEC-*` |
| `services/security-boundaries/` | high-risk capability lifecycle | capability catalog/module/status | risk → hardware/signing/ledger/chain receipts | #54–#64 / `SEC-*` |
| future native iOS security root | Secure Enclave/NFC | absent until issue creates admitted path | challenge → native evidence → receipt | #59 `SEC-SE`, #60 `SEC-NFC` |
| future `contracts/` | smart-account validation | absent until issue creates admitted path | exact source → bytecode/audit → operation validation | #62 `SEC-AA`; #63 `SEC-CHAIN` |
| `packages/agent-shield-sdk/` | immutable consumer subject | SDK implementation | repo/commit/tool → validated subject | #65–#75 / `INT-*` |
| bettor bootstrap/verify scripts | consumer initialization | scripts + bettor-consumer module | release → plan/apply/verify → lock | #65–#69/#75 |
| `scripts/git-town/` | Worker/Stack lifecycle | merged Bash + host receipts | task packet → worktree/sync/eval/publish/PR | existing #15/#31; current macOS PASS boundary |
| `.github/` | issue/PR/CI lifecycle | templates/workflows/GitHub PR state | packet → exact-head CI → review | every issue/PR; Human merge |
| `data/status/` | evidence projection | authored status JSON | exact receipts → named state | convergence only |
| `data/releases/` | portable release projection | deterministic generator/JSON | manifests/contracts → release digest | convergence only |
| `types/` | compile-time declaration lifecycle | `.d.ts` + TypeScript checks | compiler gap → minimal declaration → typecheck | implementation issue owning exact use site |

## Current exact evidence matrix

| Subject | State | Receipt/authority |
|---|---|---|
| local UTF-8 ingest | `PASS` | deterministic implementation/test subject |
| local PDF / cloud document provider | `NOT_IMPLEMENTED` | module/status |
| raw-primary research route | `PASS` for route selection | deterministic implementation/test subject |
| signed-in DR/GCR local route | `NOT_EXERCISED` | module/status |
| cloud signed-in GCR | `NOT_IMPLEMENTED` | module/status |
| local disposable worktree runtime | `PASS` | deterministic runtime subject |
| Apple Container/OpenShell-tmux runtime | `NOT_EXERCISED` | provider catalog/status |
| E2B/cloud runtime | `NOT_IMPLEMENTED` | provider catalog/status |
| Expo/Maestro/WDA/scrcpy | `NOT_EXERCISED` | product/automation catalog/status |
| In-App bridge/cloud iOS | `NOT_IMPLEMENTED` | app/automation status |
| reference intent threshold | deterministic PASS/FAIL by fixture | implementation contract |
| OPA/workflow/broker/ledger/native hardware/MPC/account/settlement | `NOT_IMPLEMENTED` | security capability catalog/status |
| live bettor Claude/Codex/Forgejo/browser | `NOT_EXERCISED` | bettor module/status |
| Git Town macOS wrapper live package | relevant GT-LIVE states `PASS` | merged #35/#36 host receipts |
| Git Town Linux environment | `ABSENT` | exact environment not admitted |
| Git Town upstream release attestation | `NOT_EXERCISED` | dependency admission record |
| promoted Git Town Worker image | `NOT_IMPLEMENTED` | dependency admission record |

## Issue → path/state-machine reverse index

### Runtime

| Issue | Branch | Owner | Eval prefix |
|---|---|---|---|
| #38 | `feat/p3-runtime-spi` | shared runtime contracts/SPI | `RT-FND` |
| #39 | `feat/p3-apple-container` | Apple provider | `RT-APPLE` |
| #40 | `feat/p3-e2b-runtime` | E2B provider | `RT-E2B` |
| #41 | `feat/p3-openshell-policy` | policy provider | `RT-OS` |
| #42 | `feat/p3-tmux-pty` | PTY provider | `RT-TMUX` |
| #43 | `feat/p3-hybrid-exchange` | exchange/repair | `RT-XCHG` |
| #44 | `feat/p3-runtime-convergence` | public registry/status/release | `RT-CONV` |

### Product/mobile

| Issue | Branch | Owner | Eval prefix |
|---|---|---|---|
| #45 | `feat/p4-product-contracts` | action/accessibility/projection contracts | `UX-FND` |
| #46 | `feat/p4-dashboard-genui` | dashboard | `UX-WEB` |
| #47 | `feat/p4-terminal-projection` | terminal projection | `UX-TERM` |
| #48 | `feat/p4-expo-mobile` | mobile app | `UX-EXPO` |
| #49 | `feat/p4-in-app-action-bridge` | In-App bridge | `UX-BRIDGE` |
| #50 | `feat/p4-maestro-mcp` | Maestro MCP | `QA-MAESTRO` |
| #51 | `feat/p4-wda-ios-projection` | WDA | `QA-WDA` |
| #52 | `feat/p4-scrcpy-android-projection` | scrcpy | `QA-SCRCPY` |
| #53 | `feat/p4-product-convergence` | aggregate product/status/release | `UX-CONV` |

### Security/testnet

| Issue | Branch | Owner | Eval prefix |
|---|---|---|---|
| #54 | `feat/p5-security-contracts` | security contracts | `SEC-FND` |
| #55 | `feat/p5-opa-policy` | OPA | `SEC-OPA` |
| #56 | `feat/p5-durable-workflow` | durable workflow | `SEC-WF` |
| #57 | `feat/p5-openbao-broker` | secret broker | `SEC-BAO` |
| #58 | `feat/p5-verified-ledger` | ledger/restore | `SEC-LEDGER` |
| #59 | `feat/p5-secure-enclave` | Secure Enclave | `SEC-SE` |
| #60 | `feat/p5-corenfc-challenge` | CoreNFC | `SEC-NFC` |
| #61 | `feat/p5-mpc-tss-provider` | MPC/TSS | `SEC-TSS` |
| #62 | `feat/p5-smart-account-contracts` | contracts | `SEC-AA` |
| #63 | `feat/p5-testnet-submission` | bundler/paymaster/testnet | `SEC-CHAIN` |
| #64 | `feat/p5-security-convergence` | adversarial/recovery aggregate | `SEC-CONV` |

### Bettor integration/release

| Issue | Branch | Owner | Eval prefix |
|---|---|---|---|
| #65 | `feat/p6-consumer-contracts` | consumer/release contracts | `INT-FND` |
| #66 | `feat/p6-module-closure` | module closure/conflicts | `INT-CLOSURE` |
| #67 | `feat/p6-skills-binding` | Skills binding | `INT-SKILL` |
| #68 | `feat/p6-runtime-binding` | runtime binding | `INT-RUNTIME` |
| #69 | `feat/p6-cli-mcp-parity` | CLI/MCP | `INT-MCP` |
| #70 | `feat/p6-claude-canary` | Claude | `INT-CLAUDE` |
| #71 | `feat/p6-codex-canary` | Codex | `INT-CODEX` |
| #72 | `feat/p6-github-origin` | GitHub origin | `INT-GH` |
| #73 | `feat/p6-forgejo-origin` | Forgejo origin | `INT-FJ` |
| #74 | `feat/p6-origin-equivalence` | origin equivalence | `INT-EQ` |
| #75 | `feat/p6-reference-composition-release` | promotion/rollback | `INT-REL` |

## Trace chain required in every convergence report

```text
source/intent/decision IDs
  ↔ directory/module/state-machine owner
  ↔ issue/eval/path lease
  ↔ branch/PR/exact head
  ↔ provider/product/driver/origin receipts
  ↔ status/release/lock digest
  ↔ Human Admit / rollback subject
```

An orphan at any point is incomplete traceability, not a completed phase.
