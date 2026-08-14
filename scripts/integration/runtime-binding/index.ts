export * from "./types.ts";
export * from "./resolver.ts";

// The resolver reads a catalog description it is handed. No host broker, carrier session,
// provider or workload execution is exercised.
export const runtimeBindingState = {
  hostValuePresence: "NOT_EXERCISED",
  carrierAuthentication: "NOT_EXERCISED",
  providerAvailability: "NOT_EXERCISED",
  workloadExecution: "NOT_IMPLEMENTED",
} as const;
