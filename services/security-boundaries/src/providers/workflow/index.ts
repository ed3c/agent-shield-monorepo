export * from "./types.ts";
export * from "./workflow.ts";
export * from "./runtime.ts";
export * from "./fake-worker.ts";

// No Temporal server, Worker, namespace or live replay has been exercised. Workflow durability
// would not prove policy correctness, hardware authenticity, cryptography, ledger integrity or
// chain settlement in any case.
export const workflowProviderState = {
  sdkArtifact: "NOT_EXERCISED",
  liveWorker: "NOT_EXERCISED",
  serverReplay: "NOT_EXERCISED",
  productionNamespace: "NOT_IMPLEMENTED",
} as const;
