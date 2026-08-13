# CONTEXT.md — Agent Shield current handoff

Agent Shield is the Domain Product / Reference Consumer Plane in the four-repository system.

```text
skills-shared procedures
→ runtime-env secret-free runtime closure
→ bettor-arena module/Skill/runtime composition and stateless execution
→ Agent Shield product/provider state machines and canaries
→ bettor acceptance and Human promotion
```

## Current state

- Documentation, state-machine, traceability, eval, Git Town, and molecular Phase 3–6 plans exist.
- Current product/provider states remain machine-owned by [`data/status/integration.json`](data/status/integration.json).
- Module release identity remains in [`data/releases/agent-shield-module-set.json`](data/releases/agent-shield-module-set.json).
- Common same-name document routes are being bound under issue `#77`, parent `ed3c/bettor-arena#35`.
- The documentation route does not change product/runtime code or upgrade any provider state.
- A mechanical four-repository cold-start/route checker remains `NOT_IMPLEMENTED` until a later convergence issue/PR supplies it.

Read [`docs/state-machines/README.md`](docs/state-machines/README.md), [`docs/implementation/STACKED_IMPLEMENTATION_PLAN.md`](docs/implementation/STACKED_IMPLEMENTATION_PLAN.md), and [`docs/traceability/STATE_MACHINE_INDEX.md`](docs/traceability/STATE_MACHINE_INDEX.md) for detailed current ownership.
