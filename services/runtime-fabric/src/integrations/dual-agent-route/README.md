# Dual-Agent API-first / Browser-fallback Route Contract

Status: deterministic contract candidate for #155 (`DA-INT-C`). This directory does not execute a live API call, browser session, external effect, or release transition.

## Authority

```text
closed route request
+ exact API/browser/tool/schema/auth subjects
+ route policy
+ optional write-class effect binding
        ↓
DA-INT-C deterministic selector
        ├─ API route
        └─ BROWSER fallback
```

API and BROWSER are separate evidence lanes. A package/binary/source being present does not establish either route as live. Provider/browser output cannot write canonical task/effect state.

Write-class actions bind the external canonical effect authority only:

```text
ed3c/bettor-arena
PR #216 / DA-EF-C
commit f9b64994979042fc3726c524944a61da4f9cb8b5
tree   e0f0ff4bf0b55627b420ace027043c3b7fee5d1d
owner  dual-agent-effect-ledger
mode   EFFECT_ADMISSION_REQUEST
```

That cross-repository subject is an immutable process dependency, not Git ancestry and not imported runtime authority.

## State Machine

```text
REQUEST_OBSERVED
→ SUBJECTS_VALIDATED
→ ACTION_SCOPE_VALIDATED
→ POLICY_EVALUATED
→ API_ADMITTED?
    ├─ yes + action supported → API_SELECTED
    └─ no/unsupported
         → fallback reason typed
         → browser fallback explicitly allowed?
             ├─ yes + browser admitted/action supported → BROWSER_SELECTED
             └─ no → NO_ADMITTED_ROUTE
→ ROUTE_RECEIPT_RENDERED
```

Blocked/refusal states remain distinct:

```text
FALLBACK_DESPITE_ADMITTED_API
RAW_AUTH_MATERIAL
WILDCARD_ACTION
MUTABLE_ROUTE_SUBJECT
EFFECT_OWNER_BYPASS
ROUTE_EVIDENCE_SUBSTITUTION
PACKAGE_PRESENCE_AS_LIVE
PROVIDER_SELF_COMMIT
NO_ADMITTED_ROUTE
```

## Data Flow

```text
exact action
+ tenant
+ immutable provider/tool/schema/terms subjects
+ opaque secret:// auth handles
+ route policy
        ↓
validate closed surface
        ↓
API-first deterministic selection
        ↓
route-specific observation adapter
        ↓
route-specific receipt
        ↓
write class? → canonical effect admission proposal only
```

## Stack

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

Actual Git ancestry follows named unmerged-byte consumption. Shared runtime registry/status/release remain #44-owned.

## Evidence ceiling

This atom can prove deterministic route identity, API-first/fallback policy, action-surface closure, opaque-auth boundaries, effect-authority separation, route evidence separation and refusal semantics.

It does not prove a real API, Playwright/browser session, provider credential, target readback, external effect, Human admission, merge or release.

Evidence ceiling: `DETERMINISTIC_ROUTE_CONTRACT_ONLY`.
