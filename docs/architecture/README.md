# Architecture documentation

## Owner and authority

This directory owns low-compression architecture, phase, data-flow, and environment-mode documents. Root `ARCHITECTURE.md` remains the current engineering contract; files here expand it or preserve source-derived proposals without changing evidence state.

## Contents

- `IMPLEMENTATION_PHASES.md` — current staged implementation/evidence boundary.
- `SOURCE_DERIVED_ARCHITECTURE.md` — `S-001` proposal mapped to repository contracts and required evidence.
- `PLANNED_REPOSITORY_TREE.md` — current paths versus planned capability slots.
- `DATA_FLOWS.md` — typed packet/artifact/receipt and human-owned edges.
- `ENVIRONMENT_MODES.md` — local, cloud-independent, and hybrid repair contracts.

## Rules

1. State whether a claim is source-derived, repository-decided, inferred, or executed evidence.
2. Keep planned providers and directories separate from current implementation.
3. Every cross-module edge names a typed contract, artifact, receipt, or human decision.
4. Package presence and diagrams never produce `PASS`.
5. Source-code repair uses Git ancestry and content identity, never `newest` or unconditional `prefer-cloud`.
6. Provider-specific versions, licenses, performance, price, security, platform, and service terms require current exact evidence.

## Change ownership

Issue #17 owns the source-derived architecture and licensing expansion. New implementation roots require their own issue, module/path ownership, evals, and nearest README.
