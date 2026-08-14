export * from "./types.ts";
export * from "./chain.ts";
export * from "./provider.ts";
export * from "./fake-ledger.ts";

// No immudb server, backup key, restore drill or chain anchor has been exercised. A ledger
// PASS would not prove L2 anchoring, reserve solvency, chain finality, signing authorization,
// database operational security or absolute tamper immunity in any case.
export const ledgerProviderState = {
  serverArtifact: "NOT_EXERCISED",
  liveAppend: "NOT_EXERCISED",
  restoreDrill: "NOT_EXERCISED",
  anchorSubmission: "NOT_IMPLEMENTED",
} as const;
