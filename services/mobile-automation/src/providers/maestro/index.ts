export * from "./types.ts";
export * from "./provider.ts";
export * from "./fake-port.ts";

// No Maestro binary, simulator, emulator, device or app build has been exercised.
export const maestroProviderState = {
  cliArtifact: "NOT_EXERCISED",
  simulatorRun: "NOT_EXERCISED",
  deviceRun: "NOT_IMPLEMENTED",
  storeBuild: "NOT_IMPLEMENTED",
} as const;
