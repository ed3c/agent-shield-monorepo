import type { RuntimeProviderDescriptor, RuntimeRequest } from "../../../../../packages/contracts/src/runtime/index.ts";
import type { RuntimeProviderSpi } from "../types.ts";
import { canonical, normalizeDescriptor } from "./common.ts";

export function descriptorForRequest(provider: RuntimeProviderSpi, request: RuntimeRequest): RuntimeProviderDescriptor {
  const descriptor = normalizeDescriptor(provider.descriptor);
  if (descriptor.id !== request.providerId) throw new Error("provider ID mismatch");
  if (descriptor.version !== request.providerVersion) throw new Error("provider version mismatch");
  if (canonical(descriptor.subject) !== canonical(request.providerSubject)) throw new Error("provider subject mismatch");
  if (canonical(descriptor.environment) !== canonical(request.environmentSubject)) throw new Error("provider environment subject mismatch");
  if (descriptor.scope !== request.scope) throw new Error("provider scope mismatch");
  for (const capability of request.requiredCapabilities) if (!descriptor.capabilities.includes(capability)) throw new Error(`provider lacks capability: ${capability}`);
  if (descriptor.credentialBoundary === "none" && request.secrets.length > 0) throw new Error("credential-free provider cannot receive secret refs");
  if (descriptor.credentialBoundary === "host-only" && request.secrets.some((entry) => entry.class !== "host-only")) throw new Error("host-only provider received broker-only secret");
  if (descriptor.credentialBoundary === "broker-only" && request.secrets.some((entry) => entry.class !== "broker-only")) throw new Error("broker-only provider received host-only secret");
  return descriptor;
}
