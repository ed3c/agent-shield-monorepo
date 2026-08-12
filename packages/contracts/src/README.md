# Contracts private source boundary

This directory implements the public exports described by [`../README.md`](../README.md). It is the only source root for shared TypeScript contract bodies; consumers import the package entrypoint, not this private path.

```text
foundation issue → closed type/schema/validator → compatibility and mutation tests
  → public package export → module/consumer lock
```

Issues #38, #45, #54, and #65 own disjoint contract families and must coordinate shared exports/versioning. No provider execution, secret, session, host path, mutable ref, or evidence promotion belongs here.
