# Runtime v2 provider SPI

Issue [#93](https://github.com/ed3c/agent-shield-monorepo/issues/93) restores the provider-neutral boundary consumed by the merged tmux provider.

```text
admit → materialize → execute → collect → cleanup
                  ↘ failed-materialization recovery cleanup
```

Each operation receives a lower-case stage, `AbortSignal`, deadline, and cancellation grace. Task stages share one request deadline; cleanup receives an independent bounded deadline and still runs after task cancellation.

Provider admission must match:

```text
id
version
source/artifact/binary SHA-256 subject
image/template/profile SHA-256 subject
scope
capabilities
credential class
```

Before registry resolution or descriptor matching, the executable-request gate rejects every normalized v1 compatibility envelope carrying the legacy version, sentinel subjects, sentinel hashes, or `legacy-runtime-v1-unbound` exclusion. No provider method may observe such a request.

Receipt semantics:

```text
taskStage     = stage that produced the task result
terminalStage = taskStage unless cleanup changes the final result
taskOutcome   = result before cleanup
outcome       = final result after cleanup
```

Receipt validation binds `taskStage` to the exact phase subsequence:

```text
null            []
admission       ADMISSION_CHECKED
materialization ADMISSION_CHECKED → MATERIALIZING → CLEANING
execution       ADMISSION_CHECKED → MATERIALIZING → READY → RUNNING → CLEANING
collection      ADMISSION_CHECKED → MATERIALIZING → READY → RUNNING → COLLECTING → CLEANING
```

Workspace disposition is `DELETED`, `PRESERVED_BY_POLICY` with a content-addressed reference, `ABSENT`, or `UNKNOWN`. An operation that remains unsettled beyond cancellation grace cannot retain a green cleanup receipt.

No generic shell, executable/argv, host `cwd`, raw secret, provider-private flag, mutable checkout, or cross-provider private import is part of this SPI.
