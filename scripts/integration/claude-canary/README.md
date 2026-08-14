# Claude Code consumer canary

Issue #70 (Phase 6 / INT-50). Runs the released Agent Shield consumer surface against the Claude
Code carrier from a disposable immutable workspace, and reports exits, digests and an OK
predicate — never model output.

## What is here and what is not

**No process is launched and no model is called.** The Claude Code binary, its authentication,
the model turn and the MCP transport sit behind `CarrierTransport`. This directory owns workspace
immutability, context freezing, Skill parity, host isolation, tool policy, turn admission,
receipt privacy and cleanup accounting.

`claudeCanaryState` records carrier reachability, the bounded model turn and the MCP tool call as
`NOT_EXERCISED`, with a compile-time floor rejecting any widening to `PASS`.

## Package presence is not a call

INT-CLAUDE-006's control is "replace the turn with a mock or prose". A mock has the same
installed binary, the same configuration and the same exit code as a real turn — so `TurnKind`
enumerates `model`, `mock` and `replay`, and only the first is admitted. Refusing the other two
is a rule with one place to live rather than an assumption nobody wrote down.

A turn that completed without calling a tool is refused too: it did not exercise the surface this
canary exists for.

## The workspace is read twice

The tree digest is captured before the turn and re-read after it. Checking only before would
never see a run that mutated what it was measuring — which is INT-CLAUDE-001's control, "mutate
the owner checkout during the canary".

Borrowing the owner's live checkout is refused outright. A run that borrows it is measuring the
machine, not the release.

## Host isolation is asymmetric, and derived

A carrier legitimately reaches its *own* state directory and never the other's, so
`foreignMarkersFor(carrier)` computes the forbidden set from the carrier rather than hardcoding
it. `.claude` is foreign to Codex and native to Claude; `.codex` is the reverse.

That is not a stylistic choice — it is what lets **#71 reuse this rule unchanged** instead of
maintaining a second, drifting copy. The test asserts the asymmetry in all four directions.

## Listing and calling are two checks

A tool the carrier *lists* and a tool it *calls* are checked separately. The plant check found
the listing rule dead because the fixture's called set defaulted to the listed set — an unexposed
tool in the listing is a problem whether or not the model happened to call it, and the fixture
now pins them apart.

## One shared receipt, so neither carrier proxies the other

`CarrierCanaryReceipt` carries `carrier: "claude-code" | "codex-cli"` on a shared schema rather
than being a Claude-specific type. INT-CODEX-009 asks that the receipt surface permit a later
parity comparison "without one carrier proxying the other", and a shared shape with a checked
discriminator is what makes that comparison like-for-like. `canaryReceiptRefusal` refuses a
Claude receipt presented against a Codex expectation, asserted directly.

## The transcript never reaches the receipt

`SealedTranscript` holds the model output in a private field and overrides every route out. The
receipt records the exit code, the digests and the counts — there is no `transcript`, `output`,
`token` or `workspacePath` field on it, pinned by a type-level assertion and a planted-output
scan over clean *and* failed runs.

## What the plant check found

Forty-eight plants, forty-eight red — after two findings, both fixtures caught by a neighbouring
rule:

1. the canonical-digest shape rule, whose fixture also broke the "resolved differs from
   canonical" rule until both digests were made malformed;
2. the listed-tools rule, described above.

## Exercising it

```bash
bun test scripts/integration/claude-canary/claude-canary.test.ts
```

Deterministic and offline.

## Evidence boundary

A green suite proves the rules above against a deterministic transport. It does not prove that
Claude Code is installed, authenticated, reachable or correct; it does not prove model
correctness, permanent provider availability, Codex parity (#71), origin equivalence (#74),
signed browser or device routes, or production promotion. **No model has been called.**

## Human boundary

Authentication, host trust, permissions, network access, canary cost, model selection and release
promotion are Human or trusted-operator owned.
