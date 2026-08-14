# OpenShell upstream evidence boundary

Observed source subject:

```text
repository: https://github.com/NVIDIA/OpenShell
commit:     c4b500a7de64d0b66e3ee8098f58d14299092162
license:    Apache-2.0 at repository metadata and SPDX-marked policy example
channel:    dev prerelease
```

Repository decisions:

- Use the upstream source commit and policy example as a schema/reference input.
- Preserve filesystem/process as creation-locked static domains.
- Preserve network/inference as dynamic domains eligible for hot reload when the static digest is unchanged.
- Keep credentials outside policy bytes as opaque broker bindings.
- Treat the observed mutable `dev` prerelease, artifact provenance, transitive SBOM, notices, legal acceptance, live attach/detach, and production behavior as `NOT_EXERCISED` or unadmitted.
- Do not infer syscall, Bash-regex, provider, sandbox, or security-audit evidence from a compiled policy document.

This file is an external-source record, not executable admission or a promise of zero legal/security risk.
