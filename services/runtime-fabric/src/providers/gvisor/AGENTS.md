# AGENTS — gVisor provider/isolation subtree

Read `README.md` then `stack-index.json` before editing implementation bytes.

## Authority map

```text
Phase-3 runtime SPI                    issue #38
provider-private gVisor contract       issue #168 / PR #174
runsc plan/observation boundary        issue #169 / PR #175
gVisor policy admission                issue #170 / PR #176
deterministic mutation convergence     issue #171 / PR #177
this docs/read-route convergence        issue #172 / PR #178
live runsc OCI evidence                issue #173
DNS/IP live-network evidence           issue #95
local sandbox/capability evidence      PR #154 / issue #153
shared runtime registry/status/release issue #44 only
```

No provider-private file may write `services/runtime-fabric/src/index.ts`, `.arena/modules/runtime-fabric/**`, `data/status/integration.json`, or `data/releases/agent-shield-module-set.json`.

## Exact upstream source binding

```text
google/gvisor
commit 09329f4f5677c3b2492a40ea816a6899d03bcbd1
tree   f5714e427eb5e9d93e2b7e4e5a994dec5a90bcfb
LICENSE blob f7a006d10464cfe9724b5d687c0013bf982cc66a
license Apache-2.0
third-party notice review required
```

Never replace these immutable source bytes with `master`, `latest`, a tag, package presence, or a locally observed binary without a new exact-subject admission.

## Evidence laws

```text
source commit/license        != runsc binary admission
binary/package presence      != OCI isolation PASS
deterministic fixture        != live provider PASS
policy validation            != kernel/network enforcement
runsc launch plan            != runsc process execution
local sandbox PR #154        != gVisor isolation
#95 live network receipt     != gVisor syscall/filesystem isolation
task success                 != cleanup success
provider observation         != #44 shared status/release promotion
```

`NOT_EXERCISED`, `ABSENT`, `FAILED_EXECUTION`, `TIMED_OUT`, `CANCELLED`, `RESULT_UNKNOWN`, cleanup failure and PASS stay distinct.

## Path/Stack laws

- #169 and #170 are siblings because both consume #168 bytes but not each other.
- #171 uses #174 as its actual Git base and materializes #175/#176 exact blobs; process inputs are not fake multi-parent ancestry.
- #172 is the sole gVisor subtree README/AGENTS/Stack convergence writer.
- #44 remains the only shared Phase-3 registry/status/release convergence writer.
- #173 is live/Human-owned; do not create a ceremonial implementation branch solely to represent pending live evidence.

## Stop conditions

STOP and rebind if any of these changes:

- repository `main` or any exact PR head/tree consumed by the task;
- official gVisor source/license subject;
- Phase-3 runtime SPI semantics;
- #44 shared path ownership;
- #95/#154/#173 evidence ownership;
- binary/SBOM/image identity requirements;
- an overlapping writer appears under `services/runtime-fabric/src/providers/gvisor/**`.

## Live handoff

#173 requires trusted/local execution. The executor must bind exact installed runsc version + sha256, SBOM/attestation evidence, OCI image digest, kernel/platform, workload/policy/network subject, then exercise safe non-production isolation, timeout/cancel and cleanup mutations. Credentials, host secrets and private runtime identities stay outside Git/logs/portable receipts.

The only permitted deterministic evidence ceiling in this subtree is `COMPLETE_DETERMINISTIC_GVISOR_MATRIX_ONLY` until #173 returns real subject-bound receipts and #44/Human admission occurs.
