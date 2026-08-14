export * from "./types.ts";
export * from "./bridge.ts";
export * from "./fake-app-port.ts";

// UX-BRIDGE-007. The files that ship inside the mobile runtime. The selftest reads each of
// these and requires that none of them names a server-only host primitive; the list of
// forbidden tokens lives there, deliberately spelled out only in a file that does not ship.
//
// The scan is a plain substring match, so it has no false negatives -- and it does not spare
// comments. That is why nothing in this directory's shipped files names one of those tokens
// even in prose: an exemption for comments is an exemption an import can hide behind.
//
// Keeping the list here means adding a runtime file is a decision that shows up in this file,
// rather than one that quietly escapes the scan.
export const SHIPPED_RUNTIME_FILES = ["types.ts", "bridge.ts", "index.ts"] as const;

// No device, simulator, Expo build, Hermes/JSC runtime or store submission has been exercised.
// The bridge protocol below is real and tested; the mobile runtime it will one day run inside
// is not, and no arrangement of these files can claim otherwise.
export const bridgeProviderState = {
  protocolBoundary: "NOT_EXERCISED",
  hermesRuntime: "NOT_EXERCISED",
  iosCanary: "NOT_EXERCISED",
  androidCanary: "NOT_EXERCISED",
  storeCompliance: "NOT_IMPLEMENTED",
} as const;
