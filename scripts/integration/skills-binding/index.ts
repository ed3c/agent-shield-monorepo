export * from "./types.ts";
export * from "./resolver.ts";

// The resolver reads a source description it is handed. No model carrier is invoked, no live
// host adapter is contacted and no canonical skills-shared body is modified.
export const skillsBindingState = {
  modelCarrier: "NOT_EXERCISED",
  liveHostAdapter: "NOT_EXERCISED",
  promptEffectiveness: "NOT_IMPLEMENTED",
} as const;
