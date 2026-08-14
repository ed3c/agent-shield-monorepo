#!/usr/bin/env bun
// Evidence states for one eval are restated by hand in six documents. Nothing checked that the
// restatements agree with the admission that owns the eval, so three of them stayed frozen at
// `NOT_EXERCISED` after the canaries ran. This refuses that drift.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const EVIDENCE_STATES = ["PASS", "FAIL", "ABSENT", "NOT_IMPLEMENTED", "NOT_EXERCISED", "SKIPPED_BY_POLICY"] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

// Each eval is admitted by exactly one document. Everything else restates it.
// #31 splits Phase A (the artifact) from Phase B (the runtime canaries), and so do the owners.
export const EVAL_OWNERS: Readonly<Record<string, string>> = {
  "GT-LIVE-001": "third_party/git-town/V24_DEPENDENCY_ADMISSION.md",
  "GT-LIVE-002": "docs/git/GIT_TOWN_ADMISSION.md",
  "GT-LIVE-003": "docs/git/GIT_TOWN_ADMISSION.md",
  "GT-LIVE-004": "docs/git/GIT_TOWN_ADMISSION.md",
  "GT-LIVE-005": "docs/git/GIT_TOWN_ADMISSION.md",
  "GT-LIVE-006": "docs/git/GIT_TOWN_ADMISSION.md",
};

const EVAL_ID = /GT-LIVE-\d{3}/g;

/** States asserted on one line. A line naming several subjects yields several. */
function statesOnLine(line: string): Set<EvidenceState> {
  return new Set(EVIDENCE_STATES.filter((state) => new RegExp(`\\b${state}\\b`).test(line)));
}

export type Claim = { file: string; line: number; evalId: string; states: Set<EvidenceState>; subjects: number };

export function collectClaims(root: string): Claim[] {
  const claims: Claim[] = [];
  const walk = (path: string): void => {
    for (const name of readdirSync(path)) {
      if ([".git", "node_modules", ".arena"].includes(name)) continue;
      const file = join(path, name);
      if (statSync(file).isDirectory()) {
        walk(file);
        continue;
      }
      if (!name.endsWith(".md")) continue;
      const lines: string[] = readFileSync(file, "utf8").split("\n");
      lines.forEach((line: string, index: number) => {
        const ids = new Set<string>(line.match(EVAL_ID) ?? []);
        if (ids.size === 0) return;
        const states = statesOnLine(line);
        if (states.size === 0) return;
        for (const evalId of ids) {
          claims.push({ file: file.slice(root.length + 1), line: index + 1, evalId, states, subjects: ids.size });
        }
      });
    }
  };
  walk(root);
  return claims;
}

/**
 * Refuses when a restatement disagrees with the document that owns the eval.
 *
 * Disagreement is *disjoint* state sets rather than inequality, because a line may legitimately
 * name several subjects at once ("macOS GT-LIVE-002..005 PASS; Linux ABSENT; attestation
 * NOT_EXERCISED"). Such a line is only weakly checked, and `weaklyChecked` reports which ones so
 * the weaker coverage is visible rather than silent.
 */
export function evidenceParityRefusals(root: string): { refusals: string[]; weaklyChecked: string[] } {
  const claims = collectClaims(root);
  const refusals: string[] = [];
  const weaklyChecked: string[] = [];

  const ownerStates = new Map<string, Set<EvidenceState>>();
  for (const claim of claims) {
    if (claim.file !== EVAL_OWNERS[claim.evalId]) continue;
    const merged = ownerStates.get(claim.evalId) ?? new Set<EvidenceState>();
    for (const state of claim.states) merged.add(state);
    ownerStates.set(claim.evalId, merged);
  }

  for (const [evalId, owner] of Object.entries(EVAL_OWNERS)) {
    if (!ownerStates.has(evalId)) refusals.push(`${evalId} is not recorded with a state by its owner ${owner}`);
  }

  for (const claim of claims) {
    const owner = EVAL_OWNERS[claim.evalId];
    if (owner === undefined) {
      refusals.push(`${claim.file}:${claim.line} claims a state for ${claim.evalId}, which no document owns`);
      continue;
    }
    // The owner is compared against itself too. That can never refuse -- its state set is the
    // union of its own claims -- so there is no skip here; a skip would be a guard that cannot fire.
    const admitted = ownerStates.get(claim.evalId);
    if (admitted === undefined) continue; // already refused above
    const shared = [...claim.states].filter((state) => admitted.has(state));
    if (shared.length === 0) {
      refusals.push(
        `${claim.file}:${claim.line} states ${evidenceStates(claim)} for ${claim.evalId}, but ${owner} admits ${[...admitted].sort().join("/")}`,
      );
      continue;
    }
    // Several ids with one state ("002 through 005 PASS") is precise. Several states on one line
    // is not: no parser can tell which state belongs to which subject.
    if (claim.states.size > 1) weaklyChecked.push(`${claim.file}:${claim.line} (${claim.evalId})`);
  }

  return { refusals, weaklyChecked };
}

function evidenceStates(claim: Claim): string {
  return [...claim.states].sort().join("/");
}

function main(): void {
  const root = process.cwd();
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const { refusals, weaklyChecked } = evidenceParityRefusals(root);
  for (const line of weaklyChecked) console.log(`weak    ${line} names several subjects; only checked for outright contradiction`);
  if (refusals.length > 0) {
    for (const refusal of refusals) console.error(`REFUSED ${refusal}`);
    process.exit(1);
  }
  console.log(`PASS evidence parity (${Object.keys(EVAL_OWNERS).length} evals, ${collectClaims(root).length} claims)`);
}

/** Proves the check goes red, rather than only that it goes green. */
function selftest(): void {
  const owner = "docs/git/GIT_TOWN_ADMISSION.md";
  const admitted = new Set<EvidenceState>(["PASS"]);
  const cases: Array<[string, Set<EvidenceState>, boolean]> = [
    ["a restatement repeating the owner", new Set<EvidenceState>(["PASS"]), false],
    ["a restatement frozen before the run", new Set<EvidenceState>(["NOT_EXERCISED"]), true],
    ["a restatement overclaiming absence as done", new Set<EvidenceState>(["NOT_IMPLEMENTED"]), true],
    ["a line naming several subjects", new Set<EvidenceState>(["PASS", "ABSENT", "NOT_EXERCISED"]), false],
  ];
  for (const [label, states, shouldRefuse] of cases) {
    const disjoint = [...states].every((state) => !admitted.has(state));
    if (disjoint !== shouldRefuse) throw new Error(`selftest failed: ${label}`);
  }
  if (statesOnLine("GT-LIVE-002 remains `NOT_EXERCISED`").size !== 1) throw new Error("selftest failed: single-state line");
  if (statesOnLine("macOS PASS; Linux `ABSENT`; attestation `NOT_EXERCISED`").size !== 3) throw new Error("selftest failed: multi-state line");
  if (statesOnLine("GT-LIVE-002 through GT-LIVE-006 may now run").size !== 0) throw new Error("selftest failed: stateless line");
  if (EVAL_OWNERS["GT-LIVE-001"] === EVAL_OWNERS["GT-LIVE-002"]) throw new Error("selftest failed: #31 Phase A and Phase B share an owner");
  console.log(`SELFTEST GREEN: evidence parity refuses ${cases.filter(([, , red]) => red).length} of ${cases.length} planted claims and ${owner} owns Phase B`);
}

// `verify.ts` imports this module, so main() must not run on import. The repo declares no
// dependencies and its node shim has no `import.meta`, so entry is detected from argv.
if ((process.argv[1] ?? "").endsWith("evidence-parity.ts")) main();
