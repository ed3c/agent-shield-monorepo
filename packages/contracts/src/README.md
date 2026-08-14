# Contracts private source boundary

This directory implements the public exports described by [`../README.md`](../README.md). It is the only source root for shared TypeScript contract bodies; external consumers use package exports rather than private file paths.

```text
foundation issue → closed type/schema/validator → compatibility and mutation tests
  → public package export → module/consumer lock
```

Current source families:

- `index.ts` — existing baseline evidence, artifact, module, browser, provider, product, and security receipt types;
- `runtime/` — issue #38's closed runtime request/provider/receipt contracts, repaired by #93, exported as `@agent-shield/contracts/runtime`;
- `exchange/` — issue #43's local/cloud exchange request/receipt contracts;
- `product/` — issue #45's product action, accessibility, projection, automation and receipt contracts.

This list is the family index, and an index fails one way only: a dead entry is caught the first time someone follows it, while a missing entry is invisible. `exchange/` was present in the tree without an entry here until #45 added one. Add the row in the same PR that adds the family.

Issues #38, #45, #54, and #65 own disjoint contract families and must coordinate shared exports/versioning. The root export remains unchanged in #38; aggregate interface/module/status/release promotion belongs to the owning convergence issue. No provider execution, secret value, session, host path, mutable ref, generic shell, or evidence promotion belongs here.
