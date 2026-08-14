import { type RuntimeProviderDescriptor, type RuntimeRequest } from "../../../../../packages/contracts/src/runtime/index.ts";
import type { RuntimeProviderSpi } from "../types.ts";
import { canonical, normalizeDescriptor } from "./common.ts";

export function descriptorForRequest(provider: RuntimeProviderSpi, request: RuntimeRequest): RuntimeProviderDescriptor {
  const descriptor = normalizeDescriptor(provider.descriptor);
  if (descriptor.id !== request.providerId) throw new Error("provider descriptor does not match request.providerId");
  if (descriptor.version !== request.providerVersion) throw new Error("provider descriptor version does not match request.providerVersion");
  if (canonical(descriptor.subject) !== canonical(request.providerSubject)) throw new Error("provider descriptor subject does not match request.providerSubject");
  if (canonical(descriptor.environmentSubject) !== canonical(request.environmentSubject)) {
    throw new Error("provider environment subject does not match request.environmentSubject");
  }
  if (descriptor.scope !== request.scope) throw new Error("provider descriptor scope does not match request.scope");
  for (const capability of request.requiredCapabilities) {
    if (!descriptor.capabilities.includes(capability)) throw new Error(`provider lacks required capability: ${capability}`);
  }
  if (descriptor.credentialBoundary === "none" && request.secrets.length > 0) {
    throw new Error("provider with credentialBoundary=none cannot receive secret references");
  }
  if (descriptor.credentialBoundary === "host-only" && request.secrets.some((entry) => entry.class !== "host-only")) {
    throw new Error("host-only provider cannot receive broker-only secret references");
  }
  if (descriptor.credentialBoundary === "broker-only" && request.secrets.some((entry) => entry.class !== "broker-only")) {
    throw new Error("broker-only provider cannot receive host-only secret references");
  }
  return descriptor;
}
