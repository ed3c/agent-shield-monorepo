# Runtime provider SPI

This directory implements the provider-neutral execution boundary admitted by issue [#38](https://github.com/ed3c/agent-shield-monorepo/issues/38).

## Provider contract

A provider supplies five bounded operations:

```text
admit → materialize → execute → collect → cleanup
```

The orchestrator validates and freezes the request before handing it to a provider. It independently checks descriptor/capability/credential compatibility, portable workspace identity, exit consistency, output bytes, requested artifacts, mutation roots, and cleanup receipts.

## Receipt separation

`taskOutcome` records the operation result before cleanup. `outcome` records the overall terminal state. A cleanup failure therefore cannot erase whether execution completed, failed, timed out, or was cancelled.

```text
taskOutcome=COMPLETED + cleanup=FAIL
  → outcome=FAILED_CLEANUP
```

Unknown, absent, unimplemented, policy-refused, not-exercised, admission, execution, artifact, timeout, cancellation, and cleanup states remain distinct.

## Boundaries

- No generic shell, arbitrary command, host `cwd`, environment value, or provider-private flag is part of the SPI.
- Secrets are logical broker references only.
- Artifacts are content-addressed metadata; temporary host paths are not portable outputs.
- Provider exceptions are converted to bounded generic details so raw provider errors cannot leak into receipts.
- The in-memory fixture in `../state-machine/selftest.ts` is deterministic contract evidence only.

Issues #39–#43 own disjoint provider/repair roots. They may consume this SPI but may not edit one another, the aggregate provider registry, module/status/release data, or convergence-owned evidence.
