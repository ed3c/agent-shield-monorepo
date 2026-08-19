# AGENTS — Dual-Agent Integration Route

This file is the zero-context execution/read contract for `services/runtime-fabric/src/integrations/dual-agent-route/**`.

## Required read order

1. `AGENTS.md`
2. `README.md`
3. `stack-index.json`
4. `contract.ts`
5. `policy/gate.ts`
6. `api/adapter.ts`
7. `browser/adapter.ts`
8. `matrix-preflight.json`
9. `matrix.ts`
10. relevant GitHub issue/PR exact-head Actions receipts

Do not infer current live/merge/release state from prose alone; read the exact GitHub subject before acting.

## Authorities

```text
route contract authority       this subtree / DA-INT-C
route selection authority      DA-INT-POL deterministic policy
API observation authority      DA-INT-API observation only
browser observation authority  DA-INT-BR observation only
effect write authority         ed3c/bettor-arena / dual-agent-effect-ledger
task/effect self-commit        forbidden to provider/browser/Worker
shared runtime status/release  agent-shield issue #44 owner only
Human/live route admission     issue #161 / trusted authority
```

The exact external effect authority is:

```text
ed3c/bettor-arena PR #216
commit f9b64994979042fc3726c524944a61da4f9cb8b5
tree   e0f0ff4bf0b55627b420ace027043c3b7fee5d1d
owner  dual-agent-effect-ledger
```

Treat it as an immutable process dependency, never a Git parent and never a local copy of the effect ledger.

## Exact deterministic route subjects

```text
#155 / PR #162 DA-INT-C
1250b096b53b8d114425a3618e91137090f0778a
6b9537b00450a43d0e9bcf1b1ae6c4a2e441c67c

#156 / PR #163 DA-INT-API
ae7d891a12df49a76c8d86be84655cecc147c395
71a93c3e8e04e0f2117238bb34cd23085aecd032

#157 / PR #164 DA-INT-BR
637316981191e629a9e569710a6b9dbe6d9bd471
486078cf2d569df407c8d9b638ab81542bfdea57

#158 / PR #165 DA-INT-POL
8abd109b12c5cc69fab7fb207e9f974974a46a8d
7bfdc5bb330973f7dd9485d3fe290a48955120a8

#159 / PR #166 DA-INT-E
a88951c53e03e0fb5a54ed59d531e8cc3de87930
a346d91987e0aa71333b0d2fd96822b2ccb9d92b
```

If any consumed head/tree or source blob changes, stop and rebind before modifying downstream bytes.

## Path ownership

Implementation leaves may write only their declared private paths:

```text
DA-INT-C    contract.ts / root selftest / root README / root targeted workflow
DA-INT-API  api/** / API targeted workflow
DA-INT-BR   browser/** / browser targeted workflow
DA-INT-POL  policy/** / policy targeted workflow
DA-INT-E    matrix.ts / matrix-preflight.json / matrix targeted workflow
DA-INT-D    README.md / AGENTS.md / stack-index.json / docs verifier + docs workflow
```

Do not modify shared runtime registry, generated release composition, root status, integration-status, module locks, or release receipts from this subtree. Those remain #44-owned.

## Git DAG law

Git ancestry follows byte dependency, not process ordering.

- #163/#164/#165 are siblings because they consume #162 bytes and are path-disjoint.
- #166 is actually based on #162 and materializes the three sibling implementation/test bytes by exact Git blob identity.
- Cross-repository Bettor dependencies are process/evidence edges only.
- Do not invent merge commits or multi-parent ancestry merely to make the process DAG look linear.

## Evidence laws

Never substitute these facts:

```text
API receipt          != BROWSER receipt
route selected       != provider executed
provider observed    != effect committed
effect proposal      != canonical effect write
package present      != live execution
fixture PASS         != live API/browser PASS
workflow/CI PASS     != user outcome
Human approval       != release
merge                != production operation
```

`TIMEOUT` or `CONNECTION_LOST` on a write remains `RESULT_UNKNOWN` until the canonical Effect Plane obtains exact readback/reconciliation evidence.

## API-first / fallback law

API is selected when it is admitted for the exact action. Browser fallback is legal only with an explicit allowed reason:

```text
API_ABSENT
API_REFUSED
API_NOT_ADMITTED
API_UNSUPPORTED_ACTION
```

Provider health, latency, package presence, Worker preference, or browser convenience are not route-selection authorities.

## Data and secret law

Durable route packets may contain opaque handles such as `secret://...` only. Never persist or log:

```text
raw credentials
cookies
tokens
browser profile bytes
storage-state bytes
session values
private reasoning
host-account paths
```

Stop rather than weakening this rule.

## Browser law

Browser fallback is a bounded declared-action surface. Do not add a generic arbitrary-JavaScript, arbitrary-selector, arbitrary-shell, devtools, or profile-export surface to satisfy a new integration. Add a typed action/provider leaf instead.

Playwright/source/package presence does not satisfy #161.

## Effect law

Write-class route adapters emit only canonical effect admission/commit **proposals** bound to the exact Bettor Effect Plane. Provider/browser code cannot directly declare `EFFECT_COMMITTED`, task PASS, user outcome PASS, or release PASS.

## Shadow stop conditions

Stop and report a blocker when any of these occurs:

- exact upstream commit/tree/blob drift;
- a second route/effect/task writer appears;
- API/BROWSER evidence lanes are collapsed;
- live state is inferred from fixture/package/source presence;
- shared #44-owned paths are required for a leaf change;
- credentials/session values would be required in Git or CI;
- semantic Git conflict requires Human/local reconciliation;
- a live provider/browser action or external mutation is required;
- merge/release/production activation would be required.

## Current next transition

Deterministic route work converges through #160. Live execution is #161 and requires Human/trusted authority with explicitly safe non-production targets and credential/session admission.

`#147 gVisor` is a separate provider/isolation sibling. Do not use gVisor package/config presence as API/browser evidence and do not use route CI as physical sandbox evidence.
