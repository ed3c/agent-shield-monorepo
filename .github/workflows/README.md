# GitHub workflow boundary

Workflows execute deterministic or explicitly environment-scoped eval lanes against an exact commit. They do not turn an unavailable host/provider into PASS.

## Job state machine

```text
TRIGGERED → EXACT_HEAD_CHECKED_OUT → TOOLCHAIN/INPUTS_VERIFIED
  → SUBJECT_EVALS_RUN → NEGATIVE_CONTROLS_RUN → ARTIFACTS_CAPTURED
  → CLEANUP_CHECKED → RESULT_REPORTED
```

Terminal states: `PASS`, `FAIL`, `ABSENT`, `NOT_EXERCISED`, timeout, cancellation, artifact failure, or cleanup failure for the named subject.

## Data flow

```text
workflow YAML + exact repository bytes + host-owned secrets
  → named command/eval
  → bounded logs/artifacts/digests
  → GitHub check result and PR evidence
```

Least privilege, pinned Actions/tools, redaction, artifact retention, and cleanup are mandatory. A macOS result cannot proxy Linux/device/provider; a static check cannot proxy live Git Town/provider execution. The molecular issue/Stack graph is [`../../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](../../docs/implementation/STACKED_IMPLEMENTATION_PLAN.md).
