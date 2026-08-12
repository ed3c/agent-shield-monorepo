# State machines — standard route

The canonical detailed state-machine and data-flow document is [`../state-machines/README.md`](../state-machines/README.md). This route summarizes the top-level owners:

| Plane | Owner | Main flow |
|---|---|---|
| Source/admission | `docs/`, `third_party/` | source → classification → decision → requirement/eval |
| Typed contracts | `packages/contracts/` | closed request → validation → typed state/receipt |
| Document/research | service modules | bytes/workflow → route → artifact/evidence receipt |
| Runtime fabric | `services/runtime-fabric/` | request → provider lifecycle → artifacts → cleanup |
| Product adapters | `apps/`, mobile automation | typed action → observable product/provider state |
| Security boundaries | intent/security services | intent → risk route → approval/signing/ledger/submission |
| Bettor consumer | SDK/bootstrap/bindings | immutable release → closures/surfaces → canaries/origins → Human Admit |
| Git management | `scripts/git-town/` | task packet → worktree/lease → sync/eval/publish → PR/Human merge |

Machine truth remains in contracts, manifests, status ledgers, scripts, tests, and receipts. Read the canonical document for transitions and terminal states.
