# tmux and PTY runtime provider

Issue #42 owns the local resumable terminal-session leaf after Runtime SPI foundation #38. The public contract uses logical workload and terminal-profile identities; it does not expose arbitrary shell, command, argv, executable, caller-selected socket, cwd, or host path.

## State Machine responsibility

```text
TMUX_PTY_SUBJECT_UNRESOLVED
  → TMUX_BINARY_LICENSE_HARNESS_ADMISSION_CHECKED
  → TERMINAL_PROFILE_PINNED
  → LOGICAL_ENTRYPOINT_ADMITTED
  → RUNTIME_REQUEST_ADMITTED
  → SESSION_MATERIALIZED
  → PTY_ATTACHED
  → WORKLOAD_EXECUTED
  → TRANSCRIPT_AND_ARTIFACTS_COLLECTED
  → SESSION_TERMINATED
  → CLEANUP_VERIFIED
  → PROVIDER_RECEIPT_READY
```

A reconnectable session is a bounded provider capability, not permission to leave a process or socket behind. Cleanup failure remains separate from task success.

## Data flow

```text
exact tmux source/binary/license + PTY harness admission
  + immutable terminal profile and logical entrypoint
  + closed RuntimeRequest
  → TmuxPtySessionPlan
  → Runtime SPI backend
  → tmux-pty-admission artifact
  + tmux-pty-session-plan artifact
  + transcript/backend artifacts
  → RuntimeReceipt
```

Portable receipts contain logical session/workspace identities and content digests, never host socket paths, TTY device paths, process IDs, environment values, or unbounded transcript bytes.

## Evidence boundary

Deterministic Bun tests use an in-memory backend. They prove adapter validation, subject identity, transcript/artifact limits, session-state separation, and cleanup semantics only. They do not spawn tmux, allocate a PTY, verify terminal emulation, reconnect to a real session, prove process-group cleanup, or establish production availability.

## Stacked PR position

```text
main after #38
└── issue #42 / tmux-PTY provider leaf

siblings: #39 Apple Container, #40 E2B, #41 OpenShell, #43 hybrid exchange
convergence: #44
```

The leaf owns only its provider root and uniquely named CI workflow. Shared registry/status/release and aggregate evidence remain convergence-owned.
