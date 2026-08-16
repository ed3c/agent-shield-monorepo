# Live network canary contract

This directory implements the repository-side contract for issue #95. It is deliberately split from provider execution.

State boundary:

```text
repository contract + exact subject + exact destination policy
  -> preflightLiveNetwork
  -> READY_FOR_LIVE_EXECUTION | REFUSED_PRECONDITION
  -> real admitted provider/environment executes outside this module
  -> provider observation
  -> validateLiveNetworkObservation
  -> structurally valid/invalid evidence + cleanup state
```

`READY_FOR_LIVE_EXECUTION` is not live evidence. Unit tests, fixtures, source presence and GitHub Actions cannot satisfy #95. A live receipt still has to come from an independently admitted provider/environment and retain the exact provider, environment, policy, workload and task-packet subjects.

The contract fails closed on direct-IP destinations, non-admitted host/port pairs, active proxy environment variables, malformed subject digests, stale policy epochs, absent DNS answers, forbidden resolved IP classes, invalid CNAMEs, malformed artifact digests and any process/workspace/session/network residue or cleanup-grace failure.

The validator intentionally does not mutate `data/status/integration.json`, release manifests or provider-private directories. Promotion and permission widening remain Human-owned.
