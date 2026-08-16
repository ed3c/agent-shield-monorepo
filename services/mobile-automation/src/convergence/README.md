# Phase 4 product convergence

Issue #53 (Phase 4 / UX-90) — deterministic verifier and fail-closed aggregate.

This leaf consumes normalized receipts from #45–#52. It does not run a simulator, attach a
physical device, open a public listener or publish a store build. It verifies that any later
aggregate cannot hide a missing platform, proxy one target with another, merge In-App and
External MCP trust planes, bypass public capabilities with raw WDA/ADB/shell access, or convert
an unexercised lane into PASS.

The exact issue state machine is implemented through `HUMAN_REVIEW`. `ADMITTED` remains reachable
only from that resumable Human boundary; no deterministic function promotes it.

Key controls:

- every child pins its own artifact plus one common product contract digest;
- duplicate child receipts and duplicate action/accessibility ownership fail;
- web, terminal, iOS simulator, Android emulator, iOS device, Android device and cloud iOS are
  separate status lanes;
- every non-contract surface must distinguish waiting, denied, absent, not implemented,
  not exercised, failed and completed;
- In-App and External MCP are separate authenticated one-owner trust planes;
- automation and projection may use public target capabilities only, never generic/private/raw
  provider paths;
- reports, media, sockets, devices, processes, ports and leases must be accounted for;
- status and release claims are checked against receipts and capability-graph invalidation.

`productConvergenceState` contains no PASS. The deterministic tests prove refusal behavior; they
are not live web/mobile/device evidence.

```bash
bun test services/mobile-automation/src/convergence/convergence.test.ts
```
