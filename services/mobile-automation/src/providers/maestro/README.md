# Maestro QA adapter

Issue [#50](https://github.com/ed3c/agent-shield-monorepo/issues/50) owns this leaf. It exposes a closed set of Maestro QA operations against an explicitly leased simulator and a content-addressed flow bundle. WDA and scrcpy remain separate siblings, and no app runtime bridge or convergence path belongs here.

## There is no path to attack

A flow is identified by an ID inside a bundle admitted by digest. **The request type has no `path` field**, so a traversal, a host absolute path, a remote URL or an injected YAML file outside the bundle cannot be expressed — QA-MAESTRO-003's controls target digest and identity drift, because those are the only failures the shape leaves reachable. The request field list is asserted exactly, so a future field that could hold a path fails the controls.

The exposed surface is generated from policy over the bundle's own flow IDs. A generic `run_flow(path)` is not something this contract can produce.

## A hollow flow cannot pass

Two separate rules, because they catch different defects:

- a flow whose bundle declares **no accessibility assertions** is refused before it runs;
- a run that completes having asserted **nothing** is a test failure, not a pass.

Both are controlled, and so is a planted failing assertion — which keeps its count and its artifacts in the receipt rather than being folded into a generic failure.

## One worker, one target

A lease is refused when it belongs to another worker, names another target, is not the lease the request named, or runs an iOS build on an Android target. Each is a separate control.

## Cleanup on every path

The lease is released on success, assertion failure, timeout, install failure and invalid flow alike, and a retained process or an unreleased lease turns any outcome into `FAILED_CLEANUP`.

## Artifacts are identities, not locations

A report, screenshot or video is a kind, a digest and a byte count. There is no path field for a host temp location to arrive in, and the artifact field list is asserted exactly. Size and count bounds are enforced.

## Evidence boundary

`FakeMaestroPort` is a deterministic in-memory fixture. No Maestro binary, simulator, emulator, device or app build has been exercised; `maestroProviderState` carries no `PASS` and the compiler proves it.
