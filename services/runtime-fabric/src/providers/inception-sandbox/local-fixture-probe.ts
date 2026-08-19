const input = await Bun.file("probe-input.json").json() as {
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

await Bun.write("probe-output.json", JSON.stringify(output));
process.stdout.write(JSON.stringify(output));
