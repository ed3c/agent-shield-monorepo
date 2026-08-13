# Runtime lifecycle state machine

Issue [#38](https://github.com/ed3c/agent-shield-monorepo/issues/38) owns the provider-neutral lifecycle and deterministic disagreement controls.

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

Materialization, execution, and collection failures enter `CLEANING`. Admission and pre-provider availability states have no workspace and no cleanup evidence. `taskStage` identifies the stage that produced the task result; `terminalStage` becomes `cleanup` only when cleanup changes the overall result.

## Deterministic controls

The selftest suite drives the public contract and SPI and verifies:

- illegal transition skips turn red;
- exact provider/environment subject drift is rejected;
- missing limits, generic controls, inherited/prototype keys, Windows/POSIX host paths, mutable refs, and undeclared secret delivery are rejected;
- request and receipt bytes are recursively frozen and digests are canonical;
- missing provider/capability, stale receipts, non-portable workspaces, out-of-scope writes, missing artifacts, oversized output, and false cleanup PASS turn red;
- materialization recovery cleanup runs before ownership transfer;
- actual hung admission/materialization/execution/collection/cleanup Promises produce bounded stage-aware outcomes;
- caller cancellation is distinct from timeout and still runs cleanup after materialization;
- workspace preservation requires explicit policy and a content-addressed reference;
- task failure and cleanup failure remain independent receipt lanes.

`timeout-selftest.ts` uses short in-memory timers and AbortSignals. It launches no process, network, provider, device, cloud allocation, or host session. Root `scripts/selftest.ts` invokes the suite in exact-head Bun CI.
