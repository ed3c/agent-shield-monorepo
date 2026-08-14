export * from "./types.ts";
export * from "./provider.ts";
export * from "./fake-port.ts";

// No macOS host, Xcode toolchain, signing identity, WebDriverAgent build, simulator or
// physical iOS device has been exercised. Every state below is a claim about this repository,
// not about a host that might one day run it.
export const wdaProviderState = {
  toolchainArtifact: "NOT_EXERCISED",
  simulatorProjection: "NOT_EXERCISED",
  deviceProjection: "NOT_EXERCISED",
  signingIdentity: "NOT_IMPLEMENTED",
  cloudMacHost: "NOT_IMPLEMENTED",
} as const;
