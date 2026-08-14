import { RUNTIME_REQUEST_SCHEMA, type RuntimeRequest } from "../types.ts";
import { SAFE_ID, exactKeys, fail, record, requiredString } from "./common.ts";
import { validateRuntimeRequestV2 } from "./request.ts";

const LEGACY_RUNTIME_REQUEST_SCHEMA = "agent-shield/runtime-request/v1" as const;
export const LEGACY_RUNTIME_PROVIDER_VERSION = "legacy-v1-unbound" as const;
export const LEGACY_RUNTIME_EXCLUSION = "legacy-runtime-v1-unbound" as const;
const LEGACY_PROVIDER_SHA256 = "15305238c8318a70cf6447a490390d85a3d2017c76d767e8959ccd1acf7b9bda";
const LEGACY_ENVIRONMENT_SHA256 = "f03380b6279d1d71fc028d16d3211df25948fabcccff148d93a10b90f37c74b8";

export function isLegacyRuntimeEnvelopeRequest(request: RuntimeRequest): boolean {
  return (
    request.providerVersion === LEGACY_RUNTIME_PROVIDER_VERSION ||
    request.providerSubject.version === LEGACY_RUNTIME_PROVIDER_VERSION ||
    request.providerSubject.sha256 === LEGACY_PROVIDER_SHA256 ||
    request.environmentSubject.id === LEGACY_RUNTIME_PROVIDER_VERSION ||
    request.environmentSubject.sha256 === LEGACY_ENVIRONMENT_SHA256 ||
    request.exclusions.includes(LEGACY_RUNTIME_EXCLUSION)
  );
}

/**
 * Parses already-merged policy/session envelopes without granting provider execution.
 * Strict RuntimeProviderSpi execution uses validateRuntimeRequestV2.
 */
export function validateRuntimeRequest(value: unknown): RuntimeRequest {
  const candidate = record(value, "request");
  if (candidate.schema === RUNTIME_REQUEST_SCHEMA) return validateRuntimeRequestV2(value);
  if (candidate.schema !== LEGACY_RUNTIME_REQUEST_SCHEMA) fail("request.schema is unsupported");
  exactKeys(candidate, [
    "schema", "requestId", "providerId", "scope", "requiredCapabilities", "source", "workload", "environment",
    "network", "secrets", "limits", "mutation", "artifacts", "cleanup", "exclusions",
  ], "request");
  const providerId = requiredString(candidate.providerId, "request.providerId", SAFE_ID, 128);
  const exclusions = Array.isArray(candidate.exclusions)
    ? [...new Set([...candidate.exclusions, LEGACY_RUNTIME_EXCLUSION])]
    : candidate.exclusions;
  return validateRuntimeRequestV2({
    ...candidate,
    schema: RUNTIME_REQUEST_SCHEMA,
    providerVersion: LEGACY_RUNTIME_PROVIDER_VERSION,
    providerSubject: {
      kind: "source",
      id: providerId,
      version: LEGACY_RUNTIME_PROVIDER_VERSION,
      sha256: LEGACY_PROVIDER_SHA256,
    },
    environmentSubject: {
      kind: "profile",
      id: LEGACY_RUNTIME_PROVIDER_VERSION,
      version: "1.0.0",
      sha256: LEGACY_ENVIRONMENT_SHA256,
    },
    exclusions,
  });
}
