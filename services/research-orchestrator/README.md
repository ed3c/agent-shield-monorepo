# Research orchestrator service contract

## Owner

- Module: `research-orchestrator`
- Interface: `1.1.0`
- Capability: `research.route/v1`
- Requires: `document.ingest/v1`, `bettor.browser-contract/v2`
- Runtime declaration: local `SUPPORTED`; cloud `PARTIAL`
- External exposure: denied; secrets: none

## Purpose

Select an explicit research route and preserve trust boundaries between raw-primary evidence, optional browser stages, and signed-in subscription workflows. It routes requests; it does not prove the downstream transport ran.

## Inputs

A typed `BrowserWorkflowRequest` containing workflow, environment, and immutable input artifact reference. Supported workflow identities currently include `external-verify`, `dr-research-loop`, and the Gemini conversation research route.

## Outputs

`agent-shield/research-route/v1` receipt with module/interface identity, selected evidence state, input artifact reference, and route detail.

## Current evidence

| Workflow/route | State |
|---|---|
| `external-verify` raw-primary selection | deterministic `PASS` for routing logic |
| DR deterministic core | contract present |
| DR signed-in Stage 1 | `NOT_EXERCISED` |
| local GCR signed-in browser | `NOT_EXERCISED` |
| cloud signed-in GCR broker | `NOT_IMPLEMENTED` |
| browser body isolation/file-only extraction | contract only until live receipt |

## Non-goals and prohibitions

- Routing `PASS` is not source-verification or browser-execution `PASS`.
- Do not put signed-in browser bodies directly into the main Agent context; use bounded file artifacts and metadata receipts.
- Do not let `agy`, bare Codex CLI, or another actor inherit a browser session it does not own.
- Do not downgrade raw-primary verification to a browser screenshot when API/raw bytes are available.
- No profile, cookie, OAuth token, or subscription session enters Git or cross-environment sync.

## Required eval families before expansion

- explicit route selection and unsupported-workflow controls;
- raw-primary-before-browser priority mutation;
- file-only body and metadata-size enforcement;
- absent/expired session and wrong actor/surface/transport controls;
- local/cloud route independence;
- source citation, artifact digest, browser cleanup, and session-residue receipts.

Issue #19 owns this README only. Live research transports remain environment-owned.