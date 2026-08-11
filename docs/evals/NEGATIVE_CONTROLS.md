# Negative, mutation, absence, and cleanup controls

A green result is valuable only when the same Harness can detect a meaningful defect in the same subject.

## Control classes

### Contract rejection

Plant malformed, missing, duplicate, out-of-range, stale, or additional fields. The public boundary must reject them with the named state/exit before side effects.

### Mutation

Disable or invert one load-bearing guard: digest check, owner map, authorization rule, exposure policy, cleanup assertion, exact-version pin, safe-push guard, or status mapping. The eval must turn red for the intended reason.

### Hollow artifact

Provide a structurally present but semantically empty output, such as an empty graph, receipt without a subject, generated repo without required behavior, or release manifest without closure. Presence alone must not pass.

### Absence

Remove a required tool, input, ref, provider, credential/session, device, browser profile, or downstream checkout. The system reports `ABSENT`, `NOT_IMPLEMENTED`, or `NOT_EXERCISED` according to contract, never `PASS`.

### Independent public control

Run from the public CLI/API/MCP/adapter and observe touched paths, exits, artifacts, network, secrets, and cleanup. Do not call the same private helper that produced the proof.

### Concurrency and stale-subject control

Change a parent/dependency, race a second writer, hold a lease, move the remote branch, or replay an older release. The Harness must detect stale ancestry, unsafe overlap, or safe-push disagreement.

### Cleanup/residue

Plant or detect a leaked worktree, process, session, lock, temporary file, cloud runtime, browser tab/profile, device lease, artifact, or credential-bearing log. Task behavior and cleanup verdict remain separate.

## Quality requirements

A negative control must:

- target the same public promise as the positive assertion;
- be minimal and attributable;
- fail for a distinguishable reason;
- leave the source subject recoverable;
- avoid real secrets, irreversible production mutation, custody, or permission widening;
- record whether the control itself ran.

## Forbidden shortcuts

- asserting that an invalid fixture “would fail” without running it;
- using a syntax error when the protected property is authorization or semantics;
- treating tool absence as a successful denial;
- deleting the entire implementation when the claim concerns one guard;
- reusing another module's red as evidence for this module;
- accepting cleanup residue because the main task returned zero;
- auto-resolving source conflicts by timestamp, `newest`, or unconditional `prefer-cloud`.

## Example mapping

| Subject | Positive | Control that can disagree |
|---|---|---|
| document ingest | valid UTF-8 text returns digest-bound receipt | malformed media declaration, missing file, hollow parser output |
| Git Town sync | clean stack rebases with exact parent | dirty worktree, stale parent, duplicate lease, semantic conflict, unsafe remote head |
| runtime provider | fresh isolated run returns artifact and cleanup | provider absent, network escape, secret exposure, timeout, leaked workspace |
| mobile adapter | bounded action reaches expected app state | unknown action, missing auth/session/device, missing accessibility ID, residue |
| security boundary | invalid intent is refused before side effect | missing evidence, duplicate refs, forged/expired challenge, unimplemented provider |

Issue #22 eval `E50.2` requires each load-bearing gate to name at least one such control.
