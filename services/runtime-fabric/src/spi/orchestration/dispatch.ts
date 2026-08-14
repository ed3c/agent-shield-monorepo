import { validateRuntimeRequest, type RuntimeReceipt } from "../../../../../packages/contracts/src/runtime/index.ts";
import { RuntimeLifecycle } from "../../state-machine/index.ts";
import { RuntimeProviderRegistry } from "../registry.ts";
import type { RuntimeRunOptions } from "../types.ts";
import { deepFreeze, unexercisedAdmission } from "../validation.ts";
import { runRuntimeProvider } from "./run.ts";
import { earlyReceipt } from "./receipt.ts";

export async function dispatchRuntimeRequest(
  registry: RuntimeProviderRegistry,
  value: unknown,
  options: RuntimeRunOptions = {},
): Promise<RuntimeReceipt> {
  const request = deepFreeze(validateRuntimeRequest(value));
  const provider = registry.resolve(request.providerId, request.scope);
  if (provider) return runRuntimeProvider(provider, request, options);

  const lifecycle = new RuntimeLifecycle();
  lifecycle.transition("RESOLVED");
  return earlyReceipt(
    request,
    {
      id: request.providerId,
      version: "unresolved",
      scope: request.scope,
      capabilities: [],
      subject: null,
      environmentSubject: null,
    },
    lifecycle,
    "ABSENT",
    unexercisedAdmission("provider is not registered"),
    "RESOLUTION",
    "provider is not registered",
  );
}
