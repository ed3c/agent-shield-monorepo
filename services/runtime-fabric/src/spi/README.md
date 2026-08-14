# Runtime provider SPI

Issue [#38](https://github.com/ed3c/agent-shield-monorepo/issues/38) owns this provider-neutral boundary.

## Operations

```text
admit → materialize → execute → collect → cleanup
                  ↘ failed-materialization recovery cleanup
```

Every operation receives a bounded context:

```text
stage
AbortSignal
startedAtEpochMs
deadlineEpochMs
cancellationGraceMs
```

Task stages share the request deadline. Cleanup receives its own bounded deadline and still runs after task cancellation. A provider that fails to settle during cancellation grace cannot keep a green cleanup receipt.

## Exact identity

A provider must match the request's:

```text
id
version
source/artifact/binary SHA-256 subject
image/template/profile SHA-256 subject
scope
required capabilities
credential class
```

## Receipt separation

```text
taskStage     = stage that produced the task result
terminalStage = taskStage, unless cleanup changes the final result
taskOutcome   = result before cleanup
outcome       = final result after cleanup
```

Example:

```text
taskStage=COLLECTION
taskOutcome=COMPLETED
cleanup=FAIL
terminalStage=CLEANUP
outcome=FAILED_CLEANUP
```

Workspace cleanup is explicit:

```text
DELETED
PRESERVED_BY_POLICY + content-addressed preservationRef
ABSENT
UNKNOWN
```

## Forbidden coupling

No generic shell, executable/argv, caller host path, mutable checkout, raw secret, provider-private flag or cross-provider source import is part of this SPI. Provider exceptions are reduced to bounded metadata. The fixture suite is in-memory deterministic evidence, not provider execution.
