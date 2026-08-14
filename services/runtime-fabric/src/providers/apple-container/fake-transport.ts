import type { RuntimeOperationContext } from "../../spi/index.ts";
import type {
  AppleContainerCreateSpec,
  AppleContainerExitResult,
  AppleContainerHandle,
  AppleContainerProbeResult,
  AppleContainerTransport,
} from "./types.ts";

export type FakeAppleContainerCreateMode = "pass" | "throw-before-create" | "throw-after-create";
export type FakeAppleContainerDeleteMode = "pass" | "throw" | "leave-container";

function assertActive(context: RuntimeOperationContext): void {
  if (context.signal.aborted) throw new Error(`fake Apple Container ${context.stage} operation was cancelled`);
  if (context.deadlineEpochMs <= 0 || context.cancellationGraceMs <= 0) {
    throw new Error("fake Apple Container operation context is incomplete");
  }
}

export class FakeAppleContainerTransport implements AppleContainerTransport {
  probeState: AppleContainerProbeResult["state"] = "AVAILABLE";
  version = "0.9.0";
  createMode: FakeAppleContainerCreateMode = "pass";
  deleteMode: FakeAppleContainerDeleteMode = "pass";
  exitCode = 0;
  exitSignal: string | null = null;
  log = new TextEncoder().encode("fixture Apple Container log\n");

  readonly containers = new Map<string, AppleContainerHandle>();
  readonly calls = {
    probe: 0,
    create: 0,
    start: 0,
    wait: 0,
    logs: 0,
    stop: 0,
    delete: 0,
    exists: 0,
    removeByName: 0,
  };
  lastCreateSpec: AppleContainerCreateSpec | null = null;
  lastLogLimit: number | null = null;

  async probe(context: RuntimeOperationContext): Promise<AppleContainerProbeResult> {
    assertActive(context);
    this.calls.probe += 1;
    return {
      state: this.probeState,
      version: this.probeState === "ABSENT" ? null : this.version,
      detail: `fake Apple Container probe ${this.probeState}`,
    };
  }

  async create(spec: AppleContainerCreateSpec, context: RuntimeOperationContext): Promise<AppleContainerHandle> {
    assertActive(context);
    this.calls.create += 1;
    this.lastCreateSpec = spec;
    if (this.createMode === "throw-before-create") throw new Error("fake Apple Container create failed before side effect");
    if (this.containers.has(spec.name)) throw new Error("fake Apple Container already exists");
    const handle = { name: spec.name, id: `fixture:${spec.name}` };
    this.containers.set(spec.name, handle);
    if (this.createMode === "throw-after-create") throw new Error("fake Apple Container create failed after side effect");
    return handle;
  }

  async start(handle: AppleContainerHandle, context: RuntimeOperationContext): Promise<void> {
    assertActive(context);
    this.calls.start += 1;
    if (!this.containers.has(handle.name)) throw new Error("fake Apple Container is absent");
  }

  async wait(handle: AppleContainerHandle, context: RuntimeOperationContext): Promise<AppleContainerExitResult> {
    assertActive(context);
    this.calls.wait += 1;
    if (!this.containers.has(handle.name)) throw new Error("fake Apple Container is absent");
    return { code: this.exitCode, signal: this.exitSignal };
  }

  async logs(handle: AppleContainerHandle, maxBytes: number, context: RuntimeOperationContext): Promise<Uint8Array> {
    assertActive(context);
    this.calls.logs += 1;
    this.lastLogLimit = maxBytes;
    if (!this.containers.has(handle.name)) throw new Error("fake Apple Container is absent");
    return this.log;
  }

  async stop(handle: AppleContainerHandle, context: RuntimeOperationContext): Promise<void> {
    assertActive(context);
    this.calls.stop += 1;
    if (!this.containers.has(handle.name)) return;
  }

  async delete(handle: AppleContainerHandle, context: RuntimeOperationContext): Promise<void> {
    assertActive(context);
    this.calls.delete += 1;
    if (this.deleteMode === "throw") throw new Error("fake Apple Container delete failed");
    if (this.deleteMode === "leave-container") return;
    this.containers.delete(handle.name);
  }

  async exists(name: string, context: RuntimeOperationContext): Promise<boolean> {
    assertActive(context);
    this.calls.exists += 1;
    return this.containers.has(name);
  }

  async removeByName(name: string, context: RuntimeOperationContext): Promise<void> {
    assertActive(context);
    this.calls.removeByName += 1;
    if (this.deleteMode === "throw") throw new Error("fake Apple Container recovery delete failed");
    if (this.deleteMode === "leave-container") return;
    this.containers.delete(name);
  }
}
