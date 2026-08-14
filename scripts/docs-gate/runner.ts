import {
  authorityUniqueness,
  evalCompleteness,
  evidenceHonesty,
  generatedDeterminism,
  readmeCoverage,
  sourceAndTraceClosure,
  stackAndLeases,
} from "./rules.ts";
import {
  DOCS_GATE_RECEIPT_SCHEMA,
  type DocsGateReceipt,
  type DocsModel,
  type EvidenceState,
  type Finding,
  type GateId,
} from "./types.ts";

const GATES: ReadonlyArray<{ id: GateId; run: (model: DocsModel) => Finding[] }> = [
  { id: "DOC-GATE-001", run: sourceAndTraceClosure },
  { id: "DOC-GATE-002", run: authorityUniqueness },
  { id: "DOC-GATE-003", run: readmeCoverage },
  { id: "DOC-GATE-004", run: evalCompleteness },
  { id: "DOC-GATE-005", run: evidenceHonesty },
  { id: "DOC-GATE-006", run: stackAndLeases },
  { id: "DOC-GATE-007", run: generatedDeterminism },
];

export interface RunOptions {
  // DOC-GATE-010. The GitHub metadata lane is a separate, explicitly selected lane. When no
  // token or network is supplied it reports NOT_EXERCISED -- it is never folded into the
  // deterministic result, in either direction.
  githubMetadata: { selected: boolean; reachable: boolean };
}

export function runDocsGate(model: DocsModel, options: RunOptions): DocsGateReceipt {
  const findings: Finding[] = [];
  const gates = {} as Record<GateId, EvidenceState>;

  for (const gate of GATES) {
    const gateFindings = gate.run(model);
    findings.push(...gateFindings);
    gates[gate.id] = gateFindings.length === 0 ? "PASS" : "FAIL";
  }

  const githubMetadataLane: EvidenceState = !options.githubMetadata.selected
    ? "NOT_EXERCISED"
    : options.githubMetadata.reachable
      ? "PASS"
      : "ABSENT";

  // The overall state covers the deterministic gates only. An unexercised metadata lane
  // neither passes nor fails the run, which is the distinction DOC-GATE-005 protects.
  const state: EvidenceState = findings.length === 0 ? "PASS" : "FAIL";

  return {
    schema: DOCS_GATE_RECEIPT_SCHEMA,
    releaseId: model.releaseId,
    gates,
    githubMetadataLane,
    // Sorted so the receipt is byte-stable for one model regardless of gate order.
    findings: [...findings].sort((left, right) =>
      `${left.gate}${left.subject}${left.detail}` < `${right.gate}${right.subject}${right.detail}` ? -1 : 1),
    state,
    detail: findings.length === 0
      ? `all ${GATES.length} deterministic gates passed`
      : `${findings.length} finding(s) across ${new Set(findings.map((finding) => finding.gate)).size} gate(s)`,
  };
}

// DOC-GATE-008. The validator declares the paths it may change, and a run that would touch
// anything else is reported rather than performed. This function is the whole of its write
// surface: it writes nothing, so scope review is a comparison rather than a promise.
export const DOCS_GATE_OWNED_PATHS = [
  "scripts/docs-gate",
  ".github/workflows/docs-gate.yml",
] as const;

export function assertScope(changedPaths: readonly string[]): Finding[] {
  return changedPaths
    .filter((path) => !DOCS_GATE_OWNED_PATHS.some((owned) => path === owned || path.startsWith(`${owned}/`)))
    .map((path) => ({ gate: "DOC-GATE-007" as const, subject: path, detail: "is outside the validator's declared scope" }));
}
