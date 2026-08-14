import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";

export const CLOSURE_LOCK_SCHEMA = "agent-shield/module-closure-lock/v1" as const;

export type ClosureState =
  | "UNRESOLVED"
  | "RELEASE_VERIFIED"
  | "REQUIREMENTS_PARSED"
  | "MODULES_SELECTED"
  | "DEPENDENCIES_EXPANDED"
  | "CAPABILITIES_RESOLVED"
  | "OWNERSHIP_CHECKED"
  | "INTERFACES_CHECKED"
  | "CLOSURE_LOCKED"
  | "ABSENT_RELEASE"
  | "INVALID_REQUIREMENTS"
  | "MISSING_MODULE"
  | "MISSING_COMPONENT"
  | "MISSING_CAPABILITY"
  | "DUPLICATE_PROVIDER"
  | "PATH_CONFLICT"
  | "INTERFACE_CONFLICT"
  | "CYCLE"
  | "DIGEST_MISMATCH";

export type ClosureOutcome = Extract<ClosureState,
  | "CLOSURE_LOCKED"
  | "ABSENT_RELEASE"
  | "INVALID_REQUIREMENTS"
  | "MISSING_MODULE"
  | "MISSING_COMPONENT"
  | "MISSING_CAPABILITY"
  | "DUPLICATE_PROVIDER"
  | "PATH_CONFLICT"
  | "INTERFACE_CONFLICT"
  | "CYCLE"
  | "DIGEST_MISMATCH">;

// A capability is either exclusive -- exactly one provider may be selected -- or shared.
// INT-CLOSURE-003 turns on this distinction, so it is declared rather than inferred.
export interface CapabilityDeclaration {
  capability: string;
  exclusive: boolean;
}

export interface ComponentManifest {
  id: string;
  // Tracked files this component owns, relative to the repository root.
  files: string[];
  fileDigests: Record<string, string>;
  // INT-CLOSURE-006. A private component is never bundled, even when its module is selected.
  visibility: "public" | "private";
  optional: boolean;
}

export interface InterfaceSignature {
  capability: string;
  majorVersion: number;
  inputDigest: string;
  outputDigest: string;
  exitCodes: number[];
  effects: string[];
}

export interface ModuleManifest {
  id: string;
  interfaceVersion: string;
  manifestSha256: string;
  provides: CapabilityDeclaration[];
  requires: string[];
  components: ComponentManifest[];
  signatures: InterfaceSignature[];
}

export interface ClosureRequirements {
  consumerId: string;
  modules: string[];
  components: string[];
  capabilities: string[];
  // The interface expectations the consumer was built against. A drift here is an interface
  // conflict, not a silent upgrade.
  expects: InterfaceSignature[];
}

export interface SelectedComponent {
  moduleId: string;
  componentId: string;
  files: string[];
  digest: string;
}

export interface ClosureLock {
  schema: typeof CLOSURE_LOCK_SCHEMA;
  consumerId: string;
  release: ReleaseSubject;
  moduleIds: string[];
  components: SelectedComponent[];
  capabilityOwners: Record<string, string>;
  closureDigest: string;
  moduleDigests: Record<string, string>;
}

export interface ClosureResult {
  lifecycle: ClosureState[];
  outcome: ClosureOutcome;
  lock: ClosureLock | null;
  detail: string;
}
