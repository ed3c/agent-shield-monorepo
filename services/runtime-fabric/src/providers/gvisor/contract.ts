import { createHash } from "node:crypto";

export const GVISOR_PROVIDER_SCHEMA = "agent-shield/gvisor-provider-admission/v1" as const;
export const RUNTIME_REQUEST_SCHEMA = "agent-shield/runtime-request/v2" as const;

export const OFFICIAL_GVISOR_SOURCE = {
  repository: "google/gvisor",
  commit: "09329f4f5677c3b2492a40ea816a6899d03bcbd1",
  tree: "f5714e427eb5e9d93e2b7e4e5a994dec5a90bcfb",
  licenseBlob: "f7a006d10464cfe9724b5d687c0013bf982cc66a",
  licenseId: "Apache-2.0",
  thirdPartyLicenseNoticeRequired: true,
} as const;

export type EvidenceState = "NOT_EXERCISED";
export type ExecutableBindingState = "UNRESOLVED" | "BOUND";

export interface ExecutableSubject {
  state: ExecutableBindingState;
  version: string | null;
  sha256: string | null;
  sbomDigest: string | null;
  evidenceClass: "DETERMINISTIC_FIXTURE" | "LIVE_SUBJECT_REQUIRED";
}

export interface OciImageSubject {
  digest: string;
  evidenceClass: "DETERMINISTIC_FIXTURE" | "LIVE_SUBJECT_REQUIRED";
}

export interface PlatformSubject {
  os: "linux";
  arch: "amd64" | "arm64";
  kernelRelease: string;
  kernelDigest: string;
  evidenceClass: "DETERMINISTIC_FIXTURE" | "LIVE_SUBJECT_REQUIRED";
}

export interface MountRule {
  sourceClass: "WORKSPACE" | "DECLARED_INPUT" | "TMPFS";
  target: string;
  mode: "ro" | "rw";
}

export interface NetworkPolicy {
  mode: "deny-all" | "allowlist";
  allowlist: string[];
}

export interface ResourceLimits {
  cpuMillis: number;
  memoryBytes: number;
  pids: number;
  timeoutMs: number;
  maxOutputBytes: number;
  maxArtifactBytes: number;
}

export interface IsolationPolicy {
  argv: string[];
  uid: number;
  gid: number;
  noNewPrivileges: true;
  privileged: false;
  hostPid: false;
  hostIpc: false;
  mounts: MountRule[];
  network: NetworkPolicy;
  resources: ResourceLimits;
}

export interface GVisorAdmissionPacket {
  schema: typeof GVISOR_PROVIDER_SCHEMA;
  runtimeRequestSchema: typeof RUNTIME_REQUEST_SCHEMA;
  providerId: "gvisor-runsc";
  source: typeof OFFICIAL_GVISOR_SOURCE;
  executable: ExecutableSubject;
  image: OciImageSubject;
  platform: PlatformSubject;
  workloadDigest: string;
  policyDigest: string;
  isolationPolicy: IsolationPolicy;
  sharedRegistryWrite: "FORBIDDEN";
  sharedStatusWrite: "FORBIDDEN";
  releaseWrite: "FORBIDDEN";
  liveIsolationState: EvidenceState;
  networkIsolationState: EvidenceState;
  cleanupState: EvidenceState;
}

