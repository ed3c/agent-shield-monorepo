# tmux/PTY lifecycle adapter

Issue [#42](https://github.com/ed3c/agent-shield-monorepo/issues/42) owns this path-disjoint Bun + TypeScript adapter.

## Upstream subject

```text
repository:       https://github.com/tmux/tmux
version/tag:      3.7b
annotated tag:    3423e0dcc6ec1069d575cd104ed1c005e3e3943f
source commit:    e802909de06012a4df6209d55e86487c56223163
release archive:  sha256:87f2e99e3b685973f2ca002ffd6ed7e51a5744f7009daae5a15670b6d532db96
license:          ISC
signature state:  UNVERIFIED
artifact state:   NOT_EXERCISED
```

The official source describes tmux as a terminal multiplexer that creates and controls multiple terminals, may detach while continuing in the background, and may later reattach. That behavior motivates the adapter but does not by itself prove an admitted binary or host execution.

## Public responsibility

```text
closed RuntimeRequest
  + logical workspace identity
  + immutable task runner profile/envelope
  + opaque control capability
  + bounded stream/task/idle limits
  + optional public OpenShell policy-envelope digest
  → deterministic tmux native argv plan
  → namespaced socket/session
  → attach ↔ detach without changing task lifetime
  → bounded digest-checked PTY frames
  → process/session termination and cleanup receipt
```

The request cannot supply a shell, command, argv, executable, host `cwd`, environment value, public port, or raw token. The native plan always invokes the fixed sandbox task runner:

```text
/app/bin/agent-shield-task-runner
```

Task identity enters as immutable IDs and SHA-256 digests, not as command text.

## Session State Machine

```text
UNRESOLVED
  → HOST_CHECKED
  → SESSION_CREATING
  → SESSION_READY
  → DETACHED ↔ ATTACHED
  → STOPPING
  → COLLECTING
  → TERMINATED
```

Blocked terminals:

```text
ABSENT_TMUX
FAILED_CREATE
STREAM_LIMIT
TIMED_OUT
CANCELLED
PROCESS_FAILED
FAILED_TERMINATE
FAILED_CLEANUP
```

Attach/capture/detach/stop denial is an operation receipt (`AUTH_REFUSED`) and does not terminate or mutate the running session.

## Identity and cleanup

A session has one deterministic socket/session name, logical workspace identity, pane ID, logical process-group ID, and generation token. Stop and cleanup must observe the same generation token. A changed token is treated as PID/PGID reuse: no signal is sent and the result becomes `FAILED_TERMINATE`.

```text
task result
  ≠ transport attach state
  ≠ stream bound state
  ≠ termination result
  ≠ cleanup result
```

Detaching a transport never means task completion. Cleanup `PASS` requires process-group and session checks with zero residue. Retaining a failed session is not admitted by this request contract and requires a separate Human decision.

## Deterministic Harness

`tmux.test.ts` exercises:

- detach/reconnect to the same session while the task continues;
- two disjoint session/socket/process identities;
- opaque capability enforcement and expiration;
- frame digest, sequence, frame-size, total-byte, frame-count, idle, and task-time bounds;
- process failure, cancellation, timeout, termination failure, cleanup residue, and stale generation-token refusal;
- fixed native argv without a shell;
- rejection of command input, file-backed control capability, session retention widening, host-path fields, inherited objects, and upstream artifact self-promotion.

## Stack and evidence boundary

```text
main + admitted #38/#43/#41
└── feat/p3-tmux-pty                                #42
    └── Phase 3 convergence from exact merged main #44
```

The deterministic driver proves adapter semantics only. It does not execute the tmux release archive, allocate a PTY, expose a remote terminal, run an Agent CLI, prove OpenShell enforcement, or establish local/cloud availability. Exact artifact acquisition, build dependencies, live process-tree cleanup, performance, remote transport, and production remain `NOT_EXERCISED` until separately receipted.
