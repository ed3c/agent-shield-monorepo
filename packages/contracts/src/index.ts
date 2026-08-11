export type EvidenceState = "PASS" | "FAIL" | "ABSENT" | "NOT_IMPLEMENTED" | "NOT_EXERCISED";
export interface ArtifactRef { kind: string; sha256: string; path?: string }
export interface ModuleReceipt {
  schema: string;
  module: string;
  interfaceVersion: string;
  state: EvidenceState;
  artifacts: ArtifactRef[];
  detail: string;
}
export interface BrowserWorkflowRequest {
  workflow: "gemini-conversation-research" | "dr-research-loop" | "external-verify";
  inputRef: ArtifactRef;
  environment: "local" | "cloud";
}
export interface ProviderReceipt {
  provider: string;
  scope: "local" | "cloud";
  state: EvidenceState;
  capabilities: string[];
  subject: string | null;
  detail: string;
}
export interface ProductAdapterReceipt {
  adapter: string;
  state: EvidenceState;
  environment: "local" | "cloud" | "local-cloud";
  detail: string;
}
export interface SecurityCapabilityReceipt {
  capability: "mpc-tss" | "secure-enclave-nfc" | "smart-account" | "ledger-anchor" | "settlement";
  state: EvidenceState;
  detail: string;
}
