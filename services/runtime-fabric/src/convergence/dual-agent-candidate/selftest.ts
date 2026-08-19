import {
  RuntimeCandidateError,
  compileRuntimeCandidate,
  fixedCandidate,
} from "./candidate.ts";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function expect(code: string, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof RuntimeCandidateError && error.code === code) {
      console.log(`${code}: RED/${code}`);
      return;
    }
    throw error;
  }
  throw new Error(`${code}: planted control survived`);
}

const input = fixedCandidate();
const receipt = compileRuntimeCandidate(input);
if (
  receipt.outcome !== "HUMAN_REVIEW_PENDING" ||
  receipt.candidateCount !== 3 ||
  receipt.sharedMutationState !== "FORBIDDEN" ||
  receipt.releaseState !== "NOT_PERFORMED" ||
  receipt.evidenceCeiling !== "NON_PROMOTING_RUNTIME_CONVERGENCE_CANDIDATE_ONLY"
) {
  throw new Error("candidate promoted beyond evidence ceiling");
}
console.log("P1: PASS exact candidate inventory remains HUMAN_REVIEW_PENDING");

if (!receipt.blockers.includes("ROUTE_LIVE_161") || !receipt.blockers.includes("GVISOR_LIVE_173") || !receipt.blockers.includes("LIVE_NETWORK_95")) {
  throw new Error("live blockers missing");
}
console.log("P2: PASS live and shared-convergence blockers remain explicit");

const head = clone(input); head.subjects[0].head = "0".repeat(40);
expect("EXACT_HEAD_DRIFT", () => compileRuntimeCandidate(head));

const tree = clone(input); tree.subjects[1].tree = "1".repeat(40);
expect("EXACT_TREE_DRIFT", () => compileRuntimeCandidate(tree));

const run = clone(input); run.subjects[2].run += 1;
expect("EXACT_RUN_OR_PR_DRIFT", () => compileRuntimeCandidate(run));

const widened = clone(input); widened.subjects[0].evidenceCeiling = "LIVE_API_BROWSER_PASS";
expect("EVIDENCE_CEILING_WIDENING", () => compileRuntimeCandidate(widened));

const admitted = clone(input) as any;
admitted.requestedOutcome = "ADMITTED";
expect("DRAFT_AS_ADMITTED", () => compileRuntimeCandidate(admitted));

const liveRoute = clone(input) as any; liveRoute.liveClaims.api = "PASS";
expect("DETERMINISTIC_AS_LIVE", () => compileRuntimeCandidate(liveRoute));

const liveGvisor = clone(input) as any; liveGvisor.localSandbox.hardenedContainerIsolation = "PASS";
expect("LOCAL_CANARY_AS_GVISOR_PASS", () => compileRuntimeCandidate(liveGvisor));

const provider = clone(input) as any; provider.localSandbox.providerObservation = "PASS";
expect("LOCAL_CANARY_AS_PROVIDER_PASS", () => compileRuntimeCandidate(provider));

const network = clone(input) as any; network.localSandbox.networkIsolation = "PASS";
expect("LOCAL_CANARY_AS_NETWORK_PASS", () => compileRuntimeCandidate(network));

const sharedWriter = clone(input) as any; sharedWriter.authority.sharedConvergenceIssue = 179;
expect("SHARED_WRITER_BYPASS", () => compileRuntimeCandidate(sharedWriter));

const networkOwner = clone(input) as any; networkOwner.authority.liveNetworkIssue = 173;
expect("LIVE_NETWORK_OWNER_BYPASS", () => compileRuntimeCandidate(networkOwner));

const mutation = clone(input); mutation.proposedSharedMutations = ["data/status/integration.json"];
expect("RELEASE_OR_STATUS_MUTATION_PROPOSED", () => compileRuntimeCandidate(mutation));

const blocker = clone(input); blocker.blockers = blocker.blockers.filter((item) => item.id !== "GVISOR_LIVE_173");
expect("MISSING_BLOCKER", () => compileRuntimeCandidate(blocker));

const failure = clone(input); failure.retainedFailureRuns = failure.retainedFailureRuns.filter((runId) => runId !== 32278264809);
expect("FAILURE_HISTORY_ERASED", () => compileRuntimeCandidate(failure));

console.log("PASS: DA-RT-CAND exact-subject, authority, blocker, and non-promotion controls");
