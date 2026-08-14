import { RUNTIME_REQUEST_SCHEMA, type RuntimeRequest } from "../types.ts";
import { SAFE_ID, SAFE_VERSION, boundedStringArray, enumValue, exactKeys, fail, record, requiredString } from "./common.ts";
import { parseRequestBoundParts } from "./request-bounds.ts";
import { parseRequestPolicyParts } from "./request-policy.ts";
import { validateRuntimeEnvironmentSubject, validateRuntimeProviderSubject, validateSource } from "./subjects.ts";

export function validateRuntimeRequestV2(value: unknown): RuntimeRequest {
  const request = record(value, "request");
  exactKeys(request, [
    "schema", "requestId", "providerId", "providerVersion", "providerSubject", "environmentSubject", "scope",
    "requiredCapabilities", "source", "workload", "environment", "network", "secrets", "limits", "mutation",
    "artifacts", "cleanup", "exclusions",
  ], "request");
  if (request.schema !== RUNTIME_REQUEST_SCHEMA) fail("request.schema is unsupported");
  const providerId = requiredString(request.providerId, "request.providerId", SAFE_ID, 128);
  const providerVersion = requiredString(request.providerVersion, "request.providerVersion", SAFE_VERSION, 64);
  const providerSubject = validateRuntimeProviderSubject(request.providerSubject, "request.providerSubject");
  const environmentSubject = validateRuntimeEnvironmentSubject(request.environmentSubject, "request.environmentSubject");
  if (providerSubject.id !== providerId || providerSubject.version !== providerVersion) fail("request.providerSubject must bind providerId and providerVersion");
  const requiredCapabilities = boundedStringArray(request.requiredCapabilities, "requiredCapabilities", 64, (entry, index) => {
    if (!SAFE_ID.test(entry)) fail(`requiredCapabilities[${index}] is invalid`);
  }).sort();
  if (requiredCapabilities.length === 0) fail("requiredCapabilities must not be empty");
  const policy = parseRequestPolicyParts(request);
  const bounds = parseRequestBoundParts(request, policy.workload.input);
  return {
    schema: RUNTIME_REQUEST_SCHEMA,
    requestId: requiredString(request.requestId, "request.requestId", SAFE_ID, 128),
    providerId,
    providerVersion,
    providerSubject,
    environmentSubject,
    scope: enumValue(request.scope, "request.scope", ["local", "cloud"] as const),
    requiredCapabilities,
    source: validateSource(request.source),
    ...policy,
    ...bounds,
  };
}
