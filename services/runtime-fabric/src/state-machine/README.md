# Runtime v2 lifecycle and deterministic controls

```text
UNRESOLVED → RESOLVED → ADMISSION_CHECKED → MATERIALIZING → READY
  → RUNNING → COLLECTING → CLEANING → COMPLETED
```

Named terminals remain distinct:

```text
ABSENT
NOT_IMPLEMENTED
NOT_EXERCISED
REFUSED_POLICY
FAILED_ADMISSION
FAILED_MATERIALIZATION
FAILED_EXECUTION
FAILED_ARTIFACT
FAILED_CLEANUP
CANCELLED
TIMED_OUT
```

Materialization failure, timeout, or cancellation enters recovery cleanup. Execution timeout marks execution exit evidence. Collection timeout preserves the successful execution exit. Cleanup failure preserves the earlier `taskOutcome` and changes only the overall `outcome`.

The deterministic suite covers strict v2 execution, non-executable v1 envelope migration, exact provider/environment subjects, closed/prototype controls, mutable request/receipt refusal, output/artifact/mutation limits, cooperative and uncooperative interruption, recovery cleanup, workspace preservation, false cleanup PASS, stale receipts, and independent task/cleanup outcomes.

The suite performs no provider allocation, process spawn, network call, device operation, credential access, or live evidence promotion.
