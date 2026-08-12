# Intent-ledger source boundary

This leaf inherits [`../README.md`](../README.md), root `AGENTS.md`, and module `security-boundaries`. It owns the deterministic TypeScript intent canonicalization and MVP limit decision used as a falsifiable contract, not a production policy engine or ledger.

Inputs are closed intent fields; output is a `RiskDecision` containing `PASS`/`FAIL`, reason, and digest. Other modules use typed results rather than importing this private path.

Do not add OPA, LLM semantics, durable storage, custody, settlement, or human/hardware approval claims here without separate modules and evidence. A deterministic limit green does not proxy for production risk policy. Issue #19 / evals `E30.1`–`E30.4` govern this README.
