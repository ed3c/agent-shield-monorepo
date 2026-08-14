export * from "./types.ts";
export * from "./provider.ts";
export * from "./fake-port.ts";

// No ADB server, scrcpy binary or server artifact, emulator, physical handset or USB/TCP
// transport has been exercised. Every state below is a claim about this repository, not about
// a host that might one day run it.
export const scrcpyProviderState = {
  toolArtifact: "NOT_EXERCISED",
  emulatorProjection: "NOT_EXERCISED",
  deviceProjection: "NOT_EXERCISED",
  cloudAndroidHost: "NOT_IMPLEMENTED",
} as const;
