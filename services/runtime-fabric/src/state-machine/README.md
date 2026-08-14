# Runtime lifecycle state machine

Issue [#38](https://github.com/ed3c/agent-shield-monorepo/issues/38) owns the shared lifecycle and deterministic disagreement controls.

```text
UNRESOLVED
  → RESOLVED
  → ADMISSION_CHECKED
  → MATERIALIZING
  → READY
  → RUNNING
  → COLLECTING
  → CLEANING
  → COMPLETED
```

Named terminal states:

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

Materialization failure, timeout or cancellation always enters recovery cleanup. Execution and collection retain different timeout semantics: an execution timeout marks the execution exit, while a collection timeout preserves the successful execution exit. Cleanup failure never erases the earlier task result.

## Deterministic controls

The exact-head suite exercises:

- illegal transition skips;
- unavailable-state separation;
- own-key/closed-schema and prototype controls;
- provider version, provider subject and environment subject drift;
- generic command aliases and host/path-like inputs;
- canonical digest and frozen request/receipt bytes;
- output, artifact, mutation-root and stale-receipt controls;
- pre-cancelled requests;
- cooperative admission/materialization/execution/collection/cleanup interruption;
- uncooperative operation grace expiry;
- failed-materialization recovery cleanup;
- workspace deletion/preservation/unknown-state rules;
- independent task and cleanup outcomes.

The root `scripts/selftest.ts` invokes this suite in Bun CI. It performs no provider allocation, network call, subprocess spawn, device operation or credential access.
