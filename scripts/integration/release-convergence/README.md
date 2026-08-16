# Phase 6 release convergence

Issue #75 (Phase 6 / INT-99) — exact reference-composition release verifier and Human gate.

This leaf consumes normalized receipts from #65–#74. It does not proxy carriers, simulate an
origin, invent a Forgejo receipt, create a Human approval or publish a release. The issue's exact
state machine is implemented through `HUMAN_REVIEW`; only `adjudicateRelease` can continue to
`PROMOTED`, `REJECTED` or `ROLLED_BACK`.

The verifier covers all eleven INT-REL eval families:

- every child receipt binds the same exact head, consumer lock and selected composition while
  retaining its own immutable child subject and evidence lane;
- deterministic lock/projection/release output is independent of receipt, tool and gap ordering;
- Claude and Codex retain separate receipts over the same composition and may not proxy;
- published MCP tools exactly equal the selected default-deny policy and the prior pin stays
  immutable;
- GitHub and Forgejo remain separate lanes and achieved equivalence must meet policy;
- workspace/process/lease cleanup and module/Skill/runtime projection removal leave no orphan;
- rollback succeeds only for the unchanged exact target and fails closed on drift/residue;
- residual provider/session/browser/device/security/production gaps remain named;
- promotion/rollback require explicit Human Admit bound to exact head, lock and release digest;
- capability-graph invalidation stales bettor-consumer and its dependents only;
- unsigned promotion is permitted only under an explicit optional-attestation policy; required
  or supplied attestations must bind the exact head, lock and release.

A `*_VERIFIED` stage means the corresponding receipts were truthfully checked. It does not mean
the current repository has live carrier/origin evidence. `releaseConvergenceState` contains no
PASS and records missing attestation and production rollout as `ABSENT`.

```bash
bun test scripts/integration/release-convergence/release-convergence.test.ts
```
