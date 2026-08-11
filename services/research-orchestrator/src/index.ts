import type { BrowserWorkflowRequest, ModuleReceipt } from "../../../packages/contracts/src/index.ts";
export function routeResearch(request: BrowserWorkflowRequest): ModuleReceipt {
  if (request.workflow === "external-verify") return { schema:"agent-shield/research-route/v1", module:"research-orchestrator", interfaceVersion:"1.1.0", state:"PASS", artifacts:[request.inputRef], detail:"raw-primary route selected before browser fallback" };
  if (request.workflow === "dr-research-loop") return { schema:"agent-shield/research-route/v1", module:"research-orchestrator", interfaceVersion:"1.1.0", state:"NOT_EXERCISED", artifacts:[request.inputRef], detail:"core DR is browser-optional; signed-in Stage 1 has not run" };
  return { schema:"agent-shield/research-route/v1", module:"research-orchestrator", interfaceVersion:"1.1.0", state:request.environment === "cloud" ? "NOT_IMPLEMENTED" : "NOT_EXERCISED", artifacts:[request.inputRef], detail:"GCR requires a file-only signed-in browser route and immutable live receipt" };
}
