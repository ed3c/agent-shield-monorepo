export * from "./types.ts";
export * from "./rules.ts";
export * from "./runner.ts";

// The validator reads a model and writes nothing. No network, no filesystem, no process.
export const docsGateState = {
  deterministicLane: "NOT_EXERCISED",
  githubMetadataLane: "NOT_EXERCISED",
  repositoryIngest: "NOT_IMPLEMENTED",
} as const;
