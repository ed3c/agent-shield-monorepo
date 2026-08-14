# OpenBao secret-broker boundary

Issue [#57](https://github.com/ed3c/agent-shield-monorepo/issues/57) owns this leaf. Cryptographic, device and workflow consumers use opaque refs and the public operations here; they never see a value. No crypto or device provider internals and no convergence path belong to this directory.

## The value has no way out

`SealedSecret` is the one type in this adapter that ever holds a secret. It cannot be serialized, printed, interpolated or spread: `toJSON`, `toString`, `Symbol.toPrimitive` and the runtime inspect hook all return a redaction marker, the value lives in a private field, and the instance is frozen. A consumer runs a callback under `use`, and the value exists only for that call.

This is the difference between "we remembered to redact the logs" and "there are no bytes to get out", and only the second survives a call site written next year.

SEC-BAO-002 is exercised with a planted canary that really does reach the consumer, then scanned across every escape route — `JSON.stringify` of the result and of the carrier, `String`, template interpolation, concatenation, explicit `toString()`, array join, the inspect hook, `Object.entries`, `Object.values`, `getOwnPropertyNames`, spread, the audit receipt, the audit log and an error message. The suite also asserts the scan **can** fail, by running it against a deliberately leaky object: a canary scan that cannot detect a leak proves nothing.

## One rule for paths

A path is a bounded sequence of lowercase segments and nothing else. Every wildcard, glob class and traversal fails that by construction, so there is no separate wildcard denylist — one would be dominated by the same regex and could never fire.

A grant is exact in four dimensions at once: path, operation, workflow and policy epoch. A lease minted for another workflow, actor or path is refused even when the transport hands one back, so a confused-deputy substitution has nowhere to land.

## Failure is never a value

Every failure returns `sealed: null`. There is no path on which a caller receives a value it was not granted, and therefore no fallback to a local plaintext or an environment variable to reach for. Seven failure kinds are separately pinned: absent server, absent auth, refused lease, expired lease, operation failure, audit failure and revocation failure.

An unwritten audit is not a successful operation — and not a quietly-refused request either. Both write sites are controlled: a refusal whose audit cannot be written reports `AUDIT_FAILED`, not `POLICY_REFUSED`.

## Audit identity

The receipt binds server version, ref kind and ID, path, operation, workflow, actor, policy epoch, lease and result, plus how many bytes were handled — never which bytes. It carries a digest over its own content, so a forged result, actor, epoch, lease or server version fails verification. Refusals are audited too.

## Evidence boundary

`FakeBroker` is a deterministic in-memory fixture. No OpenBao server, token, unseal ceremony or network call has been exercised; `openBaoProviderState` carries no `PASS` and the compiler proves it. Recovery is a separate Human ceremony.
