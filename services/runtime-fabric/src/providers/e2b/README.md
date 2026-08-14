# E2B fixed-workflow cloud sandbox provider

Issue [#40](https://github.com/ed3c/agent-shield-monorepo/issues/40) owns this cloud Bun + TypeScript provider leaf. It adapts the admitted Runtime SPI to an exact E2B adapter subject, one immutable template subject, a broker-only credential reference, and a host-owned catalog of fixed workflows.

It does not expose arbitrary shell, caller commands, mutable templates, raw API keys, host paths, unrestricted sandbox networking, or generic cloud execution.

## Provider identity

```text
provider ID: e2b-firecracker-cloud
workload ID: agent-shield.e2b.workflow
provider subject: exact adapter source/version/SHA-256
environment subject: exact template ID/version/SHA-256
scope: cloud
credential boundary: broker-only
live evidence: NOT_EXERCISED until an admitted exact-provider canary exists
```

A request supplies only:

```text
workflowId
one opaque broker reference named E2B_CREDENTIAL_REF
```

The host-owned workflow catalog supplies:

```text
immutable template subject
admitted exit codes
sandbox egress policy
workspace-relative writable roots
artifact kind/media/bounds
```

The broker reference is a logical handle. No secret value appears in the request, receipt, Git history, test fixture, log, or artifact.

## State-machine mapping

```text
runtime admission
  → exact adapter/template subject
  → fixed workflow lookup
  → broker-only opaque credential reference
  → exact workload network and mutation policy
  → adapter transport probe
  → deterministic sandbox name
  → create sandbox from immutable source metadata
  → run fixed workflow
  → collect bounded content-addressed artifact
  → kill sandbox and verify absence
  → sealed runtime-receipt/v2
```

Partial sandbox creation uses the same deterministic name for recovery cleanup. A remaining or unverifiable sandbox produces `FAILED_CLEANUP` and `e2b-sandbox-residue`.

## Control-plane versus workload network

`RuntimeRequest.network` governs the selected sandbox workflow's egress policy. The provider-control-plane connection used by an environment-specific `E2bTransport` remains host/runtime-policy owned and must be separately admitted. The request cannot widen that control plane.

## Data flow

```text
closed runtime-request/v2
  + immutable source reference
  + exact adapter/template subjects
  + opaque broker reference
  → fixed workflow and egress/mutation policy
  → E2bTransport
  → admitted workflow exit
  → bounded artifact bytes and touched-path set
  → SHA-256 artifact metadata
  → cleanup and absence verification
  → runtime-receipt/v2
```

## Deterministic evals

`selftest.ts` drives the provider through `FakeE2bTransport` and covers:

- exact adapter and template subjects;
- fixed workflow/template/network/mutation/artifact policy;
- unknown workflow and caller-controlled command/template fields;
- missing, extra, wrong-class, and environment-delivered credential references;
- workload-network and writable-root drift;
- touched-path escape;
- adapter version mismatch and declared provider absence;
- denied exit and oversized artifact;
- normal cleanup and deliberate sandbox residue;
- partial-create recovery and recovery failure;
- pre-cancelled request with no provider effect;
- closed receipt and subject-tampering controls;
- deterministic adapter PASS without changing `liveEvidence`.

## Evidence boundary

A deterministic `PASS` proves only the adapter contract, fixed workflow/template routing, broker-reference boundary, artifact hashing, Runtime SPI integration, cleanup/recovery logic, and disagreement controls. It does not prove:

- E2B service availability, Firecracker implementation, isolation strength, or compatibility;
- current E2B API/SDK behavior, template deployment, region, latency, performance, cost, quotas, or reliability;
- exact provider terms, adapter/source license, transitive licenses, SBOM, notices, distribution/service terms, or legal approval;
- a real credential broker, provider network, external sandbox, artifact transfer, or cleanup;
- product/mobile/security/bettor integration, release, production, custody, or settlement.

No E2B dependency, executable, SDK, API key, template byte, or live service call is required by the deterministic suite. The environment-specific transport and live canary remain `NOT_IMPLEMENTED`, `NOT_EXERCISED`, or `ABSENT` until exact-subject evidence is admitted.

## Molecular Stack position

```text
main after admitted runtime foundation
├── feat/p3-apple-container      #39
├── feat/p3-e2b-runtime          #40  ← this leaf
├── feat/p3-openshell-policy     #41
├── feat/p3-tmux-pty             #42
└── feat/p3-hybrid-exchange      #43

main after admitted siblings
└── feat/p3-runtime-convergence  #44
```

This leaf owns only `services/runtime-fabric/src/providers/e2b/**` and its provider-specific CI workflow. Shared provider registries, public aggregate exports, module manifests, status, release bytes, and cross-provider evidence remain issue #44 ownership.
