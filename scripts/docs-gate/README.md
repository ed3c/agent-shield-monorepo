# Documentation governance gate

Issue [#32](https://github.com/ed3c/agent-shield-monorepo/issues/32) owns this validator. It turns the repository's documentation and stacked-PR contracts into deterministic checks without becoming a second source of truth.

## It reads a model, not the repository

Every gate is a pure function from an in-memory `DocsModel` to findings. There is no clock, no network, no filesystem and no process, so DOC-GATE-007's byte stability and DOC-GATE-010's freedom from residue are properties of the signature rather than promises. Ingesting the real repository into that model is a separate lane, and `docsGateState.repositoryIngest` says `NOT_IMPLEMENTED` until it exists.

The validator writes nothing. `assertScope` compares a changed-path list against the two paths this tool owns, so DOC-GATE-008 is a comparison rather than a claim.

## The GitHub metadata lane stays separate

When it is not selected the receipt says `NOT_EXERCISED`; when it is selected and unreachable it says `ABSENT`. Neither folds into the deterministic result, in either direction — an unreachable lane does not fail the run, and an unrun lane does not pass it.

## The mutation suite is the point

DOC-GATE-009 asks for planted defects, and it is the reason to trust anything else here. Twenty-four defects are planted in turn and each must be caught **by the gate that owns it** — not merely detected by something.

Nine of those are the defects the issue names. The other fifteen exist because the validator has more rules than that list, and **a rule with no planted defect is a rule nobody has shown can fail**. They were found by disabling each rule in turn and watching the suite stay green:

```text
one document canonical for two topics      a document projected from itself
a projection that does not exist           an exclusion naming no reviewer
a duplicate eval ID                        a claim with a state but no basis
a PR naming an unadmitted issue            …
```

Two of them needed the fixture reshaped so only the rule under test could fire — a self-projection also trips the "projection does not link its SSOT" rule unless the SSOT references itself, and a stale exclusion also trips the missing-reviewer rule unless the reviewer is present.

## Gates

```text
DOC-GATE-001  every reference resolves; no ID declared twice
DOC-GATE-002  one SSOT per topic; projections link to it; no self-projection
DOC-GATE-003  nearest README or a reviewed, current exclusion; one owner per path
DOC-GATE-004  eval packets carry all eleven fields, including a negative control
DOC-GATE-005  only an executed receipt carries a lane to PASS; five states stay distinct
DOC-GATE-006  PR base, issue and branch match the admitted stack; leases do not overlap
DOC-GATE-007  generated artifacts match their recomputed bytes
```

## Evidence boundary

`docsGateState` carries no `PASS` and the compiler proves it. The validator proves its own rules against a supplied model; it does not prove the repository is well-governed until the ingest lane exists and runs against real bytes.
