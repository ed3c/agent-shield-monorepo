# research-orchestrator module

- Interface: `1.1.0`
- Root: `services/research-orchestrator`
- Provides: `research.route/v1`
- Requires: `document.ingest/v1`, `bettor.browser-contract/v2`
- Runtime: local `SUPPORTED`; cloud `PARTIAL`
- External exposure: false; secrets: none

The current deterministic subject selects the raw-primary `external-verify` route. DR signed-in Stage 1 and local GCR browser work remain `NOT_EXERCISED`; the cloud signed-in GCR broker is `NOT_IMPLEMENTED`.

Routing logic never proves browser execution, source truth, or subscription availability. See the service README for file-only body and session boundaries.