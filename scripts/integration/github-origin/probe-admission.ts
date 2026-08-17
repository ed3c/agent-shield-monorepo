import type { OriginProbe } from "./types.ts";

export type OriginProbeAdmission =
  | "ORIGIN_ABSENT"
  | "AUTH_REFUSED"
  | "AUTH_ABSENT"
  | "REACHABLE";

/**
 * Classifies origin reachability without conflating public anonymous access with authentication.
 * A public repository may be admitted when it is reachable and explicitly observed as publicly
 * readable. A private repository still requires authenticated=true. No caller may infer public
 * readability merely from HTTP success; the transport must establish it as an independent fact.
 */
export function classifyOriginProbe(probe: OriginProbe): OriginProbeAdmission {
  if (!probe.reachable) return "ORIGIN_ABSENT";
  if (probe.refused) return "AUTH_REFUSED";
  if (!probe.authenticated && probe.publiclyReadable !== true) return "AUTH_ABSENT";
  return "REACHABLE";
}
