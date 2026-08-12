# Runtime fabric private source boundary

This directory inherits [`../README.md`](../README.md). The current source implements provider catalog/state receipts and the disposable local worktree subject.

```text
provider request → catalog lookup
  → local disposable isolation or named gap state
  → ProviderReceipt
```

Future provider private roots are owned by issues #39–#43 behind the SPI from #38. Do not couple providers to one another privately or edit public registry/status/release except through convergence #44.
