import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "services/runtime-fabric/src/providers/gvisor");
const EXPECTED = new Map([
  ["DA-GV-C", [168, 174, "8cc1bea3c307b3fd89de001173a90fea45e7d77a", "8d6fbbc6ac8e27188033779e2dc20d6aff363618", 32282011851]],
  ["DA-GV-A", [169, 175, "4402520edead7e5cb1fcbf1e3d8ae74977c243b7", "7ec3a90f12aebe55176018adc3d767a2b1bf26dc", 32282213765]],
  ["DA-GV-P", [170, 176, "2e7c2415b7b2f234a02a1239bdc0f2418b8cc1d6", "7e60143c3f529f5f5953c595051aaa320e7d7c9d", 32282337370]],
  ["DA-GV-E", [171, 177, "83f8cf90f84cee8f7d360fce8800c902bd5e9786", "029f6d174e5ed2a7a76150c5bb9e16ad2bd6c1bf", 32282711208]],
] as const);
const REQUIRED = new Set([
  "source_candidate_unresolved", "deterministic_admission", "runsc_plan_only",
  "timeout_distinct", "connection_unknown", "policy_deny_all", "policy_allowlist",
  "filesystem_baseline", "network_baseline", "resource_baseline", "cleanup_independent",
  "live_states_not_exercised", "shared_owner_separation", "upstream_license_binding",
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

function clone<T>(value: T): T { return structuredClone(value); }

function verify(index: any, readme: string, agents: string): void {
  if (index?.schema !== "agent-shield/gvisor/stack-index/v1" || index.parent_issue !== 147 || index.docs_issue !== 172 || index.docs_pr !== 178) refuse("STACK_INDEX_SCHEMA_DRIFT");
  if (index.docs_subject_state !== "DRAFT_CANDIDATE_EXTERNAL_READBACK") refuse("DOCS_SELF_PROMOTION");
  if (index.shared_runtime_convergence_owner !== 44 || index.authority?.shared_registry_status_release_owner !== 44) refuse("SHARED_OWNER_DRIFT");
  if (index.live_network_owner !== 95 || index.authority?.live_network_receipt_owner !== 95) refuse("LIVE_NETWORK_OWNER_DRIFT");
  if (index.local_sandbox_reference?.pr !== 154 || index.local_sandbox_reference?.relationship !== "INDEPENDENT_LOCAL_SANDBOX_EVIDENCE") refuse("SANDBOX_EVIDENCE_CONFLATION");

  const upstream = index.upstream;
  if (
    upstream?.repository !== "google/gvisor" ||
    upstream?.commit !== "09329f4f5677c3b2492a40ea816a6899d03bcbd1" ||
    upstream?.tree !== "f5714e427eb5e9d93e2b7e4e5a994dec5a90bcfb" ||
    upstream?.license_blob !== "f7a006d10464cfe9724b5d687c0013bf982cc66a" ||
    upstream?.license_id !== "Apache-2.0" ||
    upstream?.third_party_notice_review_required !== true
  ) refuse("UPSTREAM_SOURCE_LICENSE_DRIFT");

  if (!Array.isArray(index.nodes) || index.nodes.length !== EXPECTED.size) refuse("EXACT_SUBJECT_DRIFT");
  for (const [atom, expected] of EXPECTED) {
    const node = index.nodes.find((item: any) => item.atom === atom);
    if (!node || node.issue !== expected[0] || node.pr !== expected[1] || node.head !== expected[2] || node.tree !== expected[3] || node.targeted_run !== expected[4]) {
      refuse("EXACT_SUBJECT_DRIFT", atom);
    }
    if (node.state !== "DETERMINISTIC_PASS") refuse("DETERMINISTIC_STATE_DRIFT", atom);
  }

  const denominator = index.complete_denominator;
  if (!Array.isArray(denominator) || new Set(denominator).size !== REQUIRED.size || ![...REQUIRED].every((item) => denominator.includes(item))) refuse("DENOMINATOR_DRIFT");
  const live = index.live_frontier;
  if (live?.issue !== 173 || live?.state !== "HUMAN_TRUSTED_AUTHORITY_REQUIRED") refuse("LIVE_FRONTIER_DRIFT");
  for (const key of ["runsc_binary", "oci_execution", "syscall_isolation", "network_isolation", "cleanup"] as const) {
    if (live?.[key] !== "NOT_EXERCISED") refuse("LIVE_PROMOTION", key);
  }
  if (live?.provider_registration !== "NOT_PERFORMED" || live?.human_admit !== "NOT_PERFORMED" || live?.release !== "NOT_PERFORMED") refuse("LIVE_PROMOTION", "promotion");
  if (index.authority?.provider_private_shared_write !== "FORBIDDEN") refuse("PROVIDER_SELF_PROMOTION");
  if (index.evidence_ceiling !== "COMPLETE_DETERMINISTIC_GVISOR_MATRIX_ONLY") refuse("EVIDENCE_CEILING_DRIFT");

  for (const token of ["google/gvisor", "PR #177 / DA-GV-E", "#173 DA-GV-LIVE", "#44 shared runtime convergence", "#95", "PR #154", "NOT_EXERCISED", "COMPLETE_DETERMINISTIC_GVISOR_MATRIX_ONLY"]) {
    if (!readme.includes(token)) refuse("README_ROUTE_INCOMPLETE", token);
  }
  for (const token of ["issue #44 only", "issue #173", "issue #95", "PR #154", "source commit/license", "deterministic fixture", "COMPLETE_DETERMINISTIC_GVISOR_MATRIX_ONLY"]) {
    if (!agents.includes(token)) refuse("AGENT_ROUTE_INCOMPLETE", token);
  }
}

const index = JSON.parse(String(readFileSync(join(ROOT, "stack-index.json"), "utf8")));
const readme = String(readFileSync(join(ROOT, "README.md"), "utf8"));
const agents = String(readFileSync(join(ROOT, "AGENTS.md"), "utf8"));
verify(index, readme, agents);
console.log("P1: PASS exact gVisor Stack/read-route convergence");

const owner = clone(index); owner.shared_runtime_convergence_owner = 172;
expect("SHARED_OWNER_DRIFT", () => verify(owner, readme, agents));

const upstream = clone(index); upstream.upstream.commit = "0".repeat(40);
expect("UPSTREAM_SOURCE_LICENSE_DRIFT", () => verify(upstream, readme, agents));

const subject = clone(index); subject.nodes[0].head = "0".repeat(40);
expect("EXACT_SUBJECT_DRIFT", () => verify(subject, readme, agents));

const denominator = clone(index); denominator.complete_denominator.pop();
expect("DENOMINATOR_DRIFT", () => verify(denominator, readme, agents));

const live = clone(index); live.live_frontier.oci_execution = "PASS";
expect("LIVE_PROMOTION", () => verify(live, readme, agents));

const network = clone(index); network.live_network_owner = 173;
expect("LIVE_NETWORK_OWNER_DRIFT", () => verify(network, readme, agents));

const sandbox = clone(index); sandbox.local_sandbox_reference.relationship = "GVISOR_ISOLATION_PASS";
expect("SANDBOX_EVIDENCE_CONFLATION", () => verify(sandbox, readme, agents));

const provider = clone(index); provider.authority.provider_private_shared_write = "ALLOWED";
expect("PROVIDER_SELF_PROMOTION", () => verify(provider, readme, agents));

const docs = clone(index); docs.docs_subject_state = "RELEASED";
expect("DOCS_SELF_PROMOTION", () => verify(docs, readme, agents));

console.log("PASS: DA-GV-D gVisor Agent/read-route traceability controls");
