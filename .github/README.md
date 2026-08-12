# GitHub control plane

`.github/` owns eval-first issue intake, Stack-aware PR review, exact-head CI, and repository-hosted automation metadata. It does not own product/provider logic, credentials, Human Admit, or environment evidence it cannot physically reach.

## State machine

```text
ISSUE_DRAFTED → TASK_PACKET_COMPLETE → BRANCH/PR_PARENT_VERIFIED
  → EXACT_HEAD_CHECKED_OUT → STATIC/DETERMINISTIC_EVALS_RUN
  → ENVIRONMENT_LANE_REPORTED → REVIEW_PENDING
  → HUMAN_MERGED | REJECTED | RECOVERY_ASSIGNED
```

Blocked states: incomplete eval/control/path/state packet, wrong PR base, overlapping lease, out-of-scope path, stale generated artifact, missing prerequisite, ungrounded PASS, secret/log leak, or required check failure.

## Data flow

```text
issue/task packet + exact branch head
  → workflow/job subject
  → bounded artifacts/check results
  → PR evidence table
  → Human review/merge
```

## Boundaries

- `ISSUE_TEMPLATE/` — task/state/data-flow/eval/path/rollback intake.
- `PULL_REQUEST_TEMPLATE.md` — Stack parentage, transition/evidence and merge checklist.
- `workflows/` — exact-head CI; each job proves only its named subject.

## Molecular Stack PR rule

The Phase 3–6 DAG is [`../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md). Provider leaves are path-disjoint siblings; convergence owns shared module/status/release. GitHub workflow success cannot proxy provider/platform/carrier/origin/Human evidence.

Secrets remain host-managed and redacted; external Actions/binaries require exact admission; `NOT_EXERCISED` is reported rather than silently skipped as PASS.
