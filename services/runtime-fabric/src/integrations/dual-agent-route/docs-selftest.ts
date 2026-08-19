import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "services/runtime-fabric/src/integrations/dual-agent-route");
const EXPECTED = new Map([
  ["DA-INT-C", ["1250b096b53b8d114425a3618e91137090f0778a", "6b9537b00450a43d0e9bcf1b1ae6c4a2e441c67c", 32277843350]],
  ["DA-INT-API", ["ae7d891a12df49a76c8d86be84655cecc147c395", "71a93c3e8e04e0f2117238bb34cd23085aecd032", 32278074448]],
  ["DA-INT-BR", ["637316981191e629a9e569710a6b9dbe6d9bd471", "486078cf2d569df407c8d9b638ab81542bfdea57", 32278561508]],
  ["DA-INT-POL", ["8abd109b12c5cc69fab7fb207e9f974974a46a8d", "7bfdc5bb330973f7dd9485d3fe290a48955120a8", 32278411221]],
  ["DA-INT-E", ["a88951c53e03e0fb5a54ed59d531e8cc3de87930", "a346d91987e0aa71333b0d2fd96822b2ccb9d92b", 32279002352]],
] as const);
const REQUIRED = new Set([
  "api_first_read", "api_write_readback", "api_timeout_unknown",
  "fallback_api_absent", "fallback_api_refused", "fallback_api_not_admitted",
  "fallback_api_unsupported_action", "browser_write_readback", "browser_timeout_unknown",
  "policy_authority_separation", "route_evidence_separation", "effect_authority_preserved",
  "cleanup_separation",
]);

