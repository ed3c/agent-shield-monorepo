# Intent ledger private source boundary

This directory inherits [`../README.md`](../README.md). Current implementation owns deterministic field validation, evidence ordering, intent digest, and reference threshold decision only.

```text
closed intent → canonical bytes → SHA-256 → deterministic reference PASS/FAIL receipt
```

Cross-module consumers use `security.intent/v1`. OPA/workflow/ledger/provider logic belongs to issues #55, #56, #58 and convergence #64, not this private source.
