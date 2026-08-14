import type {
  RuntimeOperationContext,
} from "../../spi/index.ts";
import type {
  RuntimeSourceRef,
} from "../../../../../packages/contracts/src/runtime/index.ts";

export interface AppleContainerImageSubject {
  reference: string;
  digest: string;
}

export interface AppleContainerWorkflowSpec {
  id: string;
  image: AppleContainerImageSubject;
  argv: readonly string[];
  allowedExitCodes: readonly number[];
  maxLogBytes: number;
  network: "deny-all";
}

export interface AppleContainerProbeResult {
  state: "AVAILABLE" | "ABSENT" | "REFUSED_POLICY";
  version: string | null;
  detail: string;
}

export interface AppleContainerCreateSpec {
  name: string;
  image: AppleContainerImageSubject;
  argv: readonly string[];
  source: RuntimeSourceRef;
  network: "deny-all";
}

export interface AppleContainerHandle {
  name: string;
  id: string;
}

export interface AppleContainerExitResult {
  code: number;
  signal: string | null;
}

export interface AppleContainerTransport {
  probe(context: RuntimeOperationContext): Promise<AppleContainerProbeResult>;
  create(spec: AppleContainerCreateSpec, context: RuntimeOperationContext): Promise<AppleContainerHandle>;
  start(handle: AppleContainerHandle, context: RuntimeOperationContext): Promise<void>;
  wait(handle: AppleContainerHandle, context: RuntimeOperationContext): Promise<AppleContainerExitResult>;
  logs(handle: AppleContainerHandle, maxBytes: number, context: RuntimeOperationContext): Promise<Uint8Array>;
  stop(handle: AppleContainerHandle, context: RuntimeOperationContext): Promise<void>;
  delete(handle: AppleContainerHandle, context: RuntimeOperationContext): Promise<void>;
  exists(name: string, context: RuntimeOperationContext): Promise<boolean>;
  removeByName(name: string, context: RuntimeOperationContext): Promise<void>;
}

export interface AppleContainerProviderInput {
  workflowId: string;
}

export interface AppleContainerMaterializationHandle {
  name: string;
  id: string;
  workflowId: string;
}
