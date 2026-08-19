import {
  GVisorAdapterError,
  buildLaunchPlan,
  deterministicObservation,
  validateLaunchPlan,
  validateObservation,
} from "./adapter.ts";
import { deterministicFixture, sourceOnlyCandidate } from "./contract.ts";

function expect(code: string, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof GVisorAdapterError && error.code === code) {
      console.log(`${code}: RED/${code}`);
      return;
    }
    throw error;
  }
  throw new Error(`${code}: planted control survived`);
}

const packet = deterministicFixture();
const plan = buildLaunchPlan(packet);
validateLaunchPlan(packet, plan);
if (plan.executionMode !== "PLAN_ONLY" || plan.liveExecutionState !== "NOT_EXERCISED") throw new Error("plan promoted live");
console.log("P1: PASS exact runsc OCI launch plan remains plan-only");

const success = validateObservation(plan, deterministicObservation(plan, "SUCCESS"));
if (success.stateProposal !== "EXECUTION_OBSERVED_PENDING_LIVE_PROOF") throw new Error("fixture success promoted execution");
console.log("P2: PASS deterministic success remains pending live proof");

const timeout = validateObservation(plan, deterministicObservation(plan, "TIMEOUT"));
if (timeout.stateProposal !== "TIMED_OUT") throw new Error("timeout collapsed");
const lost = validateObservation(plan, deterministicObservation(plan, "CONNECTION_LOST"));
if (lost.stateProposal !== "RESULT_UNKNOWN") throw new Error("connection loss collapsed");
console.log("P3: PASS timeout and unknown remain distinct");

expect("RUNSC_EXECUTABLE_NOT_ADMITTED", () => buildLaunchPlan(sourceOnlyCandidate()));

const binaryDrift = structuredClone(plan); binaryDrift.executableSha256 = "f".repeat(64);
expect("RUNSC_BINARY_SUBJECT_DRIFT", () => validateLaunchPlan(packet, binaryDrift));

const argv = structuredClone(plan); argv.argv = ["sh", "-c", "runsc run anything"];
expect("ARBITRARY_RUNSC_ARGV", () => validateLaunchPlan(packet, argv));

const hostPath = structuredClone(plan); (hostPath as any).bundlePath = "/home/runner/bundle";
expect("HOST_PATH_OR_CONTAINER_WIDENING", () => validateLaunchPlan(packet, hostPath));

const promotedPlan = structuredClone(plan); (promotedPlan as any).liveExecutionState = "PASS";
expect("PLAN_AS_LIVE_EXECUTION", () => validateLaunchPlan(packet, promotedPlan));

const output = deterministicObservation(plan); output.stdoutBytes = plan.maxOutputBytes + 1;
expect("RUNSC_OUTPUT_LIMIT_EXCEEDED", () => validateObservation(plan, output));

const artifact = deterministicObservation(plan); artifact.artifacts[0].bytes = plan.maxArtifactBytes + 1;
expect("RUNSC_ARTIFACT_LIMIT_EXCEEDED", () => validateObservation(plan, artifact));

const pathEscape = deterministicObservation(plan); pathEscape.touchedPaths = ["/workspace/../etc/passwd"];
expect("RUNSC_TOUCHED_PATH_ESCAPE", () => validateObservation(plan, pathEscape));

const live = deterministicObservation(plan); (live as any).isolationState = "PASS";
expect("PLAN_OR_FIXTURE_AS_LIVE_ISOLATION", () => validateObservation(plan, live));

const selfPromote = deterministicObservation(plan); (selfPromote as any).canonicalWriteMode = "CANONICAL";
expect("PROVIDER_SELF_PROMOTION", () => validateObservation(plan, selfPromote));

const dirty = deterministicObservation(plan); dirty.residue = ["container:fixture"];
expect("FIXTURE_CLEANUP_AS_LIVE", () => validateObservation(plan, dirty));

console.log("PASS: DA-GV-A deterministic runsc adapter positive paths + planted controls");
