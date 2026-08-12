# Harness catalog

## H-CONTRACT — deterministic contract Harness

**Use for:** schemas, manifests, capability graphs, route selection, canonicalization, release generation.

**Subject:** exact repository tree plus versioned input fixture.  
**Positive control:** known valid fixture.  
**Negative control:** missing field, unknown field, wrong version, stale digest, duplicate owner, or broken capability.  
**Artifacts:** expected/actual JSON and digest.  
**Cleanup:** temporary files only.  
**Possible states:** `PASS`, `FAIL`, `ABSENT`.

## H-MUTATION — disagreement Harness

**Use for:** proving a gate detects the intended defect rather than only returning green.

**Subject:** a copy of the exact contract subject with one named mutation.  
**Control rule:** one mutation per run; record before/after digest.  
**Examples:** remove `--no-auto-resolve`, change evidence state, break an index link, alter input digest, remove accessibility ID.  
**Artifacts:** mutation description, changed bytes, exit, expected failure class.  
**Possible states:** `PASS` means the gate correctly rejected the mutated subject; do not confuse this with the mutated capability passing.

## H-ABSENCE — unavailable-subject Harness

**Use for:** private checkouts, credentials, browser sessions, devices, providers, tools, or artifacts that may not exist.

**Observable:** absence is detected before unrelated mutation.  
**States:**

- required subject missing → `ABSENT`;
- adapter deliberately not built → `NOT_IMPLEMENTED`;
- contract exists but environment not run → `NOT_EXERCISED`;
- attempted exact subject failed → `FAIL`.

An optional skip cannot produce `PASS`.

## H-WORKSPACE — isolated execution Harness

**Use for:** Git worktrees, local sandboxes, future cloud sandboxes, build/test workspaces.

**Preconditions:** immutable source, selected dependency closure, clean environment allowlist.  
**Controls:** path escape, symlink, dependency borrowing, dirty workspace, timeout, cancellation.  
**Artifacts:** source/tree identity, command, exit, bounded stdout/stderr digest, outputs, environment class.  
**Cleanup:** worktree/container/process/session/port/residue all reported separately.

## H-PROVIDER — external provider Harness

**Use for:** E2B, Apple Container, OpenShell/tmux, browser broker, cloud macOS, mobile device, chain, ledger, IAM, secret broker.

**Required admission:** exact provider/tool version, acquisition provenance, direct/transitive licenses, notices, configuration, credentials boundary, cost/network policy.  
**Required run:** create, execute, artifact return, failure injection, cancellation, deletion, residue scan.  
**No inference:** source benchmarks, documentation, package presence, or provider API response from another subject do not prove this run.

## H-SESSION — credential-bearing session Harness

**Use for:** Claude Code, Codex CLI, signed-in browser, mobile device, hardware approval.

**Session owner:** host/user/broker/device must be explicit.  
**Portable receipt:** subject ID, action metadata, artifact digest, state, timing, cleanup—never cookie/token/profile bytes.  
**Controls:** wrong actor, expired session, missing permission, cross-environment copy, profile leakage, logout/cleanup failure.

## H-ORIGIN — immutable source/origin Harness

**Use for:** GitHub, Forgejo, release mirrors, external module releases.

**Subject:** exact 40-hex commit, Git tree, release manifest path and digest.  
**Equivalence classes:** exact commit, same tree, or same reviewed release manifest only when the contract allows them.  
**Controls:** mutable ref, unreachable commit, mismatched tree/manifest, unauthenticated source, fake origin PASS.

## H-STACK — stacked-PR Harness

**Use for:** Git Town Worker-Agent branches.

**Subject:** branch graph, task packet, isolated worktree, exact parent, path lease, eval set.  
**Positive control:** clean non-conflicting rebase; optional guarded publication.  
**Negative control:** dirty worktree, missing parent, duplicate lease, remote disagreement, semantic conflict, incomplete PR body.  
**Artifacts:** doctor/create/sync/proposal receipts and bounded logs.  
**Cleanup:** process lease removed; failed worktree and BLOCKED state preserved for recovery.

## H-PRODUCT — product adapter Harness

**Use for:** mobile/web UI, Maestro/WDA/scrcpy, dashboard, terminal, in-app actions.

**Subject:** exact build artifact plus platform/device/simulator and typed action/test flow.  
**Controls:** stale build, missing accessibility ID, unauthorized action, unavailable device, assertion failure, misleading UI success.  
**Artifacts:** screenshots/video/JUnit/logs/build and adapter receipts.  
**Boundary:** UI success cannot bypass provider, risk, hardware, or Human Admit states.

## H-SECURITY — high-risk boundary Harness

**Use for:** MPC/TSS, Secure Enclave/NFC, smart accounts, ledgers, settlement.

**Prerequisites:** explicit threat model, independent review, exact dependency/bytecode identity, key/permission ceremony, test environment.  
**Controls:** replay, compromised node/host, downgrade, substitution, lost device, recovery, revocation, split brain, rollback.  
**Artifacts:** ceremony, attestation, policy, transaction/testnet, audit, recovery, cleanup, and Human Admit receipts.  
**Rule:** deterministic intent validation or architecture prose cannot substitute for native security evidence.