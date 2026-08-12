# Document routing — Agent Shield binding

Agent Shield adopts the same route names as the other three repositories:

```text
README / AGENTS / CLAUDE
→ CONTEXT + ARCHITECTURE
→ docs/INDEX
→ nearest directory README
→ module/contract/status/script/test authority
→ traceability and live receipt
```

The canonical detailed owners already existed before this binding:

- state machines: [`../state-machines/README.md`](../state-machines/README.md)
- Stack PR plan: [`../implementation/STACKED_IMPLEMENTATION_PLAN.md`](../implementation/STACKED_IMPLEMENTATION_PLAN.md)
- reverse trace: [`../traceability/STATE_MACHINE_INDEX.md`](../traceability/STATE_MACHINE_INDEX.md)
- source claims: [`../sources/SOURCE_LEDGER.md`](../sources/SOURCE_LEDGER.md)

Standard route files summarize and forward; they do not copy these authorities.

Assertions:

- every governed directory has a nearest README or named inheritance;
- every route names local owner, machine authority, current state, evidence, and forbidden coupling;
- current state and planned architecture remain separate;
- no machine-local secret/session path enters portable docs;
- provider/source claims do not become PASS;
- Git Town sibling, true-child, terminal, convergence, and Human boundaries remain explicit;
- cross-repository facts use immutable releases/bindings/receipts, not mutable sibling checkouts.
