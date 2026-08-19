import {
  GVisorContractError,
  deterministicFixture,
  sourceOnlyCandidate,
  validateAdmissionPacket,
  type GVisorAdmissionPacket,
} from "./contract.ts";

function clone(): any {
  return structuredClone(deterministicFixture()) as any;
}

function expect(code: string, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof GVisorContractError && error.code === code) {
      console.log(`${code}: RED/${code}`);
      return;
    }
    throw error;
  }
  throw new Error(`${code}: planted control survived`);
}

validateAdmissionPacket(sourceOnlyCandidate());
console.log("P1: PASS official immutable source candidate with executable unresolved");

const fixture = deterministicFixture();
validateAdmissionPacket(fixture);
if (fixture.liveIsolationState !== "NOT_EXERCISED") throw new Error("fixture promoted live isolation");
console.log("P2: PASS deterministic executable/image/policy shape without live promotion");

const sourceDrift = clone(); sourceDrift.source.commit = "0".repeat(40);
expect("UPSTREAM_SOURCE_DRIFT", () => validateAdmissionPacket(sourceDrift));

const missingChecksum = clone(); missingChecksum.executable.sha256 = null;
expect("RUNSC_CHECKSUM_REQUIRED", () => validateAdmissionPacket(missingChecksum));

const missingSbom = clone(); missingSbom.executable.sbomDigest = null;
expect("RUNSC_SBOM_REQUIRED", () => validateAdmissionPacket(missingSbom));

const mutableVersion = clone(); mutableVersion.executable.version = "latest";
expect("MUTABLE_RUNSC_VERSION", () => validateAdmissionPacket(mutableVersion));

const imageTag = clone(); imageTag.image.digest = "gvisor/demo:latest";
expect("OCI_IMAGE_DIGEST_REQUIRED", () => validateAdmissionPacket(imageTag));

const shell = clone(); shell.isolationPolicy.argv = ["sh", "-c", "echo;id"];
expect("ARBITRARY_SHELL_OR_ARGV", () => validateAdmissionPacket(shell));

const privileged = clone(); privileged.isolationPolicy.privileged = true;
expect("PRIVILEGE_WIDENING", () => validateAdmissionPacket(privileged));

const hostPid = clone(); hostPid.isolationPolicy.hostPid = true;
expect("HOST_NAMESPACE_WIDENING", () => validateAdmissionPacket(hostPid));

const hostPath = clone(); hostPath.isolationPolicy.mounts.push({ sourceClass: "WORKSPACE", target: "/home/runner/.ssh", mode: "ro" });
expect("HOST_PATH_WIDENING", () => validateAdmissionPacket(hostPath));

const wildcardNetwork = clone(); wildcardNetwork.isolationPolicy.network = { mode: "allowlist", allowlist: ["*:443"] };
expect("WILDCARD_NETWORK_EGRESS", () => validateAdmissionPacket(wildcardNetwork));

const noLimit = clone(); noLimit.isolationPolicy.resources.pids = 0;
expect("RESOURCE_LIMIT_INVALID", () => validateAdmissionPacket(noLimit));

const promoted = clone(); promoted.liveIsolationState = "PASS";
expect("SOURCE_OR_FIXTURE_AS_LIVE_ISOLATION", () => validateAdmissionPacket(promoted));

const sharedWriter = clone(); sharedWriter.sharedStatusWrite = "ALLOWED";
expect("SHARED_CONVERGENCE_OWNER_BYPASS", () => validateAdmissionPacket(sharedWriter));

const unresolvedWithBytes = sourceOnlyCandidate() as any; unresolvedWithBytes.executable.sha256 = "f".repeat(64);
expect("UNRESOLVED_EXECUTABLE_HAS_BYTES", () => validateAdmissionPacket(unresolvedWithBytes));

console.log("PASS: DA-GV-C gVisor provider admission positive paths + planted disagreement controls");
