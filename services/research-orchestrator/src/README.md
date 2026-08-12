# Research-orchestrator source boundary

This leaf inherits [`../README.md`](../README.md), root `AGENTS.md`, and module `research-orchestrator`. It owns deterministic route selection for `research.route/v1`, not browser execution or truth by itself.

Inputs are typed `BrowserWorkflowRequest` values and content-addressed input references. Outputs are `ModuleReceipt` route decisions. `external-verify` prefers raw/static primary evidence; signed-in browser routes remain separate adapters with explicit evidence class.

Do not import browser profiles, cookies, owner live checkouts, or another module's private driver. A selected route is not a completed research run. Cloud signed-in routes remain `NOT_IMPLEMENTED`; unrun local lanes remain `NOT_EXERCISED`. Issue #19 / evals `E30.1`–`E30.4` govern this README.
