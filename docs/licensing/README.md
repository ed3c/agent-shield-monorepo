# Dependency and commercial-use licensing policy

This directory owns architecture-level dependency admission. Tool-specific evidence such as Git Town lives with that tool and links back here.

## Objective

Minimize commercial distribution risk through exact-version, fail-closed review. Preferred direct license classes are MIT, Apache-2.0, BSD, and ISC, but the license name alone is never sufficient.

The repository does not promise “100% zero legal risk.” Legal interpretation, patents, trademarks, export controls, provider terms, data rights, and jurisdiction remain separate review dimensions.

## Admission sequence

```text
candidate capability
  → exact repository/package/artifact identity
  → direct license bytes
  → source availability and provenance
  → transitive dependency/SBOM review
  → NOTICE/attribution/patent/trademark obligations
  → compatibility with distribution mode
  → security/maintenance review
  → repository decision + Human Admit where required
```

## Default decision classes

| Class | Default |
|---|---|
| MIT / BSD / ISC | review exact bytes and transitive closure, then may admit |
| Apache-2.0 | same, plus NOTICE/patent handling |
| public-domain-style | verify exact text, jurisdiction and provenance |
| GPL / LGPL / AGPL | reject for the stated closed-commercial baseline unless dedicated legal/architecture Human Admit |
| MPL / EPL / CDDL | reject by default pending file/module-level obligation review |
| SSPL / BSL / source-available / field-of-use | reject by default |
| custom / dual / unknown / missing | fail closed |
| hosted service terms | review separately from source license |

## Evidence states

- a source table naming a license: `SOURCE_PROPOSAL`;
- direct upstream license bytes checked: direct-license evidence only;
- package install succeeds: no license evidence;
- SBOM/transitive scan passes: dependency-closure evidence for that artifact;
- organization counsel approves distribution: organization-owned Human Admit.

## Current source treatment

Source `S-001` requests a permissive-only architecture and explicitly excludes LGPL/GPL/AGPL/SSPL/BSL. Agent Shield adopts this as a conservative baseline, but every proposed component remains unadmitted until its current exact version and closure are reviewed.

## Related documents

- `docs/sources/SOURCE_LEDGER.md`
- `docs/intent/PROJECT_INTENT.md` (`INT-002`)
- `docs/git/GIT_TOWN_ADMISSION.md`
- issue #17 (this policy)
- implementation issues #3–#6 for provider-specific dependency admission
