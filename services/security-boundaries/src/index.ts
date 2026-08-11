import type { SecurityCapabilityReceipt } from "../../../packages/contracts/src/index.ts";

export interface SettlementIntent { target: string; amountMinor: bigint; currency: string; evidenceRefs: string[] }
export function validateIntent(intent: SettlementIntent): void {
  if (!intent.target.trim()) throw new Error("target required");
  if (intent.amountMinor <= 0n) throw new Error("amount must be positive");
  if (!/^[A-Z0-9]{2,12}$/.test(intent.currency)) throw new Error("currency invalid");
  if (intent.evidenceRefs.length === 0 || new Set(intent.evidenceRefs).size !== intent.evidenceRefs.length) throw new Error("unique evidence references required");
}

export const securityCapabilities: SecurityCapabilityReceipt[] = [
  { capability: "mpc-tss", state: "NOT_IMPLEMENTED", detail: "No audited native threshold-signing provider is bound" },
  { capability: "secure-enclave-nfc", state: "NOT_IMPLEMENTED", detail: "No iOS hardware attestation provider is bound" },
  { capability: "smart-account", state: "NOT_IMPLEMENTED", detail: "No deployed contract address or audited bytecode receipt is bound" },
  { capability: "ledger-anchor", state: "NOT_IMPLEMENTED", detail: "No append-only database or L2 anchor receipt is bound" },
  { capability: "settlement", state: "NOT_IMPLEMENTED", detail: "No chain/bundler/paymaster provider is bound" },
];
