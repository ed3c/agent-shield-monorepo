# Portable module release projection

This directory contains deterministic generated release manifests for portable Agent Shield module/contract bytes.

## State machine

```text
MANIFESTS/CONTRACTS PINNED → FILES/INTERFACES DIGESTED → DEPENDENCIES RESOLVED
  → RELEASE JSON RENDERED → BYTE-COMPARED → HUMAN-ADMITTED
```

Blocked: missing/overlapping owner, capability/interface conflict, mutable/stale input, nondeterministic output, unrelated global restamp, or live-state claim without receipt.

```text
module manifests + public contract bytes + selected portable files
  → content digests/closure
  → `agent-shield-module-set.json`
```

The release does not contain or prove credentials, host paths, provider sessions, live runtime/product/security/origin behavior, or production readiness. Convergence issues update it only when their owned public subject changes.
