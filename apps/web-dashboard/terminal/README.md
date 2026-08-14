# Terminal projection boundary

Issue [#47](https://github.com/ed3c/agent-shield-monorepo/issues/47) owns this leaf. It projects an already-authorized task session through the public PTY capability from [#42](https://github.com/ed3c/agent-shield-monorepo/issues/42); it does not import tmux provider private source and does not own dashboard or aggregate state.

## Closed by shape, not by filtering

A session is named by an immutable four-part subject — task, session, commit and content-addressed workspace identity. **There is no attach-by-name field anywhere in this contract**, because a name is exactly what lets a caller land on a newer session and be told nothing. Same names with a different commit or workspace resolves to `STALE_SUBJECT`, never a silent attach.

A caller may send one of four enumerated control actions with numeric arguments only:

```text
resize   scroll   detach   request-stop
```

There is no command, argv, `cwd`, environment, signal or private-flag field, so a generic shell cannot be expressed in the type at all. `request-stop` is routed to the owning runtime's port; this module never signals a process.

## Authorization

`terminal.read` and `terminal.control` are separate scopes. Asking for more than the operator holds is `AUTH_REFUSED`, not a quiet downgrade to read — a downgrade would leave the caller believing it has control it was never granted. Control without read is refused too.

## Bounds and truncation

Frame size, frame count, total bytes, frame rate and session duration are all bounded, and truncation is a recorded field rather than a silent behaviour. A projection that dropped bytes says so in its detail line; a hidden truncation would be indistinguishable from complete output.

## State fidelity

```text
UNBOUND → SUBJECT_RESOLVED → AUTHENTICATED → CONNECTING → ATTACHED
  ↔ DISCONNECTED
  → DRAINING → CLOSED
```

`DISCONNECTED` is the one outcome a trace may pass through and resume from, and resuming must go back through `CONNECTING`. A socket close is never a completion: a closed projection cannot report a running task, and a failed task cannot be projected as a clean close.

The transition table is the single enforcement point for "a lifecycle cannot continue past an outcome". The agreement between it and the outcome set is asserted at module load, so a terminal state that gains a successor fails on import rather than quietly widening what a trace may claim.

## Cleanup

Closing the projection ends only its own subscriptions and reports any that stayed open, so an orphan is visible rather than assumed absent. Task termination goes through the runtime port with the exact session subject attached.

## Evidence boundary

This leaf proves projection behaviour only. tmux provider internals, runtime isolation, Agent correctness, product review, the signed-in browser and production ingress are not proven here, and `terminalProjectionState` carries no `PASS` — enforced by the compiler rather than a runtime scan, since the object is `as const`.

## Human boundary

Public exposure, remote control, retention and task-termination policy require Human Admit. Rollback is the exact parent.
