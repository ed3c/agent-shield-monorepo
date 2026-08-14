import type { DocsModel, Finding } from "./types.ts";

// Each gate is a pure function from the model to findings. No clock, no network, no
// filesystem, so DOC-GATE-007's byte stability is a property of the signature.

// DOC-GATE-001. Every reference resolves, and no ID is declared twice.
export function sourceAndTraceClosure(model: DocsModel): Finding[] {
  const findings: Finding[] = [];
  const declared = new Set<string>();
  for (const id of model.declaredIds) {
    if (declared.has(id)) findings.push({ gate: "DOC-GATE-001", subject: id, detail: "declared more than once" });
    declared.add(id);
  }
  for (const document of model.documents) {
    for (const reference of document.references) {
      if (!declared.has(reference)) {
        findings.push({ gate: "DOC-GATE-001", subject: document.id, detail: `references ${reference}, which nothing declares` });
      }
    }
  }
  return findings;
}

// DOC-GATE-002. One SSOT per normative topic, and every projection points at it. A second
// document claiming to be canonical for the same topic is the parallel canonical this rejects.
export function authorityUniqueness(model: DocsModel): Finding[] {
  const findings: Finding[] = [];
  const ssotForTopic = new Map<string, string>();
  const topicForSsot = new Map<string, string>();
  for (const topic of model.topics) {
    const existing = ssotForTopic.get(topic.topic);
    if (existing !== undefined && existing !== topic.ssotId) {
      findings.push({ gate: "DOC-GATE-002", subject: topic.topic, detail: `has two canonical sources: ${existing} and ${topic.ssotId}` });
    }
    ssotForTopic.set(topic.topic, topic.ssotId);
    const owned = topicForSsot.get(topic.ssotId);
    if (owned !== undefined && owned !== topic.topic) {
      findings.push({ gate: "DOC-GATE-002", subject: topic.ssotId, detail: `is canonical for both ${owned} and ${topic.topic}` });
    }
    topicForSsot.set(topic.ssotId, topic.topic);

    for (const projection of topic.projectionIds) {
      if (projection === topic.ssotId) {
        findings.push({ gate: "DOC-GATE-002", subject: projection, detail: "is listed as a projection of itself" });
      }
      const document = model.documents.find((entry) => entry.id === projection);
      if (document === undefined) {
        findings.push({ gate: "DOC-GATE-002", subject: projection, detail: "is a projection that does not exist" });
        continue;
      }
      if (!document.references.includes(topic.ssotId)) {
        findings.push({ gate: "DOC-GATE-002", subject: projection, detail: `does not link to its SSOT ${topic.ssotId}` });
      }
    }
  }
  return findings;
}

// DOC-GATE-003. Every governed directory has a nearest README or a reviewed, current
// exclusion. A stale exclusion -- reviewed against an older release -- is not an exclusion.
export function readmeCoverage(model: DocsModel): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const directory of model.directories) {
    if (seen.has(directory.path)) {
      findings.push({ gate: "DOC-GATE-003", subject: directory.path, detail: "is owned by two entries" });
    }
    seen.add(directory.path);
    if (directory.hasNearestReadme) continue;
    if (directory.exclusion === null) {
      findings.push({ gate: "DOC-GATE-003", subject: directory.path, detail: "has no nearest README and no exclusion" });
      continue;
    }
    if (directory.exclusion.reviewedAtRelease !== model.currentRelease) {
      findings.push({
        gate: "DOC-GATE-003",
        subject: directory.path,
        detail: `exclusion was reviewed at ${directory.exclusion.reviewedAtRelease}, not ${model.currentRelease}`,
      });
    }
    if (directory.exclusion.reviewedBy.length === 0) {
      findings.push({ gate: "DOC-GATE-003", subject: directory.path, detail: "exclusion names no reviewer" });
    }
  }
  return findings;
}

