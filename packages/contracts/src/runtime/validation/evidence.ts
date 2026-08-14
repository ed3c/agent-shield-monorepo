import type { EvidenceState } from "../../index.ts";
import type { RuntimeOutcomeState, RuntimeProviderDescriptor } from "../types.ts";

export function runtimeProviderCatalogEvidence(descriptor: RuntimeProviderDescriptor): EvidenceState {
  if (descriptor.implementation === "NOT_IMPLEMENTED") return "NOT_IMPLEMENTED";
  if (descriptor.availability === "ABSENT") return "ABSENT";
  if (descriptor.availability === "REFUSED_POLICY") return "FAIL";
  return descriptor.liveEvidence;
}
export function runtimeEvidenceForOutcome(outcome: RuntimeOutcomeState): EvidenceState {
  switch (outcome) {
    case "COMPLETED": return "PASS";
    case "ABSENT": return "ABSENT";
    case "NOT_IMPLEMENTED": return "NOT_IMPLEMENTED";
    case "NOT_EXERCISED": return "NOT_EXERCISED";
    default: return "FAIL";
  }
}
