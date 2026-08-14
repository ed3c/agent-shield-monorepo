import { validateRuntimeRequest, type RuntimeRequest } from "../../../../packages/contracts/src/runtime/index.ts";

export function requestValue(): Record<string, unknown> {
  return {
    schema: "agent-shield/runtime-request/v1",
    requestId: "rt-fnd-fixture",
    providerId: "fixture-provider",
    providerVersion: "1.0.0",
    providerSubject: {
      kind: "source",
      id: "fixture-provider",
      version: "1.0.0",
      sha256: "1".repeat(64),
    },
    environmentSubject: {
      kind: "profile",
      id: "fixture-runtime-profile",
      version: "1.0.0",
      sha256: "2".repeat(64),
    },
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
      cancellationGraceMs: 20,
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

export function request(overrides: Record<string, unknown> = {}): RuntimeRequest {
  return validateRuntimeRequest({ ...requestValue(), ...overrides });
}
