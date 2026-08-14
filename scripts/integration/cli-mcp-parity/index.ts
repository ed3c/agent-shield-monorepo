export * from "./types.ts";
export * from "./generator.ts";
export * from "./fake-port.ts";

// The generator reads a CLI catalog and a policy it is handed, and executes through a port.
// No Claude or Codex carrier, forge, browser session or provider is contacted.
export const cliMcpParityState = {
  claudeCarrier: "NOT_EXERCISED",
  codexCarrier: "NOT_EXERCISED",
  forgeReachability: "NOT_EXERCISED",
  releasePromotion: "NOT_IMPLEMENTED",
} as const;
