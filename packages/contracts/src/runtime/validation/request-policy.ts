import type { JsonObject, RuntimeRequest, RuntimeSecretRef } from "../types.ts";
import {
  SAFE_ENVIRONMENT_VARIABLE, SAFE_HOST, SAFE_VERSION, boundedStringArray, enumValue, exactKeys, fail,
  json, record, rejectGenericControls, requiredString,
} from "./common.ts";

export interface RequestPolicyParts {
  workload: RuntimeRequest["workload"];
  environment: RuntimeRequest["environment"];
  network: RuntimeRequest["network"];
  secrets: RuntimeSecretRef[];
}

export function parseRequestPolicyParts(request: Record<string, unknown>): RequestPolicyParts {
  const workload = record(request.workload, "workload");
  exactKeys(workload, ["id", "version", "input"], "workload");
  const workloadInput = record(workload.input, "workload.input");
  rejectGenericControls(workloadInput, "workload.input");
  const input = json(workloadInput, "workload.input") as JsonObject;

  const environmentValue = record(request.environment, "environment");
  exactKeys(environmentValue, ["allowedVariables"], "environment");
  const allowedVariables = boundedStringArray(environmentValue.allowedVariables, "environment.allowedVariables", 128, (entry, index) => {
    if (!SAFE_ENVIRONMENT_VARIABLE.test(entry)) fail(`environment.allowedVariables[${index}] is invalid`);
  }).sort();

  const networkValue = record(request.network, "network");
  exactKeys(networkValue, ["mode", "allowlist"], "network");
  const mode = enumValue(networkValue.mode, "network.mode", ["deny-all", "allowlist"] as const);
  const allowlist = boundedStringArray(networkValue.allowlist, "network.allowlist", 128, (entry, index) => {
    if (!SAFE_HOST.test(entry)) fail(`network.allowlist[${index}] must be an exact host or host:port`);
    const port = entry.includes(":") ? Number(entry.slice(entry.lastIndexOf(":") + 1)) : null;
    if (port !== null && port > 65535) fail(`network.allowlist[${index}] has an invalid port`);
  }).sort();
  if (mode === "deny-all" && allowlist.length > 0) fail("network.allowlist must be empty in deny-all mode");
  if (mode === "allowlist" && allowlist.length === 0) fail("network.allowlist is required in allowlist mode");

  if (!Array.isArray(request.secrets) || request.secrets.length > 64) fail("secrets must contain at most 64 items");
  const secrets = request.secrets.map((entry, index): RuntimeSecretRef => {
    const secret = record(entry, `secrets[${index}]`);
    exactKeys(secret, ["name", "brokerRef", "class", "delivery"], `secrets[${index}]`);
    const name = requiredString(secret.name, `secrets[${index}].name`, SAFE_ENVIRONMENT_VARIABLE, 128);
    const brokerRef = requiredString(secret.brokerRef, `secrets[${index}].brokerRef`, undefined, 320);
    if (
      !/^[a-z][a-z0-9.-]{0,31}:[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/.test(brokerRef) ||
      brokerRef.includes("..") || brokerRef.includes("://") || brokerRef.includes("\\") || /^[A-Za-z]:/.test(brokerRef)
    ) fail(`secrets[${index}].brokerRef must be an opaque logical broker reference`);
    const delivery = enumValue(secret.delivery, `secrets[${index}].delivery`, ["environment", "opaque-handle"] as const);
    if (delivery === "environment" && !allowedVariables.includes(name)) fail(`secrets[${index}] environment delivery is not declared`);
    return {
      name, brokerRef,
      class: enumValue(secret.class, `secrets[${index}].class`, ["host-only", "broker-only"] as const),
      delivery,
    };
  });
  if (new Set(secrets.map((entry) => entry.name)).size !== secrets.length) fail("secrets contain duplicate names");
  secrets.sort((left, right) => left.name.localeCompare(right.name));
  return {
    workload: {
      id: requiredString(workload.id, "workload.id", /^[a-z0-9][a-z0-9._/-]{0,127}$/, 128),
      version: requiredString(workload.version, "workload.version", SAFE_VERSION, 64),
      input,
    },
    environment: { allowedVariables },
    network: { mode, allowlist },
    secrets,
  };
}
