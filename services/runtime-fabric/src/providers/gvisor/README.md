# gVisor / runsc provider contract

Status: deterministic provider-admission candidate for #168 under parent #147. This directory does **not** execute `runsc`, an OCI container, network isolation, or a provider credential.

## Exact upstream source candidate

```text
repository   google/gvisor
commit       09329f4f5677c3b2492a40ea816a6899d03bcbd1
tree         f5714e427eb5e9d93e2b7e4e5a994dec5a90bcfb
LICENSE blob f7a006d10464cfe9724b5d687c0013bf982cc66a
source license Apache-2.0
```

The upstream LICENSE also notes files that carry other permissive notices. This candidate therefore preserves `thirdPartyLicenseNoticeRequired=true`; source-license identification is not a substitute for a binary/SBOM review.

## Authority

```text
existing Phase-3 runtime SPI #38
        ↓
DA-GV-C provider admission
        ↓
runsc adapter #169
+ isolation policy #170
        ↓
#171 deterministic matrix
        ↓
#172 docs/read route
        ↓
#173 live runsc isolation
        ↓
#44 shared runtime convergence / Human Admit
```

Provider-private code never writes the #44-owned shared registry, integration status, or release manifest.

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
```

Live states remain separate:

```text
runsc execution        NOT_EXERCISED
OCI isolation          NOT_EXERCISED
network isolation      NOT_EXERCISED
cleanup/residue        NOT_EXERCISED
provider registration  NOT_PERFORMED
release                NOT_PERFORMED
```

## Policy surface

The deterministic contract requires:

- closed argv; no shell string;
- non-root uid/gid, `noNewPrivileges=true`, `privileged=false`;
- no host PID/IPC sharing;
- mounts only from logical `WORKSPACE`, `DECLARED_INPUT`, or `TMPFS` classes;
- deny-all or exact host:port network intent;
- explicit CPU, memory, PID, timeout, output and artifact bounds;
- independent cleanup evidence.

This expresses admission intent only. It does not prove that a host kernel/runsc installation enforced those constraints.

## Evidence boundary

`google/gvisor` source bytes and LICENSE establish an immutable source candidate. A deterministic fixture can prove shape/refusal semantics. Neither proves an installed `runsc` binary, SBOM provenance, OCI execution, network enforcement, syscall isolation, cleanup, or production security.

Evidence ceiling: `DETERMINISTIC_GVISOR_PROVIDER_CONTRACT_ONLY`.
