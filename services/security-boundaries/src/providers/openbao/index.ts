export * from "./sealed.ts";
export * from "./types.ts";
export * from "./provider.ts";
export * from "./fake-broker.ts";

// No OpenBao server, token, unseal ceremony or network call has been exercised, and nothing
// in this module can raise these.
export const openBaoProviderState = {
  serverArtifact: "NOT_EXERCISED",
  liveLease: "NOT_EXERCISED",
  unsealCeremony: "NOT_IMPLEMENTED",
  recoveryCeremony: "NOT_IMPLEMENTED",
} as const;
