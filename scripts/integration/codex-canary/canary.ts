import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import { runCarrierCanary } from "../claude-canary/index.ts";
import type { CarrierCanaryReceipt, CarrierTransport } from "../claude-canary/index.ts";

// #71 owns the Codex adapter, not the carrier contract. The shared contract -- lifecycle,
// receipt shape, host-isolation asymmetry, tool policy and turn admission -- was created by #70
// and is parameterised by carrier, so this leaf reuses it rather than maintaining a second copy
// that drifts. INT-CODEX-009 asks for exactly that: a receipt surface that permits a later
// parity comparison without one carrier proxying the other.
//
// The shared contract currently lives under `claude-canary/` because #70 created it first.
// Extracting it to a neutral directory is a convergence concern (#75), not something either
// carrier leaf should do to the other's paths.
export interface CodexCanaryRequest {
  subject: ReleaseSubject;
  transport: CarrierTransport;
}

export function runCodexCanary(request: CodexCanaryRequest): { receipt: CarrierCanaryReceipt } {
  return runCarrierCanary({ carrier: "codex-cli", subject: request.subject, transport: request.transport });
}

export const codexCanaryState = {
  carrierReachability: "NOT_EXERCISED",
  boundedModelTurn: "NOT_EXERCISED",
  mcpToolCall: "NOT_EXERCISED",
  claudeParity: "NOT_IMPLEMENTED",
  releasePromotion: "NOT_IMPLEMENTED",
} as const;
