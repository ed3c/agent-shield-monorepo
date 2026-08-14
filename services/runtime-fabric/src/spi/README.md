# Runtime v2 provider SPI

Issue [#93](https://github.com/ed3c/agent-shield-monorepo/issues/93) restores the provider-neutral boundary consumed by the merged tmux provider.

```text
admit → materialize → execute → collect → cleanup
                  ↘ failed-materialization recovery cleanup
```

Each operation receives a lower-case stage, `AbortSignal`, epoch deadline, and cancellation grace. Task stages share one host-owned monotonic budget; cleanup receives an independent bounded deadline and still runs after task cancellation. Public run options expose only caller cancellation, not a replaceable clock.

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
capabilities  = exact exercised request set
```

Receipt validation binds `taskStage` to the exact phase subsequence:

```text
null            []
admission       ADMISSION_CHECKED
materialization ADMISSION_CHECKED → MATERIALIZING → CLEANING
execution       ADMISSION_CHECKED → MATERIALIZING → READY → RUNNING → CLEANING
collection      ADMISSION_CHECKED → MATERIALIZING → READY → RUNNING → COLLECTING → CLEANING
```

A provider reported as `version=unresolved` can emit only the exact registry-miss trace `UNRESOLVED → RESOLVED → ABSENT`, with no provider subject, environment subject, capability, workspace, admission, or cleanup evidence.

Workspace disposition is `DELETED`, `PRESERVED_BY_POLICY` with a content-addressed reference, `ABSENT`, or `UNKNOWN`. Preservation requires a `preserve-on-failure` request and a non-completed task even when cleanup itself fails. An operation that remains unsettled beyond cancellation grace cannot retain a green cleanup receipt. Cancellation grace cannot exceed either the task or cleanup timeout.

Runtime requests and collection receipts reject `.git`, `.env*`, `.ssh`, credential/secret/session path classes, browser profiles, keychains, and common private-key file suffixes. Workload JSON is bounded by depth, per-container entries, total input bytes, and an aggregate traversal budget.

Exact network allowlists reject obvious loopback, unspecified, link-local, cloud-metadata, container-host, Kubernetes-control, reserved, and malformed numeric targets. Live providers still own DNS resolution and resolved-IP enforcement; this deterministic contract does not claim a live firewall result.

The dedicated pull-request workflow uses SHA-pinned checkout/Bun setup actions and a positive path allowlist. It exercises allowed and forbidden path fixtures before compiling and running the exact-head Bun controls.

No generic shell, executable/argv, host `cwd`, caller clock, raw secret, provider-private flag, mutable checkout, sensitive workspace path, capability overclaim, or cross-provider private import is part of this SPI.
