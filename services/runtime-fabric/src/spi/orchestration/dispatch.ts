import { validateRuntimeRequestV2, type RuntimeReceipt } from "../../../../../packages/contracts/src/runtime/index.ts";
import { RuntimeLifecycle } from "../../state-machine/index.ts";
import { RuntimeProviderRegistry } from "../registry.ts";
import type { RuntimeRunOptions } from "../types.ts";
import { deepFreeze, unexercisedAdmission } from "../validation.ts";
import { earlyReceipt } from "./receipt.ts";
import { runRuntimeProvider } from "./run.ts";

export async function dispatchRuntimeRequest(
  registry: RuntimeProviderRegistry,
  value: unknown,
  options: RuntimeRunOptions = {},
): Promise<RuntimeReceipt> {
  const request = deepFreeze(validateRuntimeRequestV2(value));
  const provider = registry.resolve(request.providerId, request.scope);
  if (provider) return runRuntimeProvider(provider, request, options);
  const lifecycle = new RuntimeLifecycle();
  lifecycle.transition("RESOLVED");
  return earlyReceipt(
    request,
    { id: request.providerId, version: "unresolved", subject: null, environmentSubject: null, scope: request.scope, capabilities: [] },
    lifecycle,
    "ABSENT",
    unexercisedAdmission("provider is not registered"),
    null,
    "provider is not registered",
  );
}
