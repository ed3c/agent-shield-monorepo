# Apple Container fixed-workflow provider

Issue [#39](https://github.com/ed3c/agent-shield-monorepo/issues/39) owns this local Bun + TypeScript provider leaf. It adapts the admitted Runtime SPI to an exact Apple Container executable/service subject and a host-owned catalog of immutable OCI-image workflows.

The provider does not expose a generic container command, host mount, shell, arbitrary argv, writable checkout, secret/session transfer, or caller-selected image.

## Provider identity

```text
provider ID: apple-container-local
workload ID: agent-shield.apple-container.workflow
provider subject: exact executable version + binary SHA-256
environment subject: exact macOS/image/template/profile subject
scope: local
credential boundary: none
live evidence: NOT_EXERCISED until an admitted host canary exists
```

A caller supplies only:

```text
workflowId
```

The host-owned workflow catalog supplies:

```text
immutable OCI reference ending in @sha256:<digest>
fixed argv
admitted exit codes
maximum log bytes
deny-all workload network policy
```

## State-machine mapping

```text
runtime admission
  → exact provider/environment subject
  → fixed workflow lookup
  → immutable image validation
  → deny-all network / no secrets / no host writes
  → exact executable/service version probe
  → deterministic container name
  → create ephemeral container from immutable source metadata
  → start and wait for admitted exit
  → collect bounded container-log artifact
  → stop/delete container
  → verify absence
  → sealed runtime-receipt/v2
```

Partial creation uses the same deterministic name for recovery removal. Any remaining or unverifiable container produces `FAILED_CLEANUP` and `apple-container-residue`.

## Data flow

```text
closed runtime-request/v2
  + immutable source reference
  + exact provider/environment subjects
  → host-owned workflow and image digest
  → AppleContainerTransport
  → admitted exit result
  → bounded log bytes
  → container-log SHA-256 metadata
  → cleanup and absence verification
  → runtime-receipt/v2
```

The portable contract never carries a host path, mutable checkout, raw container runtime state, secret value, cookie, browser/device session, or unbounded log.

## Deterministic evals

`selftest.ts` drives the same provider with `FakeAppleContainerTransport` and covers:

- exact binary and environment subjects;
- immutable image references;
- host-owned fixed image/argv/network policy;
- unknown workflow and caller-controlled image/command fields;
- network, secret, and writable-root refusal;
- version mismatch and declared provider absence;
- denied exit and oversized log;
- normal cleanup and deliberate container residue;
- partial-creation recovery and recovery failure;
- pre-cancelled request with no provider effect;
- closed receipt and subject-tampering controls;
- deterministic adapter PASS without changing `liveEvidence`.

## Evidence boundary

A deterministic `PASS` proves only the adapter contract, immutable-image/workflow routing, log hashing, Runtime SPI integration, cleanup/recovery logic, and disagreement controls. It does not prove:

- Apple Container availability or compatibility on a target macOS host;
- exact executable checksum/provenance, direct/transitive licenses, SBOM, notices, distribution terms, or Apple platform requirements;
- real VM/container isolation, source materialization, workload networking, process termination, performance, concurrency, or production reliability;
- signed-in sessions, cloud runtime, product/mobile/security/bettor integration, release, or production.

No Apple Container executable or image bytes are vendored. The environment-specific transport and live canary remain host-owned and `NOT_EXERCISED` or `ABSENT` until an exact-subject receipt is admitted.

## Molecular Stack position

```text
main after admitted runtime foundation
├── feat/p3-apple-container      #39  ← this leaf
├── feat/p3-e2b-runtime          #40
├── feat/p3-openshell-policy     #41
├── feat/p3-tmux-pty             #42
└── feat/p3-hybrid-exchange      #43

main after admitted siblings
└── feat/p3-runtime-convergence  #44
```

This leaf owns only `services/runtime-fabric/src/providers/apple-container/**` and its provider-specific CI workflow. Shared provider registries, public aggregate exports, module manifests, status, release bytes, and cross-provider evidence remain issue #44 ownership.
