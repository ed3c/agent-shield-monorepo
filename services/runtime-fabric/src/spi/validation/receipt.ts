import { validateRuntimeRequestV2, type RuntimeReceipt } from "../../../../../packages/contracts/src/runtime/index.ts";
import { validateReceiptEffects } from "./receipt-effects.ts";
import { validateReceiptIdentity } from "./receipt-identity.ts";

export function assertRuntimeReceiptMatchesRequest(receipt: RuntimeReceipt, value: unknown): void {
  const request = validateRuntimeRequestV2(value);
  const identity = validateReceiptIdentity(receipt, request);
  validateReceiptEffects(identity.receipt, request, identity.taskStage);
}
