export * from "./types.ts";
export * from "./state-machine.ts";
export * from "./view-model.ts";
export * from "./actions.ts";

// UX-WEB-008. Package presence is not a build, a deployment or a browser result. These stay
// NOT_EXERCISED until a disposable preview canary runs and leaves a receipt, and nothing in
// this source can raise them.
export const dashboardState = {
  framework: "bun-typescript-projection",
  genui: "NOT_EXERCISED",
  terminal: "NOT_EXERCISED",
  bettorMcp: "NOT_INITIALIZED",
  build: "NOT_EXERCISED",
  previewCanary: "NOT_EXERCISED",
  cloudDeployment: "NOT_IMPLEMENTED",
} as const;
