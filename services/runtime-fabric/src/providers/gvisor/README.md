# gVisor / runsc provider-isolation subtree

Status: complete deterministic gVisor provider/isolation candidate for #147. This directory proves source/admission/adapter/policy/mutation semantics only; it does **not** execute `runsc`, an OCI container, live network isolation, credential resolution, provider registration, merge, or release.

## Read route

```text
AGENTS.md
→ README.md
→ stack-index.json
→ contract.ts
→ adapter.ts
→ policy.ts
→ matrix-preflight.json
→ matrix.ts
```

GitHub PR/Actions exact-head readback remains the authority for current PR/check state.

## Exact upstream source candidate

```text
repository   google/gvisor
commit       09329f4f5677c3b2492a40ea816a6899d03bcbd1
tree         f5714e427eb5e9d93e2b7e4e5a994dec5a90bcfb
LICENSE blob f7a006d10464cfe9724b5d687c0013bf982cc66a
source license Apache-2.0
```

The upstream LICENSE also notes files carrying other permissive notices. The contract therefore preserves `thirdPartyLicenseNoticeRequired=true`; source-license identification does not substitute for executable/SBOM admission.

## Authority

```text
Phase-3 runtime SPI #38
        ↓
PR #174 / DA-GV-C
provider/source/binary/image admission
        ↓
   ┌───────────────┐
   ▼               ▼
PR #175         PR #176
DA-GV-A         DA-GV-P
runsc plan      isolation policy
   └──────┬────────┘
          ▼
PR #177 / DA-GV-E
complete deterministic matrix
          ↓
PR #178 / DA-GV-D
README / AGENTS / Stack / live handoff
          ↓
#173 DA-GV-LIVE
          ↓
#44 shared runtime convergence / Human Admit
```

Provider-private code cannot write the #44-owned shared registry, `data/status/integration.json`, release manifest, or public composition wiring.

Independent evidence owners remain distinct:

```text
#95   DNS-resolved live-network enforcement
#154  reversible local sandbox fixture / capability steering
#173  real runsc OCI isolation + cleanup
#44   aggregate runtime registry/status/release/Human Admit
```

Neither #95 nor #154 can proxy gVisor live isolation, and gVisor cannot overwrite their receipts.

## Exact deterministic subjects

```text
DA-GV-C issue #168 / PR #174
head 8cc1bea3c307b3fd89de001173a90fea45e7d77a
tree 8d6fbbc6ac8e27188033779e2dc20d6aff363618
contract run 32282011851 PASS
modular run  32282011435 PASS
lockfile run 32282011488 PASS

DA-GV-A issue #169 / PR #175
head 4402520edead7e5cb1fcbf1e3d8ae74977c243b7
tree 7ec3a90f12aebe55176018adc3d767a2b1bf26dc
run 32282213765 PASS

DA-GV-P issue #170 / PR #176
head 2e7c2415b7b2f234a02a1239bdc0f2418b8cc1d6
tree 7e60143c3f529f5f5953c595051aaa320e7d7c9d
run 32282337370 PASS

DA-GV-E issue #171 / PR #177
head 83f8cf90f84cee8f7d360fce8800c902bd5e9786
tree 029f6d174e5ed2a7a76150c5bb9e16ad2bd6c1bf
run 32282711208 PASS
```

## State machine

```text
SOURCE_PINNED
→ LICENSE_BOUND
→ EXECUTABLE_SUBJECT_RESOLVED?
    ├─ no  → EXECUTABLE_UNRESOLVED
    └─ yes → BINARY_CHECKSUM_BOUND
             → SBOM_BOUND
             → OCI_IMAGE_DIGEST_BOUND
             → PLATFORM_BOUND
             → WORKLOAD_POLICY_BOUND
             → DETERMINISTIC_ADMISSION_VALID
             → RUNSC_PLAN_RENDERED
             → POLICY_ADMITTED
             → DETERMINISTIC_MATRIX_PASS
```

Live states remain independent:

```text
runsc executable observed   NOT_EXERCISED
OCI container execution     NOT_EXERCISED
syscall/isolation evidence  NOT_EXERCISED
network isolation           NOT_EXERCISED
cleanup/residue             NOT_EXERCISED
provider registration       NOT_PERFORMED
Human Admit                 NOT_PERFORMED
release                     NOT_PERFORMED
```

## Data flow

```text
official immutable gVisor source/license
+ exact runsc version/checksum/SBOM subject
+ exact OCI image digest + Linux platform
+ workload/policy digest
+ closed argv/mount/network/resource surface
        ↓
DA-GV-C validate admission
        ↓
DA-GV-P enforce default-deny baseline
        ↓
DA-GV-A render runsc PLAN_ONLY argv
        ↓
deterministic observation fixture
        ↓
DA-GV-E convergence controls
        ↓
#173 trusted live executor only
        ↓
real runsc observation + cleanup receipt
        ↓
#44 aggregate convergence / Human Admit
```

## Complete deterministic denominator

PR #177 jointly covers:

```text
source_candidate_unresolved
deterministic_admission
runsc_plan_only
timeout_distinct
connection_unknown
policy_deny_all
policy_allowlist
filesystem_baseline
network_baseline
resource_baseline
cleanup_independent
live_states_not_exercised
shared_owner_separation
upstream_license_binding
```

The matrix also refuses sibling blob drift, denominator omission, upstream subject drift, source/fixture live promotion, shared-owner bypass, provider-health admission, cleanup-residue laundering, and plan/fixture isolation promotion.

## Hard architecture laws

- Source presence is not runsc binary admission.
- Binary version/checksum/SBOM and OCI image digest are mandatory before an executable subject is admitted.
- Deterministic fixture bytes are never live isolation evidence.
- Generated runsc argv is closed and plan-only; no shell string or caller-selected host cwd/path.
- Non-root/no-new-privileges, no host PID/IPC and logical mount classes are mandatory contract intent.
- Network intent is deny-all or explicit host:port allowlist; #95 owns real DNS/IP enforcement evidence.
- Provider health/package/config presence cannot become policy admission authority.
- Cleanup is an independent evidence lane and cannot be inferred from task success.
- Provider-private code cannot self-register, mutate shared status, or release; #44 remains sole convergence owner.
- PR #154 local sandbox evidence cannot proxy gVisor OCI isolation.

## Live frontier

Issue #173 is the next gVisor-specific transition and is `HUMAN_TRUSTED_AUTHORITY_REQUIRED / NOT_EXERCISED`.

It requires a real admitted host/runtime subject containing an installed `runsc` binary, exact checksum/version, SBOM/attestation evidence, exact OCI image digest, host kernel/platform, safe workload, policy/network subjects, timeout/cancel and residue inspection. Missing provider/runtime evidence stays `ABSENT` or `NOT_EXERCISED`.

Evidence ceiling for the current subtree: `COMPLETE_DETERMINISTIC_GVISOR_MATRIX_ONLY`.
