import { createHash } from "node:crypto";

export interface Intent { id: string; target: string; amountMinor: bigint; evidence: string[] }
export interface RiskDecision { state: "PASS" | "FAIL"; reason: string; digest: string }
export function decide(intent: Intent, limitMinor = 100_000n): RiskDecision {
  if (!intent.id || !intent.target || intent.evidence.length === 0) return { state: "FAIL", reason: "closed intent fields required", digest: "0".repeat(64) };
  const canonical = JSON.stringify({ id: intent.id, target: intent.target, amountMinor: intent.amountMinor.toString(), evidence: [...intent.evidence].sort() });
  const digest = createHash("sha256").update(canonical).digest("hex");
  return intent.amountMinor <= limitMinor ? { state: "PASS", reason: "within deterministic MVP limit", digest } : { state: "FAIL", reason: "human approval boundary required", digest };
}
