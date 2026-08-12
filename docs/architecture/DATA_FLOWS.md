# Agent Shield data-flow contracts

Each edge below names a typed packet, immutable artifact, receipt, or human-owned decision. Source `S-001` supplies the broad scenarios; repository contracts and evidence states determine what is currently admitted.

## DFD-001 — source to release evidence

```text
supplied PDF / user-visible instruction / official upstream source
  → source ledger (S-ID + locator + digest/trust state)
  → repository decision or explicit rejection (ADR)
  → intent/requirement ID
  → eval-first issue + owned paths
  → stacked branch/PR + parent breadcrumb
  → deterministic proof / public control / mutation artifact
  → environment-owned canary
  → immutable module release
  → Human Admit / promotion
```

A stronger document cannot skip an evidence stage. Issue and PR prose are delivery metadata, not runtime proof.

## DFD-002 — Agent request and evidence routing

```text
Agent actor or user
  → typed request contract
  → owning domain module public boundary
  → deterministic decision/result packet
  → optional provider boundary
  → artifact reference + module/provider receipt
  → product projection
```

Cross-module calls do not import private implementation paths. A missing provider returns `ABSENT`, `NOT_IMPLEMENTED`, or `NOT_EXERCISED` according to the exact contract; it does not borrow another module's green state.

## DFD-003 — document and research flow

```text
source file / content-addressed bundle
  → document.ingest/v1
  → extracted text + source digest + parser provenance
  → research.route/v1
  → selected route packet
       ├── static/raw source route
       ├── optional browser route
       └── bettor browser-contract/v2 route
  → bounded research artifact + evidence class
```

Current state:

- deterministic local text ingestion is supported;
- PDF/provider and signed-in browser execution require separate providers;
- browser/session credentials remain host-owned;
- browser fallback records evidence-class downgrade.

## DFD-004 — local runtime

```text
request packet + exact source snapshot
  → runtime.provider/v1 local selection
  → fresh disposable workspace
  → exact environment allowlist
  → bounded command/Agent adapter
  → content-addressed artifacts
  → exit + touched-path + cleanup receipt
```

The local route cannot depend on cloud credentials. Package presence alone does not prove Apple Container, OpenShell, tmux, browser, simulator, or device execution.

## DFD-005 — cloud-independent runtime

```text
immutable release + closed input bundle + brokered secret references
  → cloud provider adapter
  → fresh isolated runtime
  → network/secret/time/byte limits
  → task execution
  → artifact store + redacted receipt
  → complete cleanup
```

The source proposes E2B/Firecracker and other providers. Agent Shield keeps the route `NOT_IMPLEMENTED` until exact-version licensing, isolation, timeout, cleanup, availability, and cost/performance canaries exist. The local checkout is never a hidden cloud dependency.

## DFD-006 — hybrid source update and repair

```text
single-writer branch lease
  → immutable base commit/tree/content digest
  → local or cloud Worker change
  → reviewable patch/commits
  → base-digest and path-ownership verification
  → Git Town parent-first rebase
  → evals and negative controls
  → safe push + PR receipt
```

Forbidden source-code authority:

```text
mtime/newest-wins
prefer-cloud / prefer-beta without review
untracked bidirectional overwrite
mutable live-checkout borrowing
```

Generated artifacts may use content-addressed stores; policies use versioned epochs; OS/dependencies use image/template rebuilds; data uses APIs/events/backups; secrets and browser/device sessions remain broker-owned.

## DFD-007 — mobile action and risk boundary

```text
external MCP/QA actor OR authenticated in-app action request
  → bounded precompiled action contract
  → product.mobile/v1 state transition
  → security.intent/v1 risk decision
       ├── low-risk allowed result
       ├── waiting-for-human/hardware result
       └── denied result
  → UI status projection + receipt
```

Development automation may route through Maestro/WDA/scrcpy providers. Production in-app actions cannot expose arbitrary code, shell, navigation strings, or unauthenticated listeners. Current device/provider execution is not proven.

## DFD-008 — hardware and settlement boundary

```text
high-risk typed intent
  → policy/workflow provider
  → challenge bound to intent/content digest and expiry
  → hardware evidence provider (Secure Enclave/NFC candidate)
  → audited MPC/TSS or signing provider
  → smart-account/testnet settlement provider
  → ledger/anchor and completion receipts
```

All provider steps remain separately versioned and independently falsifiable. No private key, shard, NFC secret, device session, or signed transaction enters Git, MCP payloads, general logs, or documentation receipts. Human Admit is required before custody or production authority expands.

## DFD-009 — bettor-arena consumption

```text
Agent Shield immutable module release
  → bettor composition requirement
  → selected transitive module/Skill/runtime closure
  → generated Claude and Codex native context
  → default-deny stateless MCP tools
  → proof + public control + mutation + consumer canary
  → origin/equivalence receipt
  → Human Admit / promotion / rollback subject
```

Agent Shield does not import bettor private paths or fall back to mutable `main`. Current deterministic consumer contracts do not prove private checkout reachability or live Claude/Codex execution.

## DFD-010 — parallel stacked documentation work

```text
accepted foundation PR
  ├── Git Town/Bash governance Worker
  ├── architecture/source-flow Worker
  ├── apps/services README Worker
  ├── control-plane README Worker
  └── Harness/eval Worker
          → sibling PRs with disjoint path leases
          → parent merge + descendant sync/re-eval
          → final convergence PR
```

Shared indexes are changed only by the foundation or convergence owner. Sibling Workers do not race on one canonical file.
