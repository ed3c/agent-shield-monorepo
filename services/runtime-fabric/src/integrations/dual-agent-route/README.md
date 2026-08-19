# Dual-Agent API-first / Browser-fallback Integration Route

Status: complete deterministic route-matrix candidate for #144. The subtree proves route contracts and disagreement behavior only; it does **not** execute a real API, signed-in browser session, provider mutation, credential resolution, user outcome, merge, or release.

## Read route

Agents entering this directory read in this order:

```text
AGENTS.md
→ README.md
→ stack-index.json
→ contract.ts
→ policy/gate.ts
→ api/adapter.ts
→ browser/adapter.ts
→ matrix-preflight.json
→ matrix.ts
```

The machine index is the current exact-subject routing source for this deterministic subtree. GitHub PR/Actions readback remains the authority for current PR/check state.

## Authority

```text
closed RouteRequest
+ immutable provider/tool/schema/terms subjects
+ opaque auth/session handles
+ action scope
+ route policy
        ↓
DA-INT-C contract
        ↓
DA-INT-POL selection authority
        ├─ API_FIRST
        └─ typed BROWSER fallback
             ↓
route-specific adapter
        ├─ API observations/readback
        └─ BROWSER observations/readback
             ↓
write class?
        └─ EFFECT_ADMISSION_REQUEST / EFFECT_COMMIT_PROPOSAL only
             ↓
external canonical effect writer
ed3c/bettor-arena PR #216
`dual-agent-effect-ledger`
```

Agent Shield provider/browser bytes are **observation/proposal authorities only**. They cannot self-commit canonical task or effect state. Shared runtime registry/status/release remains issue #44-owned and is outside this subtree's writer lease.

## Exact deterministic subjects

```text
DA-INT-C  issue #155 / PR #162
head 1250b096b53b8d114425a3618e91137090f0778a
tree 6b9537b00450a43d0e9bcf1b1ae6c4a2e441c67c
route run 32277843350 PASS
modular run 32277843483 PASS
lockfile run 32277843426 PASS

DA-INT-API issue #156 / PR #163
head ae7d891a12df49a76c8d86be84655cecc147c395
tree 71a93c3e8e04e0f2117238bb34cd23085aecd032
run 32278074448 PASS

DA-INT-BR issue #157 / PR #164
head 637316981191e629a9e569710a6b9dbe6d9bd471
tree 486078cf2d569df407c8d9b638ab81542bfdea57
run 32278561508 PASS
retained failed head bb70e422e335c90467b2b1324c8107ccf9831fc5
retained failed run 32278264809

DA-INT-POL issue #158 / PR #165
head 8abd109b12c5cc69fab7fb207e9f974974a46a8d
tree 7bfdc5bb330973f7dd9485d3fe290a48955120a8
run 32278411221 PASS

DA-INT-E issue #159 / PR #166
head a88951c53e03e0fb5a54ed59d531e8cc3de87930
tree a346d91987e0aa71333b0d2fd96822b2ccb9d92b
run 32279002352 PASS
```

External effect authority binding:

```text
ed3c/bettor-arena PR #216
commit f9b64994979042fc3726c524944a61da4f9cb8b5
tree   e0f0ff4bf0b55627b420ace027043c3b7fee5d1d
writer dual-agent-effect-ledger
mode   EFFECT_ADMISSION_REQUEST
```

That is an immutable cross-repository process dependency, never Git ancestry.

## State Machine

```text
REQUEST_OBSERVED
→ SUBJECTS_VALIDATED
→ ACTION_SCOPE_VALIDATED
→ POLICY_EVALUATED
→ API admitted for requested action?
    ├─ yes → API_SELECTED
    │         → API_ATTEMPT_PACKET
    │         → API_OBSERVATION
    │         → READ_ONLY result
    │         |  write: TARGET_READBACK_REQUIRED
    │         → observation / effect proposal only
    │
    └─ no/unsupported
         → typed reason:
           API_ABSENT
           API_REFUSED
           API_NOT_ADMITTED
           API_UNSUPPORTED_ACTION
         → browser fallback explicitly permitted?
             ├─ no → NO_ADMITTED_ROUTE
             └─ yes → BROWSER_SELECTED
                      → DECLARED_ACTION_ONLY
                      → BROWSER_OBSERVATION
                      → cleanup/residue check
                      → READ_ONLY result
                      |  write: TARGET_READBACK_REQUIRED
                      → observation / effect proposal only
```

Unknown execution remains independent:

```text
TIMEOUT | CONNECTION_LOST
→ RESULT_UNKNOWN
→ never accepted as committed effect without later exact readback/reconciliation
```

## Process DAG vs Git DAG

Process/evidence DAG:

```text
#155 DA-INT-C
├─ #156 DA-INT-API
├─ #157 DA-INT-BR
└─ #158 DA-INT-POL
      ↓
#159 DA-INT-E
      ↓
#160 DA-INT-D
      ↓
#161 LIVE
```

Actual Git DAG:

```text
PR #162 DA-INT-C
├─ PR #163 DA-INT-API
├─ PR #164 DA-INT-BR
├─ PR #165 DA-INT-POL
└─ PR #166 DA-INT-E
     └─ PR #160 docs child after convergence
```

PR #166 has PR #162 as its actual Git base and materializes #163/#164/#165 implementation/test bytes by exact Git blob SHA. Process input does not imply Git ancestry.

## Complete deterministic denominator

PR #166 jointly exercises:

```text
api_first_read
api_write_readback
api_timeout_unknown
fallback_api_absent
fallback_api_refused
fallback_api_not_admitted
fallback_api_unsupported_action
browser_write_readback
browser_timeout_unknown
policy_authority_separation
route_evidence_separation
effect_authority_preserved
cleanup_separation
```

The matrix also refuses sibling byte drift, denominator omission, effect-authority drift, live-evidence laundering, API/BROWSER evidence substitution, provider-health route authority, fallback despite admitted API, and effect-owner bypass.

## Hard architecture laws

- API and BROWSER receipts are separate facts and never substitute for each other.
- API-first means an API must be admitted for the exact requested action; provider health, latency, package presence, or Worker preference cannot admit a route.
- Browser fallback requires a typed fallback reason plus explicit policy permission.
- Browser execution surface is declared-action-only; no generic script/shell/selector widening belongs in this contract.
- Credentials, cookies, tokens, browser profiles, storage-state bytes, and session values never enter durable route packets; only opaque `secret://...` handles do.
- Provider-native idempotency is observation only. Canonical effect authority remains Bettor `dual-agent-effect-ledger`.
- Package/source/binary presence, deterministic fixtures, and CI PASS cannot become live API/browser/provider evidence.
- Cleanup/residue is independent from operation success.
- Shared registry/status/composition/release remains #44-owned.
- gVisor #147 is a separate provider/isolation sibling and is not route evidence.

## Live frontier

Issue #161 is the only next route-specific live evidence transition. It requires Human/trusted authority for provider enrollment, credentials/session access, safe non-production targets, real API/browser execution, external mutation, and cleanup.

Current live states:

```text
live API                 NOT_EXERCISED
live browser             NOT_EXERCISED
credential resolution    NOT_EXERCISED
provider effect          NOT_EXERCISED
live target readback     NOT_EXERCISED
user outcome             NOT_EXERCISED
merge                    NOT_PERFORMED
release                  NOT_PERFORMED
```

Evidence ceiling for the current subtree: `COMPLETE_DETERMINISTIC_ROUTE_MATRIX_ONLY`.
