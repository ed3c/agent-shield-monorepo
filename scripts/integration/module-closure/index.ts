export * from "./types.ts";
export * from "./resolver.ts";

// The resolver reads manifests it is handed. No Skills or runtime source projection, host
// adapter, origin, live canary or model carrier is exercised here.
export const moduleClosureState = {
  skillsProjection: "NOT_EXERCISED",
  runtimeBinding: "NOT_EXERCISED",
  hostAdapters: "NOT_EXERCISED",
  liveOrigin: "NOT_IMPLEMENTED",
} as const;
