import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import {
  bindingDigestOf,
  resolveRuntimeBinding,
  runtimeBindingState,
  scanSecretFree,
  verifyRuntimeBinding,
  type CarrierPolicy,
  type RuntimeBinding,
  type RuntimeCatalog,
  type RuntimeProfile,
  type RuntimeRequirements,
  type RuntimeWorkload,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-RUNTIME ${message}`);
}

const RELEASE: ReleaseSubject = {
  repository: "https://github.com/ed3c/agent-shield-monorepo",
  commit: "1".repeat(40),
  tree: "2".repeat(40),
  releaseId: "runtime-env@0.3.0",
  releaseDigest: "3".repeat(64),
};

function profile(overrides: Partial<RuntimeProfile> = {}): RuntimeProfile {
  return {
    id: "settlement-local",
    version: "1.0.0",
    profileSha256: "a".repeat(64),
    scope: "local",
    variables: [
      { name: "AGENT_SHIELD_MODE", secret: false, required: true, defaultValue: "local" },
      { name: "AGENT_SHIELD_BROKER_REF", secret: true, required: true, defaultValue: null },
      { name: "AGENT_SHIELD_CLOUD_REGION", secret: false, required: false, defaultValue: null },
    ],
    ...overrides,
  };
}

function workload(id: string, overrides: Partial<RuntimeWorkload> = {}): RuntimeWorkload {
  return {
    id,
    entrypointPath: `scripts/workloads/${id}.ts`,
    entrypointSha256: "b".repeat(64),
    variableNames: ["AGENT_SHIELD_MODE"],
    network: "deny-all",
    allowedHosts: [],
    mutation: "workspace",
    receiptRequired: true,
    ...overrides,
  };
}

function policy(carrier: CarrierPolicy["carrier"], overrides: Partial<CarrierPolicy> = {}): CarrierPolicy {
  return {
    carrier,
    configPaths: [`config/${carrier}/runtime.json`],
    allowedVariableNames: ["AGENT_SHIELD_MODE"],
    ...overrides,
  };
}

function catalog(overrides: Partial<RuntimeCatalog> = {}): RuntimeCatalog {
  return {
    release: RELEASE,
    workingTreeClean: true,
    modules: ["runtime-fabric", "security-boundaries", "document-ingest"],
    profiles: [profile(), profile({ id: "settlement-cloud", scope: "cloud" })],
    workloads: [workload("verify"), workload("selftest"), workload("unused")],
    policies: [policy("claude-code"), policy("codex-cli"), policy("native")],
    ...overrides,
  };
}

function requirements(overrides: Partial<RuntimeRequirements> = {}): RuntimeRequirements {
  return {
    consumerId: "bettor-arena",
    modules: ["runtime-fabric"],
    profileId: "settlement-local",
    workloadIds: ["verify"],
    carriers: ["claude-code", "codex-cli"],
    ...overrides,
  };
}

// INT-RUNTIME-001 immutable source
function immutableSource(): void {
  const resolved = resolveRuntimeBinding(catalog(), requirements());
  ok(resolved.outcome === "BINDING_LOCKED", `a clean catalog reported ${resolved.outcome}: ${resolved.detail}`);

  ok(resolveRuntimeBinding(catalog({ workingTreeClean: false }), requirements()).outcome === "MUTABLE_SOURCE", "a dirty catalog was pinned");
  for (const [label, patch] of [
    ["a branch name", { commit: "main" }],
    ["a short commit", { commit: "1".repeat(7) }],
    ["a moving tree", { tree: "HEAD" }],
  ] as const) {
    ok(
      resolveRuntimeBinding(catalog({ release: { ...RELEASE, ...patch } }), requirements()).outcome === "MUTABLE_SOURCE",
      `${label} was pinned`,
    );
  }
  ok(
    resolveRuntimeBinding(catalog({ profiles: [profile({ profileSha256: "short" })] }), requirements()).outcome === "PROFILE_CONFLICT",
    "an unpinned profile was resolved",
  );
  ok(
    resolveRuntimeBinding(catalog({ workloads: [workload("verify", { entrypointSha256: "short" })] }), requirements()).outcome === "WORKLOAD_CONFLICT",
    "an unpinned entrypoint was resolved",
  );
}

// INT-RUNTIME-002 minimal closure
function minimalClosure(): void {
  const binding = resolveRuntimeBinding(catalog(), requirements()).binding as RuntimeBinding;
  ok(binding.modules.join(",") === "runtime-fabric", `the closure carries ${binding.modules.join(",")}`);
  ok(binding.workloads.length === 1 && binding.workloads[0].id === "verify", "an unselected workload was copied");
  ok(binding.policies.length === 2, "a policy for an unselected carrier was copied");
  ok(binding.profile.id === "settlement-local", "the wrong profile was resolved");

  ok(
    resolveRuntimeBinding(catalog(), requirements({ modules: ["not-in-catalog"] })).outcome === "MISSING_MODULE",
    "an absent module was selected",
  );
  ok(
    resolveRuntimeBinding(catalog(), requirements({ profileId: "absent" })).outcome === "PROFILE_CONFLICT",
    "an absent profile was selected",
  );
  ok(
    resolveRuntimeBinding(catalog(), requirements({ workloadIds: ["absent"] })).outcome === "WORKLOAD_CONFLICT",
    "an absent workload was selected",
  );
  ok(
    resolveRuntimeBinding(catalog({ policies: [policy("claude-code")] }), requirements()).outcome === "POLICY_CONFLICT",
    "a carrier with no policy was bound",
  );
}

// INT-RUNTIME-003 secret-free
function secretFree(): void {
  const binding = resolveRuntimeBinding(catalog(), requirements()).binding as RuntimeBinding;
  ok(scanSecretFree(binding).ok, "a clean binding failed its own secret scan");

  // The scan must be able to fail, or its clean result proves nothing.
  for (const [label, planted] of [
    ["an API key", { ...binding, planted: "sk-0123456789abcdefghij" }],
    ["a GitHub token", { ...binding, planted: "ghp_0123456789abcdefghijklmnopqrstuvwx" }],
    ["a JWT", { ...binding, planted: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" }],
    ["a private key", { ...binding, planted: "-----BEGIN RSA PRIVATE KEY-----" }],
    ["a Slack token", { ...binding, planted: "xoxb-0123456789-abcdefghij" }],
    ["a host path", { ...binding, planted: "/home/owner/.config/agent" }],
    ["a Windows path", { ...binding, planted: "C:\\Users\\owner\\config" }],
    ["a dotenv file", { ...binding, planted: "services/.env" }],
    ["a keychain file", { ...binding, planted: "login.keychain" }],
    ["a browser cookie store", { ...binding, planted: "cookies.sqlite" }],
    ["a certificate", { ...binding, planted: "client.pem" }],
  ] as const) {
    ok(!scanSecretFree(planted).ok, `the scan missed ${label}`);
  }

  // And a planted value inside the catalog stops the resolve rather than being bound.
  const planted = resolveRuntimeBinding(
    catalog({ workloads: [workload("verify", { entrypointPath: "scripts/workloads/sk-0123456789abcdefghij.ts" })] }),
    requirements(),
  );
  ok(planted.outcome !== "BINDING_LOCKED", "a planted credential value was bound");
}

// INT-RUNTIME-004 safe defaults
function safeDefaults(): void {
  const withSecretDefault = resolveRuntimeBinding(
    catalog({ profiles: [profile({ variables: [{ name: "AGENT_SHIELD_BROKER_REF", secret: true, required: true, defaultValue: "fallback" }] })] }),
    requirements(),
  );
  ok(withSecretDefault.outcome === "SECRET_VALUE_DETECTED", `a secret default reported ${withSecretDefault.outcome}`);

  // An optional cloud input must not break the local-only route: the local profile declares it
  // as not required and with no default, and the binding still locks.
  const binding = resolveRuntimeBinding(catalog(), requirements()).binding as RuntimeBinding;
  const cloud = binding.profile.variables.find((variable) => variable.name === "AGENT_SHIELD_CLOUD_REGION");
  ok(cloud !== undefined && !cloud.required && cloud.defaultValue === null, "the optional cloud input changed shape");
  ok(binding.profile.scope === "local", "the local route resolved a non-local profile");

  const duplicated = resolveRuntimeBinding(
    catalog({ profiles: [profile({ variables: [...profile().variables, { name: "AGENT_SHIELD_MODE", secret: false, required: true, defaultValue: "x" }] })] }),
    requirements(),
  );
  ok(duplicated.outcome === "PROFILE_CONFLICT", `a duplicated variable reported ${duplicated.outcome}`);

  const lowercase = resolveRuntimeBinding(
    catalog({ profiles: [profile({ variables: [{ name: "agent_shield_mode", secret: false, required: true, defaultValue: null }] })] }),
    requirements(),
  );
  ok(lowercase.outcome === "PROFILE_CONFLICT", `a non-environment variable name reported ${lowercase.outcome}`);
}

// INT-RUNTIME-005 exact environment
function exactEnvironment(): void {
  const binding = resolveRuntimeBinding(catalog(), requirements()).binding as RuntimeBinding;
  for (const projection of binding.projections) {
    ok(projection.variableNames.join(",") === "AGENT_SHIELD_MODE", `${projection.carrier} received ${projection.variableNames.join(",")}`);
    ok(!projection.variableNames.includes("AGENT_SHIELD_BROKER_REF"), `${projection.carrier} received a secret name it does not admit`);
  }

  // A workload declaring a name the profile does not is a conflict, not a silent extra.
  const undeclared = resolveRuntimeBinding(
    catalog({ workloads: [workload("verify", { variableNames: ["AGENT_SHIELD_UNKNOWN"] })] }),
    requirements(),
  );
  ok(undeclared.outcome === "WORKLOAD_CONFLICT", `an undeclared variable reported ${undeclared.outcome}`);

  // A carrier that admits a name no selected workload declares receives nothing extra.
  const widened = resolveRuntimeBinding(
    catalog({ policies: [policy("claude-code", { allowedVariableNames: ["AGENT_SHIELD_MODE", "AGENT_SHIELD_CLOUD_REGION"] }), policy("codex-cli"), policy("native")] }),
    requirements(),
  ).binding as RuntimeBinding;
  const claude = widened.projections.find((entry) => entry.carrier === "claude-code");
  ok(claude?.variableNames.join(",") === "AGENT_SHIELD_MODE", `a widened policy leaked ${claude?.variableNames.join(",")}`);
}

// INT-RUNTIME-006 workload closure
function workloadClosure(): void {
  const binding = resolveRuntimeBinding(catalog(), requirements()).binding as RuntimeBinding;
  const selected = binding.workloads[0];
  ok(selected.entrypointPath.endsWith(".ts") && selected.entrypointSha256.length === 64, "the workload entrypoint is not pinned");
  ok(selected.receiptRequired, "the workload does not require a receipt");
  ok(Object.keys(selected).sort().join(",") === "allowedHosts,entrypointPath,entrypointSha256,id,mutation,network,receiptRequired,variableNames",
    "the workload grew a field beyond its declared closure");

  // No `as const`: it would make the nested arrays readonly, which Partial<RuntimeWorkload>
  // does not accept.
  const networkPatches: Array<[string, Partial<RuntimeWorkload>]> = [
    ["a deny-all workload listing hosts", { allowedHosts: ["example.com"] }],
    ["an allowlist workload with no hosts", { network: "allowlist" }],
    ["an invalid host", { network: "allowlist", allowedHosts: ["not a host"] }],
  ];
  for (const [label, patch] of networkPatches) {
    ok(
      resolveRuntimeBinding(catalog({ workloads: [workload("verify", patch)] }), requirements()).outcome === "POLICY_CONFLICT",
      `${label} was bound`,
    );
  }
  // Two rules, two controls. A host location and a merely malformed path must be separable,
  // or whichever check runs second is untestable.
  ok(
    resolveRuntimeBinding(catalog({ workloads: [workload("verify", { entrypointPath: "/opt/run.sh" })] }), requirements()).outcome === "HOST_PATH_DETECTED",
    "a host entrypoint path was bound",
  );
  ok(
    resolveRuntimeBinding(catalog({ workloads: [workload("verify", { entrypointPath: "scripts/workloads/verify" })] }), requirements()).outcome === "WORKLOAD_CONFLICT",
    "an extensionless entrypoint was bound",
  );
}

// INT-RUNTIME-007 offline consumer verification
function offlineVerification(): void {
  const binding = resolveRuntimeBinding(catalog(), requirements()).binding as RuntimeBinding;
  ok(verifyRuntimeBinding(binding).ok, "a genuine binding failed verification");
  ok(verifyRuntimeBinding.length === 1, "verification takes something beyond the binding");

  // A consumer with no upstream checkout has exactly these bytes.
  const roundTripped = JSON.parse(JSON.stringify(binding)) as RuntimeBinding;
  ok(verifyRuntimeBinding(roundTripped).ok, "a binding could not be verified from its own bytes");

  const tampered: RuntimeBinding = { ...binding, modules: [...binding.modules, "smuggled"] };
  ok(!verifyRuntimeBinding(tampered).ok, "a tampered binding passed verification");

  // A resealed binding carrying a planted value: the digest is valid and every projection
  // still matches its policy, so only the secret scan inside verification can catch it. A
  // consumer that only checked digests would accept this.
  const plantedDraft = { ...binding, modules: [...binding.modules, "sk-0123456789abcdefghij"] } as RuntimeBinding;
  const planted: RuntimeBinding = { ...plantedDraft, bindingDigest: bindingDigestOf(plantedDraft) };
  ok(!verifyRuntimeBinding(planted).ok, "a resealed binding carrying a value passed verification");
  ok(
    verifyRuntimeBinding(planted).detail.includes("credential-shaped"),
    "the planted value was rejected by the wrong rule",
  );

  // Forged projection with a *valid* digest, so the digest rule cannot mask the projection
  // recomputation. Without resealing, every other rule in verification is untestable.
  const forged: RuntimeBinding = {
    ...binding,
    projections: binding.projections.map((projection) => ({ ...projection, variableNames: [...projection.variableNames, "AGENT_SHIELD_BROKER_REF"] })),
  };
  const resealed: RuntimeBinding = { ...forged, bindingDigest: bindingDigestOf(forged) };
  ok(bindingDigestOf(resealed) === resealed.bindingDigest, "the resealed fixture does not carry a valid digest");
  ok(!verifyRuntimeBinding(resealed).ok, "a resealed forged projection passed verification");
  ok(
    verifyRuntimeBinding(resealed).detail.includes("does not match its policy"),
    "a resealed forgery was rejected by the digest rule rather than the projection rule",
  );

  // Both of these are resealed too, so each is caught by its own rule rather than by the
  // digest rule standing in front of everything else.
  const wrongSchemaDraft = { ...binding, schema: "agent-shield/runtime-binding/v0" } as unknown as RuntimeBinding;
  const wrongSchema: RuntimeBinding = { ...wrongSchemaDraft, bindingDigest: bindingDigestOf(wrongSchemaDraft) };
  ok(!verifyRuntimeBinding(wrongSchema).ok, "an unsupported schema passed verification");
  ok(verifyRuntimeBinding(wrongSchema).detail.includes("schema"), "the schema rule did not reject the schema forgery");

  const strayDraft: RuntimeBinding = {
    ...binding,
    projections: [...binding.projections, { carrier: "native", variableNames: [], workloadIds: [], projectionDigest: "0".repeat(64) }],
  };
  const stray: RuntimeBinding = { ...strayDraft, bindingDigest: bindingDigestOf(strayDraft) };
  ok(!verifyRuntimeBinding(stray).ok, "a projection for an unbound carrier passed verification");
  ok(verifyRuntimeBinding(stray).detail.includes("has no policy"), "the stray projection was rejected by the wrong rule");
}

// INT-RUNTIME-008 carrier isolation
function carrierIsolation(): void {
  const shared = resolveRuntimeBinding(
    catalog({ policies: [policy("claude-code"), policy("codex-cli", { configPaths: ["config/claude-code/runtime.json"] }), policy("native")] }),
    requirements(),
  );
  ok(shared.outcome === "POLICY_CONFLICT", `a shared config path reported ${shared.outcome}`);

  const binding = resolveRuntimeBinding(catalog(), requirements()).binding as RuntimeBinding;
  const paths = binding.policies.flatMap((entry) => entry.configPaths);
  ok(new Set(paths).size === paths.length, "two carriers share a config path in the binding");
  for (const entry of binding.policies) {
    ok(entry.configPaths.every((path) => path.includes(entry.carrier)), `carrier ${entry.carrier} claims another carrier's path`);
  }

  const hostConfig = resolveRuntimeBinding(
    catalog({ policies: [policy("claude-code", { configPaths: ["/etc/claude/runtime.json"] }), policy("codex-cli"), policy("native")] }),
    requirements(),
  );
  ok(hostConfig.outcome === "HOST_PATH_DETECTED", `a host config path reported ${hostConfig.outcome}`);

  const malformedConfig = resolveRuntimeBinding(
    catalog({ policies: [policy("claude-code", { configPaths: ["config/claude-code/Runtime"] }), policy("codex-cli"), policy("native")] }),
    requirements(),
  );
  ok(malformedConfig.outcome === "POLICY_CONFLICT", `a malformed config path reported ${malformedConfig.outcome}`);
}

