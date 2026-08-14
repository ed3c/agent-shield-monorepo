# CLI/MCP parity generator

Issue [#69](https://github.com/ed3c/agent-shield-monorepo/issues/69) owns this leaf. It generates the externally exposed MCP tool surface from one canonical CLI policy and executes each call in a fresh immutable closure. No Claude or Codex carrier code, forge origin, credential or session belongs here.

## Parity is generation, not comparison

The tool surface is not written down twice and then checked. It is **generated** from the CLI catalog filtered by explicit policy, so a private command has no path to the surface at all. The remaining direction — a policy naming a command the CLI does not declare — is the one drift generation cannot rule out, so it fails loudly.

Default deny is what "filtered by policy" means: a command absent from the policy produces no tool, and an empty policy produces an empty surface.

## The carrier has no field to smuggle through

A request carries exactly one of an inline bundle, an artifact digest or a continuation step. There is no command, `cwd`, `env`, argv, private-flag or URL field anywhere in the request type, so those rejections are a property of the schema rather than a filter someone must maintain.

What a filter still has to catch is a **value** that is itself a path, a URL or a shell fragment inside a legitimately declared field. Nine shapes are controlled: absolute path, home path, Windows path, HTTPS URL, git URL, semicolon, pipe, command substitution and template interpolation.

## Exit and evidence pass through

The CLI's exit code must be one it declares, and its evidence state — `PASS`, `FAIL`, `ABSENT`, `NOT_EXERCISED` — reaches the caller unchanged. Nothing is remapped and nothing is folded, which is checked for all four states. An undeclared exit code is reported as invalid output **with the offending code still visible**, rather than hidden behind a generic failure.

## Cleanup is on every path

Success, limit, invalid output and execution failure all run cleanup, and its result overrides the outcome: a workspace that would not clean, or a port still holding a resource, turns any outcome into `FAILED_CLEANUP`. Each call materializes its own workspace, and two calls never share one.

## Evidence boundary

`FakeExecutionPort` is a deterministic in-memory fixture. `cliMcpParityState` carries no `PASS` and the compiler proves it. Parity PASS would prove the generated surface and the execution contract only — not Claude or Codex compatibility, model correctness, forge reachability, a signed-in browser, device or provider session, or release promotion.

## Human boundary

External tool admission, network, secret or mutation widening, live-repo apply, Human Admit, promotion and production rollback remain trusted-operator-only.
