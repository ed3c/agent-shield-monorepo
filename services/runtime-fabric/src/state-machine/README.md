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

Execution that does not collect artifacts still enters `CLEANING`; a successful task cannot skip collection or cleanup. Materialization failure is terminal only when no owned workspace was transferred to the orchestrator.

## Deterministic controls

`selftest.ts` drives the same public contracts/SPI and proves:

- illegal transition skips turn red;
- missing limits and nested generic shell controls are rejected;
- unavailable states do not become `PASS`;
- request bytes are frozen and request digests are canonical;
- stale receipts, missing capabilities, undeclared secret references, non-portable workspace identities, out-of-scope writes, missing artifacts, oversized output, inconsistent timeout evidence, and false cleanup success turn red;
- task failure and cleanup failure remain separate receipt lanes.

The root `scripts/selftest.ts` invokes this suite in exact-head CI. It uses no selected provider, network, device, cloud runtime, or external executable.
