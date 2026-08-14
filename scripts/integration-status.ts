#!/usr/bin/env bun
// `data/status/integration.json` is the status the epics delegate to (#2 through #6 all say their
// state is "exactly as recorded by" it), but it was last written by #1 and nothing bound it to the
// receipts the code actually emits. Three hand-written copies of the same states -- this file, the
// provider/adapter/capability catalogues, and the assertions in selftest.ts -- could disagree
// without anything going red. This derives the file from the receipts instead.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ingest } from "../services/document-ingest/src/index.ts";
import { routeResearch } from "../services/research-orchestrator/src/index.ts";
import { providerReceipt } from "../services/runtime-fabric/src/index.ts";
import { adapterReceipt } from "../services/mobile-automation/src/index.ts";
import { securityCapabilities } from "../services/security-boundaries/src/index.ts";
import type { BrowserWorkflowRequest } from "../packages/contracts/src/index.ts";

export type IntegrationState = "PASS" | "FAIL" | "ABSENT" | "NOT_IMPLEMENTED" | "NOT_EXERCISED";

/**
 * A key covering several receipts is only honest while they agree. Reducing a mixed group to its
 * weakest member would let one implemented adapter hide behind three unexercised ones, and
 * `README.md` already requires the opposite -- keep states separate, no product-state promotion.
 * So a divergence refuses and asks for the key to be split, rather than quietly collapsing.
 *
 * Every group is uniform today, which is exactly why there is no reduction here: a collapse rule
 * with no production case that exercises it is untested logic waiting to be wrong.
 */
function agreed(key: string, states: readonly IntegrationState[]): IntegrationState {
  if (states.length === 0) throw new Error(`${key} aggregates no receipt`);
  const distinct = [...new Set(states)];
  if (distinct.length > 1) throw new Error(`${key} aggregates receipts that disagree (${distinct.sort().join("/")}); split the key`);
  return distinct[0]!;
}

/**
 * Status keys with no code receipt behind them. Listing them is the point: a key that is neither
 * derived nor listed here is refused, so a new hand-written status claim cannot slip in unnoticed.
 */
export const UNSOURCED: Readonly<Record<string, string>> = {
  "bettor-consumer": "the consumer is two scripts against a private repository; its state is a live-lane claim, not a receipt",
};

/** Live lanes are exercised by Phase 6 issues #70 through #74, not by any local receipt. */
export const UNSOURCED_LIVE = "no local receipt can establish a live lane; #70 through #74 own these";

export function derivedModuleStates(): Record<string, IntegrationState> {
  const root = mkdtempSync(join(tmpdir(), "agent-shield-status-"));
  try {
    const text = join(root, "input.txt");
    writeFileSync(text, "status derivation fixture\n");
    const pdf = join(root, "input.pdf");
    writeFileSync(pdf, "%PDF-1.7 fixture");
    const ingested = ingest({ path: text, mediaType: "text/plain", provider: "local" });
    // Route with the artifact the ingest actually produced rather than a fabricated ref, so the
    // derived states come from one connected pass instead of two unrelated fixtures.
    const inputRef = ingested.artifacts[0]!;
    const research = (workflow: BrowserWorkflowRequest["workflow"], environment: "local" | "cloud"): IntegrationState =>
      routeResearch({ workflow, inputRef, environment }).state as IntegrationState;
    return {
      "document-ingest-text": ingested.state,
      "document-ingest-pdf": ingest({ path: pdf, mediaType: "application/pdf", provider: "local" }).state,
      "research-external-verify": research("external-verify", "cloud"),
      "research-dr-signed-in-stage1": research("dr-research-loop", "local"),
      "research-gcr-local": research("gemini-conversation-research", "local"),
      "research-gcr-cloud": research("gemini-conversation-research", "cloud"),
      "runtime-local-disposable": providerReceipt("local-disposable-worktree").state as IntegrationState,
      "runtime-apple-container": providerReceipt("apple-container").state as IntegrationState,
      "runtime-openshell-tmux": providerReceipt("openshell-tmux-local").state as IntegrationState,
      "runtime-e2b": agreed("runtime-e2b", [providerReceipt("e2b-firecracker").state, providerReceipt("cloudflare-computer").state] as IntegrationState[]),
      "product-expo": adapterReceipt("expo-mobile").state as IntegrationState,
      "product-maestro-wda-scrcpy": agreed("product-maestro-wda-scrcpy", ["maestro", "wda", "scrcpy"].map((id) => adapterReceipt(id).state) as IntegrationState[]),
      "security-native-providers": agreed("security-native-providers", securityCapabilities.map((item) => item.state) as IntegrationState[]),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Refuses when the published status and the receipts disagree, in either direction. */
export function integrationStatusRefusals(published: { modules: Record<string, string>; live: Record<string, string> }): string[] {
  const derived = derivedModuleStates();
  const refusals: string[] = [];

  for (const [key, state] of Object.entries(derived)) {
    const claimed = published.modules[key];
    if (claimed === undefined) refusals.push(`the receipts derive ${key}=${state}, which the published status omits`);
    else if (claimed !== state) refusals.push(`the published status claims ${key}=${claimed} while the receipts emit ${state}`);
  }

  for (const key of Object.keys(published.modules)) {
    if (key in derived || key in UNSOURCED) continue;
    refusals.push(`the published status claims ${key} with no receipt behind it and no recorded reason`);
  }

  // Overclaim floor: no unbound native, cloud or live lane may reach PASS, whatever the catalogues
  // say. A coordinated edit of both copies still cannot promote one quietly.
  for (const [lane, state] of Object.entries(published.live)) {
    if (state === "PASS") refusals.push(`live lane ${lane} claims PASS; ${UNSOURCED_LIVE}`);
  }

  return refusals;
}
