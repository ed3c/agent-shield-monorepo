# Harness narratives

These examples describe reviewable test subjects and expected evidence. They do not implement the provider or product.

## HX-001 — local text ingest versus PDF absence

```text
exact UTF-8 fixture
→ document.ingest/v1
→ content digest and text artifact
→ PASS
```

Plant a media-type mismatch and an `application/pdf` fixture. The text subject must still pass deterministically; PDF must remain `NOT_IMPLEMENTED`, not a skipped PASS. Later PDF work adds malformed, encrypted, oversized, path-escape, timeout, privacy, and cleanup controls.

## HX-002 — raw-primary research route

```text
immutable source artifact
→ research.route/v1 external-verify
→ raw-primary route selected
→ routing receipt PASS
→ downstream source verification separate
```

Mutate route priority so browser fallback precedes API/raw bytes. The route gate must fail. A routing PASS never proves the fetched source is true or a signed-in browser ran.

## HX-003 — local runtime independence

```text
exact repository commit
→ disposable worktree
→ selected deterministic workload
→ bounded artifact
→ worktree/process cleanup
```

Run without E2B, Apple Container, OpenShell, browser profile, or cloud credential. Local deterministic execution can pass independently. Plant a borrowed `node_modules`, dirty worktree, symlink escape, timeout, and residue. Each must disagree separately.

## HX-004 — Git Town background rebase

```text
issue + evals + path lease
→ isolated worktree + one branch writer
→ exact Git Town parent
→ git town sync --stack --non-interactive --no-auto-resolve
→ local rebase receipt
→ optional guarded push receipt
```

A clean sibling stack rebases without prompts. A planted semantic conflict returns nonzero, writes a BLOCKED/failure receipt, and preserves the worktree. The unattended worker must not edit conflicts or run `continue`, `skip`, `undo`, or `ship`.

## HX-005 — bettor consumer initialization

```text
exact bettor repository + 40-hex commit
→ content-addressed plan
→ human-reviewed apply
→ Claude/Codex/Skill/MCP projections
→ consumer lock and verification receipt
```

Run verification without a trusted private checkout: state is `NOT_EXERCISED`. Plant mutable `main`, tampered plan, target drift, unmanaged file, wrong tool, or host path. Each must fail before a fabricated consumer PASS.

## HX-006 — mobile adapter separation

```text
exact app build
→ explicit platform/simulator/device
→ Maestro or projection adapter
→ typed actions/accessibility IDs
→ screenshots/video/JUnit
→ adapter cleanup
```

The current repository stops before the first arrow and reports adapter states. Future controls plant missing accessibility ID, stale build, absent device, unauthorized WDA/ADB input, assertion failure, and leaked process/port. A YAML flow alone is not E2E evidence.

## HX-007 — high-risk transaction boundary

```text
closed intent + evidence refs
→ deterministic reference decision
→ independent production policy
→ hardware/cryptographic approvals
→ audited account/ledger/settlement subject
→ Human Admit
```

The current deterministic intent contract may pass a low-value fixture or require human approval for a high-value fixture. It does not prove OPA, MPC/TSS, NFC, Secure Enclave, smart account, ledger anchor, or chain settlement. Each later provider receives independent adversarial, recovery, testnet, audit, and rollback Harnesses.

## HX-008 — source proposal versus repository state

The supplied source describes E2B, Firecracker, OpenShell, tmux, hot sync, mobile automation, wallets, and security flows. The source ledger preserves those claims. The Harness reads the current module/status contract and refuses to promote a source claim, performance number, license label, or diagram to live PASS without exact verification.

## HX-009 — multi-Agent path-disjoint fan-out

```text
accepted documentation foundation
├── Worker A: Git Town paths
├── Worker B: architecture/licensing paths
├── Worker C: apps/services README paths
├── Worker D: control-plane README paths
└── Worker E: Harness/eval paths
```

Every Worker receives one branch, worktree, issue, parent, and path lease. Overlap is rejected before mutation. Shared indexes are updated by a later convergence branch rather than by concurrent sibling writers.