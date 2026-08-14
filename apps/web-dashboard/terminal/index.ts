export * from "./types.ts";
export * from "./state-machine.ts";
export * from "./projection.ts";

// UX-TERM evidence boundary. This module proves projection behaviour against an admitted PTY
// subject only. Nothing here can raise these, and no live carrier is contacted.
export const terminalProjectionState = {
  ptySubject: "NOT_EXERCISED",
  liveAttach: "NOT_EXERCISED",
  signedInBrowser: "NOT_EXERCISED",
  productionIngress: "NOT_IMPLEMENTED",
} as const;
