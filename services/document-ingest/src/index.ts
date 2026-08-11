import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ModuleReceipt } from "../../../packages/contracts/src/index.ts";

export interface IngestRequest { path: string; mediaType: "text/plain" | "application/pdf"; provider: "local" | "cloud" }
export function ingest(request: IngestRequest): ModuleReceipt {
  const bytes = readFileSync(request.path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (request.provider === "cloud") return { schema:"agent-shield/document-ingest-receipt/v1", module:"document-ingest", interfaceVersion:"1.1.0", state:"NOT_IMPLEMENTED", artifacts:[{kind:"input",sha256}], detail:"cloud document provider is not wired" };
  if (request.mediaType === "application/pdf") return { schema:"agent-shield/document-ingest-receipt/v1", module:"document-ingest", interfaceVersion:"1.1.0", state:"NOT_IMPLEMENTED", artifacts:[{kind:"pdf-input",sha256}], detail:"PDF parser adapter must be selected and verified before use" };
  const text = bytes.toString("utf8");
  const output = createHash("sha256").update(text).digest("hex");
  return { schema:"agent-shield/document-ingest-receipt/v1", module:"document-ingest", interfaceVersion:"1.1.0", state:"PASS", artifacts:[{kind:"text",sha256:output}], detail:`${text.length} UTF-8 characters` };
}
