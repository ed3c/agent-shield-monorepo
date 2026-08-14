# Origin equivalence comparator

Issue #74 (Phase 6 / INT-90). Compares an independently obtained GitHub distribution-origin
receipt (#72) and Forgejo authoring-origin receipt (#73) for the same logical release, and
reports the **strongest level the evidence actually supports** — never a stronger one.

## No boundary, and therefore no fake

Unlike its two inputs this leaf has no transport, no network and no credential: it is pure
computation over two receipts and two module closures. There is nothing to stub, so there is no
`fake-*.ts` here — and the eval suite builds its fixtures by **running the two real verifiers**
rather than hand-writing receipts, so a field that drifts out of a producer is caught here.

## `achievedLevel` is computed, never assigned from the request

INT-EQ-007's control is "upgrade same-tree to exact-commit". The mechanism is that
`achievedLevel` is derived from the receipts:

```text
same commit && same tree && same manifest  → exact-commit
             same tree && same manifest    → same-tree
                          same manifest    → same-release-manifest
                          none of these    → null, NOT_EQUIVALENT
```

`requestedLevel` never appears on the right-hand side. Asking for a stronger level than the
evidence supports is refused rather than answered with the weaker one — the caller asked a
specific question, and the honest reply to "are these the same commit" is not "they have the
same tree". The receipt keeps both fields so the refusal is legible.

**Same tree with different release manifests is a contradiction, not a weaker match.** One of
the two origins is reporting a manifest its own tree does not produce, so the verdict falls
through to `null`. The plant check found that guard dead until a fixture existed where the tree
and the manifest disagree.

## Independent arrivals are checked structurally

INT-EQ-001's control is "duplicate one receipt with the origin label changed". The answer is not
a heuristic: the two verifiers emit **different schemas and different field sets**.

| | GitHub receipt | Forgejo receipt |
|---|---|---|
| schema | `distribution-origin-receipt/v1` | `authoring-origin-receipt/v1` |
| carries | `refKind`, `freshClone` | `credentialSource`, `readOnly` |

A relabelled copy is missing every field its claimed origin would have produced. Each rule has a
control that only it can satisfy — the plant check found the schema rule and the origin-label
rule catching each other's fixtures until the fixtures changed exactly one field at a time.

Each arrival is checked **in its own lifecycle stage**. Running both up front would make
`FORGEJO_ABSENT` reachable before the GitHub receipt had been looked at, and the state machine
says otherwise.

## Freshness belongs to the comparison, not to the receipt

Neither origin receipt carries a timestamp, and that is correct: a receipt describes an
immutable subject, not a moment. So `ObservedReceipt` wraps each one with when it was observed,
as an **input to this comparator**. A field inside a receipt could be backdated by whoever
produced it; an input cannot be backdated by the receipt.

A receipt observed in the *future* is refused too. That is a clock problem, not freshness, and
treating it as fresh is how a skewed machine gets an indefinitely valid comparison.

## The closure, not its label

INT-EQ-005's control is a matching top-level manifest label with a changed closure. Every field
that distinguishes one module release from another feeds the closure digest — id, interface
version, manifest digest, roots, provides, requires, external exposure — and each has a fixture
proving it changes the digest. The module list is sorted first, so this compares *contents*
rather than the order two verifiers happened to enumerate in.

## `UNSUPPORTED_LEVEL` has a producer

An unadmitted level **reports** rather than throws. Throwing would leave the state in #74's
terminal list with nothing in production able to emit it — a state only a test could construct,
which is a state that does not exist. Reporting gives it exactly one producer and delivers it to
the caller the same way as every other refusal.

## What the plant check found

Forty-three plants, forty-three red — after five findings, all fixtures being caught by a
neighbouring rule:

- the schema rule and the origin-label rule, in both directions (four fixtures, one field each);
- the empty-closure rule, which the digest comparison was catching until both closures were
  empty so the digests agreed;
- the `&& sameManifest` guard in the `same-tree` verdict, described above.

## Exercising it

```bash
bun test scripts/integration/origin-equivalence/equivalence.test.ts
```

Deterministic and offline.

## Evidence boundary

Origin equivalence proves immutable content identity at the named level only. It does not prove
review, signature or attestation trust, Claude or Codex behaviour (#70, #71), provider
availability, promotion or production readiness. `originEquivalenceState` records independent
arrivals and live equivalence as `NOT_EXERCISED` — a real comparison needs two receipts produced
by real origin runs, and neither origin has been contacted.

## Human boundary

Release promotion (#75) and any decision taken on the strength of an equivalence verdict remain
Human-owned.