// INT-RUNTIME-009 staleness and removal
function stalenessAndRemoval(): void {
  const before = resolveRuntimeBinding(catalog(), requirements()).binding as RuntimeBinding;

  const changedSource = resolveRuntimeBinding(
    catalog({ release: { ...RELEASE, commit: "9".repeat(40) } }),
    requirements(),
  ).binding as RuntimeBinding;
  ok(changedSource.bindingDigest !== before.bindingDigest, "a changed source did not stale the binding");

  const changedProfile = resolveRuntimeBinding(
    catalog({ profiles: [profile({ profileSha256: "f".repeat(64) })] }),
    requirements(),
  ).binding as RuntimeBinding;
  ok(changedProfile.bindingDigest !== before.bindingDigest, "a changed profile did not stale the binding");

  // Removing a carrier removes its projection entirely: no orphan is left behind.
  const fewer = resolveRuntimeBinding(catalog(), requirements({ carriers: ["claude-code"] })).binding as RuntimeBinding;
  ok(fewer.projections.length === 1 && fewer.projections[0].carrier === "claude-code", "removing a carrier left an orphan projection");
  ok(fewer.policies.length === 1, "removing a carrier left its policy behind");
  ok(fewer.bindingDigest !== before.bindingDigest, "removing a carrier did not change the binding digest");

  // Adding an unselected workload to the catalog changes nothing.
  const inflated = resolveRuntimeBinding(
    catalog({ workloads: [...catalog().workloads, workload("extra")] }),
    requirements(),
  ).binding as RuntimeBinding;
  ok(inflated.bindingDigest === before.bindingDigest, "an unselected catalog workload staled the binding");
}

function evidenceBoundary(): void {
  ok(runtimeBindingState.hostValuePresence === "NOT_EXERCISED", "host value presence was claimed");
  ok(runtimeBindingState.workloadExecution === "NOT_IMPLEMENTED", "workload execution was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const runtimeNeverPasses: NeverPass<typeof runtimeBindingState> = true;
void runtimeNeverPasses;

immutableSource();
minimalClosure();
secretFree();
safeDefaults();
exactEnvironment();
workloadClosure();
offlineVerification();
carrierIsolation();
stalenessAndRemoval();
evidenceBoundary();

console.log("SELFTEST GREEN: INT-RUNTIME immutable source, minimal closure, secret-free, safe defaults, exact environment, workload closure, offline verification, carrier isolation, staleness and removal");
