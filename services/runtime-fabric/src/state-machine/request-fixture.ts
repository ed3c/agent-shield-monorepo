import { validateRuntimeRequest, type RuntimeRequest } from "../../../../packages/contracts/src/runtime/index.ts";

export function requestValue(): Record<string, unknown> {
  return {
    schema: "agent-shield/runtime-request/v1",
    requestId: "rt-fnd-fixture",
    providerId: "fixture-provider",
    scope: "local",
    requiredCapabilities: ["fixture.echo"],
    source: {
      kind: "git",
      repository: "https://github.com/ed3c/agent-shield-monorepo",
      commit: "a".repeat(40),
      tree: "b".repeat(40),
    },
    workload: { id: "fixture.echo", version: "1.0.0", input: { value: "hello" } },
    environment: { allowedVariables: [] },
    network: { mode: "deny-all", allowlist: [] },
    secrets: [],
    limits: {
      timeoutMs: 1_000,
      cancellationGraceMs: 100,
      maxInputBytes: 1_024,
      maxOutputBytes: 4_096,
      maxArtifactBytes: 4_096,
      maxTouchedPaths: 8,
    },
    mutation: { writableRoots: ["workspace/output"], readOnlyRoots: ["workspace/input"] },
    artifacts: [{ kind: "log", required: true, maxBytes: 1_024, mediaTypes: ["text/plain"] }],
    cleanup: {
      processCleanup: "required",
      workspaceCleanup: "delete",
      sessionCleanup: "required",
      maxDurationMs: 1_000,
    },
    exclusions: ["live-provider", "performance", "cost"],
  };
}

export function request(): RuntimeRequest {
  return validateRuntimeRequest(requestValue());
}
