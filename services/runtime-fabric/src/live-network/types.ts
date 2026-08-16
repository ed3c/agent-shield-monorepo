export type LiveNetworkPreflightState = "READY_FOR_LIVE_EXECUTION" | "REFUSED_PRECONDITION";

export interface LiveNetworkSubject {
  providerId: string;
  providerVersion: string;
  providerDigest: string;
  environmentDigest: string;
  policyDigest: string;
  workloadDigest: string;
  taskPacketDigest: string;
}

export interface LiveNetworkDestination {
  host: string;
  port: number;
}

export interface LiveNetworkPolicy {
  epoch: string;
  destinations: LiveNetworkDestination[];
}

export interface LiveNetworkPreflightInput {
  subject: LiveNetworkSubject;
  policy: LiveNetworkPolicy;
  requested: LiveNetworkDestination;
  environment: Record<string, string | undefined>;
}

export interface LiveNetworkPreflightResult {
  state: LiveNetworkPreflightState;
  reasons: string[];
  destinationKey: string;
  subjectDigest: string;
}

export interface LiveDnsObservation {
  requestedHost: string;
  requestedPort: number;
  cnameChain: string[];
  resolvedAddresses: string[];
  policyEpoch: string;
}

export interface LiveCleanupObservation {
  processResidue: boolean;
  workspaceResidue: boolean;
  sessionResidue: boolean;
  networkResidue: boolean;
  completedWithinGrace: boolean;
}

export interface LiveNetworkObservation {
  subject: LiveNetworkSubject;
  dns: LiveDnsObservation;
  cleanup: LiveCleanupObservation;
  outcome: "SUCCESS" | "REFUSED" | "TIMED_OUT" | "CANCELLED" | "FAILED";
  stdoutDigest: string;
  stderrDigest: string;
  artifactDigest: string;
  observedAt: string;
}

export interface LiveNetworkEvidenceValidation {
  valid: boolean;
  reasons: string[];
  resolvedAddressDigest: string;
  cleanupState: "PASS" | "FAILED_CLEANUP";
  evidenceDigest: string;
}
