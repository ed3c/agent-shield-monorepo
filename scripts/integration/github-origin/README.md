# GitHub distribution-origin reachability verifier

Issue #72 (Phase 6 / INT-70). Proves that an exact Agent Shield logical release — commit, tree
and release manifest — is reachable from the GitHub distribution origin, and that the proof came
from a genuinely fresh clone rather than from bytes that were already on the machine.

## What is here and what is not

**No network call happens here.** The GitHub API, the Git transport and any credential helper
sit behind `GitHubOriginTransport`. This directory owns:

- origin identity admission, including a tracked URL that carries no credential
- immutable reachability — a movable ref is refused, and there is no fallback anywhere
- commit, tree and release-manifest comparison, each against the release subject
- fresh-clone honesty — three separate ways a clone quietly is not one
- state separation — absent, unauthenticated, refused and failed are four facts
- cleanup accounting, including credential-helper streams
- receipt admission by a party that did not produce the receipt

`githubOriginState` records reachability, clone materialization and manifest reachability as
`NOT_EXERCISED`; a live run against the real origin is what moves them, and a compile-time floor
in the eval suite rejects any widening to `PASS`.

## The receipt cannot hold a secret

`OriginReceipt` has no `trackedUrl`, `url`, `token`, `log` or `workdir` field, and neither does
`GitHubOriginTransport`. INT-GH-005's "no credential in logs or receipts" is therefore a property
of the type rather than of a redaction step somebody has to remember — pinned by a type-level
assertion in the suite, plus a planted-token scan over every serialized receipt.

The tracked URL is validated and then **dropped**. It is the one input that can carry userinfo,
so it never crosses into the receipt.

## Two rules that overlap, and why both stay

The plant check found that `authority.includes("@")` and `authority !== "github.com"` catch the
same fixture: userinfo is part of the authority, so a token-bearing URL fails both.

Deleting the first would be wrong. The host rule **interpolates the authority into its message**,
so if it fired first the refusal would echo the token back:

```text
the tracked URL points at x-access-token:<the token>@github.com     ← what would be logged
the tracked URL embeds credentials                                  ← what is logged
```

So the control now asserts the *message* and that it does not contain the token, rather than
merely that something threw. Two rules that share a fixture are not automatically one dead rule;
sometimes they differ in what they say, and what they say is the point.

## A lightweight tag is not immutable

`RefKind` distinguishes `commit`, `annotated-tag`, `branch` and `lightweight-tag`. The first two
are admitted; the last two are refused as movable.

A lightweight tag is the interesting one. It is a plain ref, repointable with one force-push, and
it is the one people assume is immutable *because it is called a tag*. An annotated tag is an
object, so retagging replaces it rather than silently repointing a name.

The refusal reports `REF_ABSENT`, not a fallback. There is no code path in `verifyGitHubOrigin`
that reaches for `main` — INT-GH-002's control is "a missing commit with an available `main`",
and the honest answer to that is that the release is not reachable.

## The clone is compared against the release, not against the API

A clone and an API that agree with each other but disagree with the release subject would pass a
verifier that compared them to each other. Both are compared to the subject instead.

Three ways a clone quietly is not fresh, checked separately because they are three different
mistakes and only one of them looks like one:

- it reused a local object cache
- it borrowed objects from a reference repository
- it was made from a local path rather than the network

## What the plant check found

Forty-six plants, forty-six red — after three findings, all of them fixtures that were being
caught by a neighbouring rule rather than by the rule under test:

- the malformed-owner fixture also broke the expected-name rule
- the fork fixtures also broke the "URL names this repository" rule
- the token-URL fixture also broke the host rule, which is the overlap described above

## Exercising it

```bash
bun test scripts/integration/github-origin/origin.test.ts
```

Deterministic and offline. Named `*.test.ts` like its sibling leaves, so `bun test` runs it — see
#117 for why that matters.

## Evidence boundary

A green suite proves the rules above against a deterministic transport. It does not prove that
the origin is reachable, that a clone succeeded, that a release exists, or anything about
Forgejo equivalence (#73, #74), Claude or Codex behaviour (#70, #71), signed attestation, review,
promotion or production readiness.

## Human boundary

Repository visibility, GitHub App or token permissions, release and tag publication, and
distribution promotion require Human or trusted-operator control.