export class GVisorContractError extends Error {
  constructor(public readonly code: string, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const H40 = /^[0-9a-f]{40}$/;
const H64 = /^[0-9a-f]{64}$/;
const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const SAFE_TOKEN = /^[A-Za-z0-9._:/=+,-]+$/;
const FORBIDDEN_PATH = /(^|\/)(\.ssh|\.aws|\.config\/gcloud)(\/|$)|^\/Users\/|^\/home\/|^\/root\/|docker\.sock$/;

function refuse(code: string, detail = ""): never {
  throw new GVisorContractError(code, detail);
}

function h64(value: string | null, code: string): string {
  if (!value || !H64.test(value)) refuse(code);
  return value;
}

function positiveInt(value: number, max: number, code: string): void {
  if (!Number.isInteger(value) || value <= 0 || value > max) refuse(code);
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function validateOfficialSource(source: GVisorAdmissionPacket["source"]): void {
  if (
    source.repository !== OFFICIAL_GVISOR_SOURCE.repository ||
    source.commit !== OFFICIAL_GVISOR_SOURCE.commit ||
    source.tree !== OFFICIAL_GVISOR_SOURCE.tree ||
    source.licenseBlob !== OFFICIAL_GVISOR_SOURCE.licenseBlob ||
    source.licenseId !== OFFICIAL_GVISOR_SOURCE.licenseId ||
    source.thirdPartyLicenseNoticeRequired !== true ||
    !H40.test(source.commit) || !H40.test(source.tree) || !H40.test(source.licenseBlob)
  ) {
    refuse("UPSTREAM_SOURCE_DRIFT");
  }
}

export function validateExecutable(executable: ExecutableSubject): void {
  if (executable.state === "UNRESOLVED") {
    if (executable.version !== null || executable.sha256 !== null || executable.sbomDigest !== null) {
      refuse("UNRESOLVED_EXECUTABLE_HAS_BYTES");
    }
    if (executable.evidenceClass !== "LIVE_SUBJECT_REQUIRED") refuse("EXECUTABLE_EVIDENCE_CLASS_INVALID");
    return;
  }
  if (!executable.version || executable.version === "latest" || executable.version.includes("*")) refuse("MUTABLE_RUNSC_VERSION");
  h64(executable.sha256, "RUNSC_CHECKSUM_REQUIRED");
  h64(executable.sbomDigest, "RUNSC_SBOM_REQUIRED");
  if (executable.evidenceClass !== "DETERMINISTIC_FIXTURE") refuse("EXECUTABLE_EVIDENCE_CLASS_INVALID");
}

export function validateImage(image: OciImageSubject): void {
  if (!IMAGE_DIGEST.test(image.digest)) refuse("OCI_IMAGE_DIGEST_REQUIRED");
  if (image.evidenceClass !== "DETERMINISTIC_FIXTURE") refuse("IMAGE_EVIDENCE_CLASS_INVALID");
}

export function validatePlatform(platform: PlatformSubject): void {
  if (platform.os !== "linux" || !["amd64", "arm64"].includes(platform.arch)) refuse("PLATFORM_UNSUPPORTED");
  if (!platform.kernelRelease || platform.kernelRelease.includes("*")) refuse("KERNEL_SUBJECT_REQUIRED");
  h64(platform.kernelDigest, "KERNEL_SUBJECT_REQUIRED");
  if (platform.evidenceClass !== "DETERMINISTIC_FIXTURE") refuse("PLATFORM_EVIDENCE_CLASS_INVALID");
}

export function validateIsolationPolicy(policy: IsolationPolicy): void {
  if (!Array.isArray(policy.argv) || policy.argv.length === 0 || policy.argv.length > 32) refuse("ARGV_SURFACE_INVALID");
  for (const token of policy.argv) {
    if (!token || token.length > 256 || !SAFE_TOKEN.test(token) || /[;&|`$<>\n\r]/.test(token)) refuse("ARBITRARY_SHELL_OR_ARGV");
  }
  if (policy.uid <= 0 || policy.gid <= 0 || policy.noNewPrivileges !== true || policy.privileged !== false) refuse("PRIVILEGE_WIDENING");
  if (policy.hostPid !== false || policy.hostIpc !== false) refuse("HOST_NAMESPACE_WIDENING");

  if (!Array.isArray(policy.mounts) || policy.mounts.length > 32) refuse("MOUNT_SURFACE_INVALID");
  for (const mount of policy.mounts) {
    if (!mount.target.startsWith("/") || mount.target.includes("..") || FORBIDDEN_PATH.test(mount.target)) refuse("HOST_PATH_WIDENING");
    if (!["WORKSPACE", "DECLARED_INPUT", "TMPFS"].includes(mount.sourceClass)) refuse("HOST_PATH_WIDENING");
  }

  if (policy.network.mode === "deny-all") {
    if (policy.network.allowlist.length !== 0) refuse("NETWORK_POLICY_INVALID");
  } else {
    if (policy.network.allowlist.length === 0 || policy.network.allowlist.length > 32) refuse("NETWORK_POLICY_INVALID");
    for (const endpoint of policy.network.allowlist) {
      if (!/^[A-Za-z0-9.-]+:[0-9]{1,5}$/.test(endpoint) || endpoint.includes("*") || endpoint.startsWith("0.0.0.0:")) {
        refuse("WILDCARD_NETWORK_EGRESS");
      }
    }
  }

  positiveInt(policy.resources.cpuMillis, 86_400_000, "RESOURCE_LIMIT_INVALID");
  positiveInt(policy.resources.memoryBytes, 68_719_476_736, "RESOURCE_LIMIT_INVALID");
  positiveInt(policy.resources.pids, 4096, "RESOURCE_LIMIT_INVALID");
  positiveInt(policy.resources.timeoutMs, 86_400_000, "RESOURCE_LIMIT_INVALID");
  positiveInt(policy.resources.maxOutputBytes, 1_073_741_824, "RESOURCE_LIMIT_INVALID");
  positiveInt(policy.resources.maxArtifactBytes, 17_179_869_184, "RESOURCE_LIMIT_INVALID");
}

export function validateAdmissionPacket(packet: GVisorAdmissionPacket): void {
  if (packet.schema !== GVISOR_PROVIDER_SCHEMA || packet.runtimeRequestSchema !== RUNTIME_REQUEST_SCHEMA || packet.providerId !== "gvisor-runsc") {
    refuse("GVISOR_SCHEMA_MISMATCH");
  }
  validateOfficialSource(packet.source);
  validateExecutable(packet.executable);
  validateImage(packet.image);
  validatePlatform(packet.platform);
  h64(packet.workloadDigest, "WORKLOAD_SUBJECT_REQUIRED");
  h64(packet.policyDigest, "POLICY_SUBJECT_REQUIRED");
  validateIsolationPolicy(packet.isolationPolicy);
  if (packet.sharedRegistryWrite !== "FORBIDDEN" || packet.sharedStatusWrite !== "FORBIDDEN" || packet.releaseWrite !== "FORBIDDEN") {
    refuse("SHARED_CONVERGENCE_OWNER_BYPASS");
  }
  if (packet.liveIsolationState !== "NOT_EXERCISED" || packet.networkIsolationState !== "NOT_EXERCISED" || packet.cleanupState !== "NOT_EXERCISED") {
    refuse("SOURCE_OR_FIXTURE_AS_LIVE_ISOLATION");
  }
}

export function deterministicFixture(): GVisorAdmissionPacket {
  return {
    schema: GVISOR_PROVIDER_SCHEMA,
    runtimeRequestSchema: RUNTIME_REQUEST_SCHEMA,
    providerId: "gvisor-runsc",
    source: OFFICIAL_GVISOR_SOURCE,
    executable: {
      state: "BOUND",
      version: "fixture-runsc-09329f4f5677",
      sha256: "1".repeat(64),
      sbomDigest: "2".repeat(64),
      evidenceClass: "DETERMINISTIC_FIXTURE",
    },
    image: { digest: `sha256:${"3".repeat(64)}`, evidenceClass: "DETERMINISTIC_FIXTURE" },
    platform: {
      os: "linux",
      arch: "amd64",
      kernelRelease: "fixture-linux-kernel",
      kernelDigest: "4".repeat(64),
      evidenceClass: "DETERMINISTIC_FIXTURE",
    },
    workloadDigest: "5".repeat(64),
    policyDigest: "6".repeat(64),
    isolationPolicy: {
      argv: ["/workspace/bin/selftest", "--fixture"],
      uid: 65532,
      gid: 65532,
      noNewPrivileges: true,
      privileged: false,
      hostPid: false,
      hostIpc: false,
      mounts: [
        { sourceClass: "WORKSPACE", target: "/workspace", mode: "rw" },
        { sourceClass: "TMPFS", target: "/tmp", mode: "rw" },
      ],
      network: { mode: "deny-all", allowlist: [] },
      resources: {
        cpuMillis: 60_000,
        memoryBytes: 536_870_912,
        pids: 64,
        timeoutMs: 60_000,
        maxOutputBytes: 1_048_576,
        maxArtifactBytes: 4_194_304,
      },
    },
    sharedRegistryWrite: "FORBIDDEN",
    sharedStatusWrite: "FORBIDDEN",
    releaseWrite: "FORBIDDEN",
    liveIsolationState: "NOT_EXERCISED",
    networkIsolationState: "NOT_EXERCISED",
    cleanupState: "NOT_EXERCISED",
  };
}

export function sourceOnlyCandidate(): GVisorAdmissionPacket {
  const packet = deterministicFixture();
  packet.executable = {
    state: "UNRESOLVED",
    version: null,
    sha256: null,
    sbomDigest: null,
    evidenceClass: "LIVE_SUBJECT_REQUIRED",
  };
  return packet;
}
