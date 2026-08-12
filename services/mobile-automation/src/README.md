# Mobile automation private source boundary

This directory inherits [`../README.md`](../README.md). Current code is an adapter-state catalog only; it does not run a simulator/device/tool.

```text
adapter/platform request → catalog lookup → exact NOT_EXERCISED/NOT_IMPLEMENTED/ABSENT receipt
```

Provider roots introduced by #50–#52 remain isolated behind #45 contracts. Shared registry/status/release promotion belongs to #53. Do not add raw CLI/ADB/WDA/shell passthrough or host session values.
