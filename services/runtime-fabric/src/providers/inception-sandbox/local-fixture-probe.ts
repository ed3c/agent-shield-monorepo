import { readFileSync, writeFileSync } from "node:fs";

const input = JSON.parse(readFileSync("probe-input.json", "utf8")) as {
  schema: string;
  leaseId: string;
  workspaceName: string;
};

if (input.schema !== "agent-shield/inception-local-fixture-input/v1") {
  throw new Error("unexpected fixture input schema");
}
if (!input.leaseId || !input.workspaceName) {
  throw new Error("fixture lease identity is required");
}

const output = {
  schema: "agent-shield/inception-local-fixture-output/v1",
  leaseId: input.leaseId,
  workspaceName: input.workspaceName,
  result: "PASS",
};

const encoded = JSON.stringify(output);
writeFileSync("probe-output.json", encoded, "utf8");
console.log(encoded);