class DocsError extends Error {
  constructor(public readonly code: string, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

function refuse(code: string, detail = ""): never {
  throw new DocsError(code, detail);
}

function expect(code: string, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof DocsError && error.code === code) {
      console.log(`${code}: RED/${code}`);
      return;
    }
    throw error;
  }
  throw new Error(`${code}: planted control survived`);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function verify(index: any, readme: string, agents: string): void {
  if (index?.schema !== "agent-shield/dual-agent-route/stack-index/v1" || index.parent_issue !== 144) refuse("STACK_INDEX_SCHEMA_DRIFT");
  if (index.shared_runtime_convergence_owner !== 44) refuse("SHARED_OWNER_DRIFT");
  if (index.docs_issue !== 160 || index.docs_subject_state !== "CANDIDATE_SUBJECT_PENDING") refuse("DOCS_SELF_PROMOTION");
  const effect = index.authority?.effect;
  if (
    effect?.repository !== "ed3c/bettor-arena" || effect?.pr !== 216 ||
    effect?.commit !== "f9b64994979042fc3726c524944a61da4f9cb8b5" ||
    effect?.tree !== "e0f0ff4bf0b55627b420ace027043c3b7fee5d1d" ||
    effect?.writer !== "dual-agent-effect-ledger"
  ) refuse("EFFECT_AUTHORITY_DRIFT");
  if (index.authority?.provider_canonical_write !== "FORBIDDEN") refuse("PROVIDER_SELF_COMMIT");

  if (!Array.isArray(index.nodes) || index.nodes.length !== EXPECTED.size) refuse("EXACT_SUBJECT_DRIFT");
  for (const [atom, expected] of EXPECTED) {
    const node = index.nodes.find((item: any) => item.atom === atom);
    if (!node || node.head !== expected[0] || node.tree !== expected[1] || node.targeted_run !== expected[2]) refuse("EXACT_SUBJECT_DRIFT", atom);
    if (!String(node.state).includes("PASS")) refuse("DETERMINISTIC_STATE_DRIFT", atom);
  }
  const root = index.nodes.find((item: any) => item.atom === "DA-INT-C");
  const browser = index.nodes.find((item: any) => item.atom === "DA-INT-BR");
  if (root?.retained_failure?.run !== 32277516417 || browser?.retained_failure?.run !== 32278264809) refuse("FAILURE_HISTORY_ERASED");

  const denominator = index.complete_denominator;
  if (!Array.isArray(denominator) || new Set(denominator).size !== REQUIRED.size || ![...REQUIRED].every((item) => denominator.includes(item))) {
    refuse("DENOMINATOR_DRIFT");
  }
  const live = index.live_frontier;
  if (live?.issue !== 161 || live?.state !== "HUMAN_TRUSTED_AUTHORITY_REQUIRED") refuse("LIVE_FRONTIER_DRIFT");
  for (const key of ["live_api", "live_browser", "credential_resolution", "provider_effect", "target_readback", "user_outcome"] as const) {
    if (live?.[key] !== "NOT_EXERCISED") refuse("LIVE_PROMOTION", key);
  }
  if (live?.release !== "NOT_PERFORMED") refuse("LIVE_PROMOTION", "release");
  if (index.separate_provider_frontiers?.gvisor_issue !== 147 || index.separate_provider_frontiers?.relationship !== "SEPARATE_PROVIDER_ISOLATION_SIBLING") {
    refuse("PROVIDER_BOUNDARY_DRIFT");
  }
  if (index.evidence_ceiling !== "COMPLETE_DETERMINISTIC_ROUTE_MATRIX_ONLY") refuse("EVIDENCE_CEILING_DRIFT");

  for (const token of [
    "API and BROWSER receipts are separate facts",
    "RESULT_UNKNOWN",
    "Shared runtime registry/status/release remains #44-owned",
    "Issue #161",
    "NOT_EXERCISED",
  ]) {
    if (!readme.includes(token)) refuse("README_ROUTE_INCOMPLETE", token);
  }
  for (const token of [
    "API receipt          != BROWSER receipt",
    "shared runtime status/release  agent-shield issue #44 owner only",
    "Human/live route admission     issue #161",
    "#147 gVisor",
  ]) {
    if (!agents.includes(token)) refuse("AGENT_ROUTE_INCOMPLETE", token);
  }
}

const index = JSON.parse(String(readFileSync(join(ROOT, "stack-index.json"), "utf8")));
const readme = String(readFileSync(join(ROOT, "README.md"), "utf8"));
const agents = String(readFileSync(join(ROOT, "AGENTS.md"), "utf8"));
verify(index, readme, agents);
console.log("P1: PASS exact deterministic Stack/read-route convergence");

const writer = clone(index); writer.authority.effect.writer = "provider-demo";
expect("EFFECT_AUTHORITY_DRIFT", () => verify(writer, readme, agents));

const owner = clone(index); owner.shared_runtime_convergence_owner = 160;
expect("SHARED_OWNER_DRIFT", () => verify(owner, readme, agents));

const live = clone(index); live.live_frontier.live_api = "PASS";
expect("LIVE_PROMOTION", () => verify(live, readme, agents));

const subject = clone(index); subject.nodes[0].head = "0".repeat(40);
expect("EXACT_SUBJECT_DRIFT", () => verify(subject, readme, agents));

const failure = clone(index); delete failure.nodes.find((item: any) => item.atom === "DA-INT-BR").retained_failure;
expect("FAILURE_HISTORY_ERASED", () => verify(failure, readme, agents));

const denominator = clone(index); denominator.complete_denominator.pop();
expect("DENOMINATOR_DRIFT", () => verify(denominator, readme, agents));

const gvisor = clone(index); gvisor.separate_provider_frontiers.relationship = "ROUTE_EVIDENCE";
expect("PROVIDER_BOUNDARY_DRIFT", () => verify(gvisor, readme, agents));

const promotedDocs = clone(index); promotedDocs.docs_subject_state = "RELEASED";
expect("DOCS_SELF_PROMOTION", () => verify(promotedDocs, readme, agents));

const providerWrite = clone(index); providerWrite.authority.provider_canonical_write = "ALLOWED";
expect("PROVIDER_SELF_COMMIT", () => verify(providerWrite, readme, agents));

console.log("PASS: DA-INT-D Agent/read-route traceability controls");
