# ADR-0001 — Documentation and Git governance before implementation

- **State:** ACCEPTED
- **Intent IDs:** INT-003, INT-004, INT-006, INT-007, INT-010
- **Source IDs:** S-001, S-002, S-006, S-007
- **Issue:** [#13](https://github.com/ed3c/agent-shield-monorepo/issues/13)
- **Epic:** [#11](https://github.com/ed3c/agent-shield-monorepo/issues/11)

## Context

The supplied source conversation contains a broad product architecture, multiple deployment modes, many third-party projects, data-flow diagrams, security claims, and planned monorepo trees. The current repository already converted a subset into six typed module contracts and honest status states, but its root documentation did not yet provide a complete provenance and stacked-delivery index.

Starting the next provider or product implementation wave now would force Worker Agents to infer ownership, license policy, source truth, eval contracts, and cross-PR dependencies. That would increase hidden coupling and make later evidence difficult to trust.

## Decision

Complete a documentation-first stacked-PR program before adding product/provider code:

1. freeze project intent, source ledger, claim taxonomy, and traceability;
2. version Git Town and Bash Worker-Agent governance;
3. document planned architecture and data flows without promoting them;
4. add nearest-README ownership contracts;
5. define reusable Harness and eval contracts;
6. converge links, stack ancestry, coverage, and implementation handoff.

A shared foundation branch may have path-disjoint child branches so multiple Agents can work concurrently. Merge and release remain human-owned.

## Alternatives considered

### Implement providers first

Rejected for this phase. It would produce code before license, ownership, eval, and evidence boundaries are indexed.

### Put all documentation into one PR

Rejected. It would be difficult to review and would prevent independent Agents from working on path-disjoint areas.

### Treat the source export as the architecture SSOT

Rejected. The source preserves valuable intent, but includes proposals, current-version claims, cost estimates, and overconfident security/compliance language that require separate verification.

## Consequences

- Product progress pauses while documentation and Git control planes converge.
- More PRs exist, but each has a smaller path lease and explicit eval subject.
- Source claims remain available without becoming repository evidence.
- The next implementation issue can be selected mechanically from traceability and dependency data.

## Evals

- E00.1 deterministic Agent entry
- E00.2 claim-state separation
- E00.3 bidirectional traceability
- E00.4 documentation-only boundary

## Supersession

A later ADR may reopen implementation only after issue #23 proves the documentation stack's link closure, README coverage, ancestry, and handoff contract.