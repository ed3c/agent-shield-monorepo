import type { ProviderReceipt } from "../../../packages/contracts/src/index.ts";

export interface RuntimeProvider {
  id: string;
  scope: "local" | "cloud";
  state: ProviderReceipt["state"];
  capabilities: string[];
  credentialBoundary: "none" | "host-only" | "broker-only";
}

export const providers: RuntimeProvider[] = [
  { id: "local-disposable-worktree", scope: "local", state: "PASS", capabilities: ["immutable-ref", "isolated-worktree", "artifact-return"], credentialBoundary: "none" },
  { id: "apple-container", scope: "local", state: "NOT_EXERCISED", capabilities: ["container", "workspace-mount"], credentialBoundary: "host-only" },
  { id: "openshell-tmux-local", scope: "local", state: "NOT_EXERCISED", capabilities: ["policy-shell", "pty", "session-reconnect"], credentialBoundary: "host-only" },
  { id: "e2b-firecracker", scope: "cloud", state: "NOT_IMPLEMENTED", capabilities: ["microvm", "artifact-return", "checkpoint"], credentialBoundary: "broker-only" },
  { id: "cloudflare-computer", scope: "cloud", state: "NOT_IMPLEMENTED", capabilities: ["isolated-runtime", "artifact-return"], credentialBoundary: "broker-only" },
];

export function providerReceipt(id: string): ProviderReceipt {
  const provider = providers.find((candidate) => candidate.id === id);
  if (!provider) return { provider: id, scope: "local", state: "ABSENT", capabilities: [], subject: null, detail: "provider is not registered" };
  return {
    provider: provider.id,
    scope: provider.scope,
    state: provider.state,
    capabilities: provider.capabilities,
    subject: provider.state === "PASS" ? "deterministic-local-contract/v1" : null,
    detail: provider.state === "PASS" ? "deterministic provider contract exercised" : "host/provider live receipt is required",
  };
}
