export * from "./types.ts";
export * from "./policy.ts";
export * from "./provider.ts";
export * from "./fake-engine.ts";

// The adapter is deterministic bytes only. No OPA binary, Rego bundle, network call or clock
// has been exercised, and nothing in this module can raise these.
export const opaProviderState = {
  engineArtifact: "NOT_EXERCISED",
  regoBundle: "NOT_EXERCISED",
  livePolicyDecision: "NOT_EXERCISED",
  policyPromotion: "NOT_IMPLEMENTED",
} as const;