const EVAL_FIELDS = [
  "subject", "preconditions", "action", "observable", "negativeControl",
  "artifact", "statesAndExits", "cleanup", "exclusions", "owner", "rollback",
] as const;

// DOC-GATE-004. A packet with every field but an empty negative control is a positive-only
// checklist, which is the shape this gate exists to reject.
export function evalCompleteness(model: DocsModel): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const packet of model.evals) {
    if (seen.has(packet.id)) findings.push({ gate: "DOC-GATE-004", subject: packet.id, detail: "is declared more than once" });
    seen.add(packet.id);
    for (const field of EVAL_FIELDS) {
      if (packet[field].trim().length === 0) {
        findings.push({ gate: "DOC-GATE-004", subject: packet.id, detail: `has no ${field}` });
      }
    }
  }
  return findings;
}

// DOC-GATE-005. The five states stay distinct, and only an executed receipt can carry a
// non-documentation lane to PASS.
export function evidenceHonesty(model: DocsModel): Finding[] {
  const findings: Finding[] = [];
  for (const claim of model.claims) {
    if (claim.state !== "PASS") continue;
    if (claim.basis !== "executed-receipt") {
      findings.push({ gate: "DOC-GATE-005", subject: claim.subject, detail: `claims PASS on ${claim.basis}` });
      continue;
    }
    if (claim.lane === "documentation") continue;
  }
  for (const claim of model.claims) {
    if (claim.basis === "none" && claim.state !== "ABSENT" && claim.state !== "NOT_IMPLEMENTED" && claim.state !== "NOT_EXERCISED") {
      findings.push({ gate: "DOC-GATE-005", subject: claim.subject, detail: `claims ${claim.state} with no basis at all` });
    }
  }
  return findings;
}

// DOC-GATE-006. Branch ancestry, issue packet and path leases match the admitted stack, and
// two open PRs may not hold overlapping writable paths.
export function stackAndLeases(model: DocsModel): Finding[] {
  const findings: Finding[] = [];
  const admitted = new Map(model.admittedStack.map((edge) => [edge.branch, edge]));

  for (const pr of model.pullRequests) {
    const edge = admitted.get(pr.branch);
    if (edge === undefined) {
      findings.push({ gate: "DOC-GATE-006", subject: `#${pr.number}`, detail: `branch ${pr.branch} is not in the admitted stack` });
      continue;
    }
    if (edge.parentBranch !== pr.baseBranch) {
      findings.push({ gate: "DOC-GATE-006", subject: `#${pr.number}`, detail: `is based on ${pr.baseBranch}, admitted parent is ${edge.parentBranch}` });
    }
    if (edge.issueId !== pr.issueId) {
      findings.push({ gate: "DOC-GATE-006", subject: `#${pr.number}`, detail: `names issue ${pr.issueId}, admitted issue is ${edge.issueId}` });
    }
  }

  for (const [index, left] of model.pullRequests.entries()) {
    for (const right of model.pullRequests.slice(index + 1)) {
      for (const leftPath of left.allowedPaths) {
        for (const rightPath of right.allowedPaths) {
          if (leftPath === rightPath || leftPath.startsWith(`${rightPath}/`) || rightPath.startsWith(`${leftPath}/`)) {
            findings.push({
              gate: "DOC-GATE-006",
              subject: `#${left.number} and #${right.number}`,
              detail: `hold overlapping leases: ${leftPath} and ${rightPath}`,
            });
          }
        }
      }
    }
  }
  return findings;
}

// DOC-GATE-007. A generated artifact whose declared digest no longer matches what its inputs
// produce is stale, which is the same thing as a diff appearing on a clean tree.
export function generatedDeterminism(model: DocsModel): Finding[] {
  return model.generated
    .filter((artifact) => artifact.declaredDigest !== artifact.recomputedDigest)
    .map((artifact) => ({ gate: "DOC-GATE-007" as const, subject: artifact.path, detail: "declared digest does not match its recomputed bytes" }));
}
