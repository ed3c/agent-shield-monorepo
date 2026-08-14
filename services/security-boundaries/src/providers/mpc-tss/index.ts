export * from "./types.ts";
export * from "./sealed-share.ts";
export * from "./provider.ts";
export * from "./fake-transport.ts";

// No audited MPC library, protocol round, key ceremony, signature or independent vector suite
// has been exercised. The boundary in this directory -- admission, thresholds, message binding,
// epoch revocation, abort and cleanup -- is real and tested; the cryptography is not, and no
// arrangement of these files can claim otherwise.
export const mpcProviderState = {
  auditedLibrary: "NOT_EXERCISED",
  protocolRounds: "NOT_EXERCISED",
  independentVectorSuite: "NOT_EXERCISED",
  keyCeremony: "NOT_EXERCISED",
  productionSigning: "NOT_IMPLEMENTED",
  hardwareBackedShares: "NOT_IMPLEMENTED",
} as const;
