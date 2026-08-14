# Forgejo authoring-origin reachability verifier

Issue #73 (Phase 6 / INT-80). Proves that an exact Agent Shield logical release — commit, tree
and release manifest — is reachable from the trusted-local Forgejo authoring origin, using the
runtime-owned broker, without writing anything and without a value ever leaving the helper.

## What is here and what is not

**No network call and no broker call happen here.** The Forgejo service, the Git transport and
the Keychain broker sit behind `ForgejoOriginTransport`. This directory owns identity admission,
runtime-binding verification, helper policy, immutability, digest comparison, read-only
enforcement, cleanup accounting and receipt admission.

`forgejoOriginState` records reachability, brokered authentication and manifest reachability as
`NOT_EXERCISED`, with a compile-time floor rejecting any widening to `PASS`.

## `localhost` is not a loopback address

`LoopbackHost` is `127.0.0.1 | ::1`. The name `localhost` is refused, because a hosts file can
point it anywhere and the entire reason this origin is trusted is that it is *not on the
network*. A literal loopback address cannot be redirected.

Write scope is refused at admission rather than merely unused: a canary that can push can
rewrite the thing it is verifying, so `scope: "write"` never reaches a run.

## One helper, and a reset before it

`CredentialSource` enumerates `keychain-broker`, `plaintext-store`, `dotenv`, `shell-fallback`
and `none`. Only the first is approved, and only a chain of **exactly one** is admitted:

- A chain of two is a *fallback*, and a fallback is what runs when the approved helper is
  unavailable — which is precisely when it must not.
- Without `resetBeforeApply`, an inherited global helper stays in the chain and **the chain
  itself looks exactly like a clean one**. That is the check that is easy to leave out.
- The chain being configured correctly and the helper actually answering are two claims, so the
  source that authenticated is checked separately from the source that was configured.

INT-FJ-003 is a **name** scan of the child environment, not a value scan: the value is exactly
what must not be there to be scanned for. `GIT_ASKPASS`, `FORGEJO_TOKEN`, `GITEA_TOKEN`,
`GIT_CREDENTIAL_HELPER`, `GH_TOKEN`, `GITHUB_TOKEN` and `GIT_TOKEN` are each refused.

## The receipt does not carry the address

`AuthoringOriginReceipt` has no `host`, `port`, `url`, `token` or `log` field, checked
structurally and by scan. A loopback port plus a repository name is the whole address of a
private service, so the receipt carries neither — this is stricter than the GitHub receipt,
which may name a public repository freely.

## No fallback to GitHub, and none to a branch

INT-FJ-004's control is "a missing Forgejo commit with a GitHub copy available". **There is no
GitHub in this file at all** — the only thing a missing ref can produce is `REF_ABSENT`. A
branch or lightweight tag is refused for the same reason it is in the GitHub verifier: it can be
repointed under the same name.

## Read-only is checked after the read

The mutation report is consulted *after* the manifest verified, not before. The claim is that
this run wrote nothing, and only a run that has finished reading can support it. Two ways to
fail it, reported separately: refs written to the origin, and a changed consumer working tree.

## Two findings from the plant check

Forty-nine plants, forty-nine red, after two:

1. **The transition table refused a real path.** A runtime-binding failure happens right after
   `ORIGIN_IDENTITY_PINNED`, and #73's terminal list has no dedicated binding-failure state.
   That turned out to be the right reading rather than a gap: the runtime binding *is* the
   runtime-env workload that carries the helper policy, so an absent, unaddressed or self-owned
   binding is a policy that cannot be trusted before any policy has been read. The edge is now
   in the table with that reasoning attached.
2. **A separate `chain.length === 0` rule was dead** — `chain[0]` on an empty array is
   `undefined`, which never equals the approved source, so the next rule already refused it. It
   was deleted, and the surviving rule gained a `?? "no helper at all"` so the refusal reads as
   a sentence rather than naming `undefined`. The control asserts the message.

## Exercising it

```bash
bun test scripts/integration/forgejo-origin/forgejo.test.ts
```

Deterministic and offline.

## Evidence boundary

A green suite proves the rules above against a deterministic transport. It does not prove that
the authoring origin is running, that the broker authenticated, that a release exists, or
anything about GitHub equivalence (#74), Claude or Codex behaviour (#70, #71), signed
attestation, review, promotion or production readiness.

## Human boundary

Forgejo instance ownership, broker and Keychain configuration, repository visibility, release
publication and promotion require Human or trusted-operator control. No secret is read, written
or stored by anything in this directory.
