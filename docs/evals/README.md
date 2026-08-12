# Evaluation contracts

## Purpose and authority

This directory owns the reusable definition of an Agent Shield eval. Issues define task-specific eval instances before implementation; PRs report exact-subject results. Root `AGENTS.md`, the source/traceability index, and the nearest directory README determine what the eval is allowed to claim.

## Canonical documents

- [`EVAL_SCHEMA.md`](EVAL_SCHEMA.md) — required fields and review contract.
- [`EVIDENCE_STATES.md`](EVIDENCE_STATES.md) — evidence levels and non-substitutability.
- [`NEGATIVE_CONTROLS.md`](NEGATIVE_CONTROLS.md) — planted defects, absence, mutation, and cleanup controls.
- [`EVAL_CATALOG.md`](EVAL_CATALOG.md) — stable reusable eval families and examples.
- [`../harness/README.md`](../harness/README.md) — execution lifecycle and ownership.

## Core rule

An eval is complete only when it can disagree with the implementation. It names a fixed subject, preconditions, action, observable, negative control, artifact, state/exit semantics, exclusions, and owner. A checklist without a failure-producing control is guidance, not an eval.

## State language

`PASS`, `FAIL`, `ABSENT`, `NOT_IMPLEMENTED`, and `NOT_EXERCISED` are distinct. A document, package, skipped provider, another module's receipt, or a successful different environment cannot proxy for the named subject.

Issue #22 / evals `E50.1`–`E50.5` govern this directory. This documentation does not implement a Bun enforcement gate; mechanical enforcement remains a later issue.
