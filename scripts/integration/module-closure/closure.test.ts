import type { ReleaseSubject } from "../../../packages/contracts/src/integration/index.ts";
import {
  moduleClosureState,
  moduleDigest,
  resolveClosureLock,
  type ClosureRequirements,
  type ComponentManifest,
  type InterfaceSignature,
  type ModuleManifest,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-CLOSURE ${message}`);
}

function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid closure contract: "), `${message} threw "${text}" rather than a closure contract error`);
}

const RELEASE: ReleaseSubject = {
  repository: "https://github.com/ed3c/agent-shield-monorepo",
  commit: "1".repeat(40),
  tree: "2".repeat(40),
  releaseId: "agent-shield-module-set@0.1.0",
  releaseDigest: "3".repeat(64),
};

function component(id: string, files: string[], overrides: Partial<ComponentManifest> = {}): ComponentManifest {
  const fileDigests: Record<string, string> = {};
  for (const [index, file] of files.entries()) fileDigests[file] = String(index + 1).repeat(64).slice(0, 64);
  return { id, files, fileDigests, visibility: "public", optional: false, ...overrides };
}

function signature(capability: string, overrides: Partial<InterfaceSignature> = {}): InterfaceSignature {
  return {
    capability,
    majorVersion: 2,
    inputDigest: "a".repeat(64),
    outputDigest: "b".repeat(64),
    exitCodes: [0, 1],
    effects: ["workspace-write"],
    ...overrides,
  };
}

function runtimeModule(overrides: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    id: "runtime-fabric",
    interfaceVersion: "2.0.0",
    manifestSha256: "c".repeat(64),
    provides: [{ capability: "runtime.provider/v2", exclusive: true }],
    requires: [],
    components: [component("runtime-core", ["services/runtime-fabric/src/index.ts"])],
    signatures: [signature("runtime.provider/v2")],
    ...overrides,
  };
}

function consumerModule(overrides: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    id: "bettor-consumer",
    interfaceVersion: "1.0.0",
    manifestSha256: "d".repeat(64),
    provides: [{ capability: "bettor.consumer/v1", exclusive: true }],
    requires: ["runtime.provider/v2"],
    components: [
      component("consumer-core", ["scripts/bootstrap-bettor.ts"]),
      component("consumer-private", ["scripts/private-notes.ts"], { visibility: "private" }),
      component("consumer-extra", ["scripts/optional-extra.ts"], { optional: true }),
    ],
    signatures: [signature("bettor.consumer/v1", { majorVersion: 1 })],
    ...overrides,
  };
}

function ingestModule(overrides: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    id: "document-ingest",
    interfaceVersion: "1.1.0",
    manifestSha256: "e".repeat(64),
    provides: [{ capability: "document.ingest/v1", exclusive: false }],
    requires: [],
    components: [component("ingest-core", ["services/document-ingest/src/index.ts"])],
    signatures: [signature("document.ingest/v1", { majorVersion: 1 })],
    ...overrides,
  };
}

const CATALOG: ModuleManifest[] = [runtimeModule(), consumerModule(), ingestModule()];

function requirements(overrides: Partial<ClosureRequirements> = {}): ClosureRequirements {
  return {
    consumerId: "bettor-arena",
    modules: ["bettor-consumer"],
    components: [],
    capabilities: [],
    expects: [],
    ...overrides,
  };
}

// INT-CLOSURE-001 deterministic resolution
function deterministic(): void {
  const first = resolveClosureLock(RELEASE, CATALOG, requirements());
  ok(first.outcome === "CLOSURE_LOCKED", `a valid closure reported ${first.outcome}: ${first.detail}`);

  const reordered = resolveClosureLock(RELEASE, [...CATALOG].reverse(), requirements());
  ok(reordered.outcome === "CLOSURE_LOCKED", "a reordered catalog failed to resolve");
  ok(
    JSON.stringify(first.lock) === JSON.stringify(reordered.lock),
    "the lock depends on the order the catalog arrived in",
  );

  const reorderedRoots = resolveClosureLock(RELEASE, CATALOG, requirements({ modules: ["bettor-consumer", "bettor-consumer"] }));
  ok(
    reorderedRoots.lock?.closureDigest === first.lock?.closureDigest,
    "a repeated root changed the closure digest",
  );
  ok(first.lock?.moduleIds.join(",") === "bettor-consumer,runtime-fabric", "the lock is not sorted");
}

// INT-CLOSURE-002 transitive dependencies
function transitive(): void {
  const resolved = resolveClosureLock(RELEASE, CATALOG, requirements());
  ok(resolved.lock?.moduleIds.includes("runtime-fabric"), "a transitive provider was not pulled in");
  ok(!resolved.lock?.moduleIds.includes("document-ingest"), "an unrequested module was pulled in");

  const withoutProvider = resolveClosureLock(RELEASE, [consumerModule(), ingestModule()], requirements());
  ok(withoutProvider.outcome === "MISSING_CAPABILITY", `a removed transitive provider reported ${withoutProvider.outcome}`);

  const absentModule = resolveClosureLock(RELEASE, CATALOG, requirements({ modules: ["not-here"] }));
  ok(absentModule.outcome === "MISSING_MODULE", `an absent module reported ${absentModule.outcome}`);

  const byCapability = resolveClosureLock(RELEASE, CATALOG, requirements({ capabilities: ["document.ingest/v1"] }));
  ok(byCapability.lock?.moduleIds.includes("document-ingest"), "a required capability did not pull in its provider");

  const absentCapability = resolveClosureLock(RELEASE, CATALOG, requirements({ capabilities: ["absent.thing/v1"] }));
  ok(absentCapability.outcome === "MISSING_CAPABILITY", `an unprovided capability reported ${absentCapability.outcome}`);

  // A dependency cycle must fail rather than resolve to whichever order the walk took.
  const cyclic = [
    runtimeModule({ requires: ["bettor.consumer/v1"] }),
    consumerModule(),
  ];
  const cycle = resolveClosureLock(RELEASE, cyclic, requirements());
  ok(cycle.outcome === "CYCLE", `a dependency cycle reported ${cycle.outcome}`);
}

// INT-CLOSURE-003 provider uniqueness
function providerUniqueness(): void {
  const duplicate = resolveClosureLock(
    RELEASE,
    [...CATALOG, runtimeModule({ id: "runtime-fabric-2", components: [component("alt-core", ["services/alt/index.ts"])] })],
    requirements(),
  );
  ok(duplicate.outcome === "DUPLICATE_PROVIDER", `two providers for one exclusive capability reported ${duplicate.outcome}`);

  const duplicateId = resolveClosureLock(RELEASE, [...CATALOG, ingestModule()], requirements());
  ok(duplicateId.outcome === "DUPLICATE_PROVIDER", `a duplicated module id reported ${duplicateId.outcome}`);
}

// INT-CLOSURE-004 path ownership
function pathOwnership(): void {
  const overlapping = resolveClosureLock(
    RELEASE,
    [runtimeModule(), consumerModule({
      components: [component("consumer-core", ["services/runtime-fabric/src/index.ts"])],
    })],
    requirements(),
  );
  ok(overlapping.outcome === "PATH_CONFLICT", `an overlapping file reported ${overlapping.outcome}`);

  // Exact duplication and prefix nesting are two different rules. The resolver admits a path
  // whose directory component carries an extension, so a nested pair is reachable and needs
  // its own control rather than being covered by the exact-match check above.
  const nested = resolveClosureLock(
    RELEASE,
    [
      runtimeModule({ components: [component("runtime-core", ["services/runtime.ts"])] }),
      consumerModule({ components: [component("consumer-core", ["services/runtime.ts/inner.ts"])] }),
    ],
    requirements(),
  );
  ok(nested.outcome === "PATH_CONFLICT", `a nested path pair reported ${nested.outcome}`);

  const resolved = resolveClosureLock(RELEASE, CATALOG, requirements());
  const files = (resolved.lock?.components ?? []).flatMap((entry) => entry.files);
  ok(new Set(files).size === files.length, "a file appears under two owners in the lock");
}

// INT-CLOSURE-005 interface compatibility
function interfaceCompatibility(): void {
  const matching = resolveClosureLock(RELEASE, CATALOG, requirements({ expects: [signature("runtime.provider/v2")] }));
  ok(matching.outcome === "CLOSURE_LOCKED", `a matching interface expectation reported ${matching.outcome}`);

  // No `as const` here: it would make the nested arrays readonly, which Partial<InterfaceSignature>
  // does not accept.
  const drifts: Array<[string, Partial<InterfaceSignature>]> = [
    ["input schema", { inputDigest: "9".repeat(64) }],
    ["output schema", { outputDigest: "9".repeat(64) }],
    ["exit codes", { exitCodes: [0, 1, 2] }],
    ["declared effects", { effects: ["workspace-write", "network"] }],
    ["major version", { majorVersion: 3 }],
  ];
  for (const [label, drift] of drifts) {
    const drifted = resolveClosureLock(RELEASE, CATALOG, requirements({ expects: [signature("runtime.provider/v2", drift)] }));
    ok(drifted.outcome === "INTERFACE_CONFLICT", `a changed ${label} reported ${drifted.outcome}`);
  }

  const undeclared = resolveClosureLock(
    RELEASE,
    [runtimeModule({ signatures: [] }), consumerModule()],
    requirements({ expects: [signature("runtime.provider/v2")] }),
  );
  ok(undeclared.outcome === "INTERFACE_CONFLICT", `a module declaring no signature reported ${undeclared.outcome}`);
}

// INT-CLOSURE-006 private and unselected exclusion
function exclusion(): void {
  const resolved = resolveClosureLock(RELEASE, CATALOG, requirements());
  const ids = (resolved.lock?.components ?? []).map((entry) => entry.componentId);
  ok(!ids.includes("consumer-private"), "a private component was bundled");
  ok(!ids.includes("consumer-extra"), "an unselected optional component was bundled");
  ok(ids.includes("consumer-core"), "a public required component was dropped");

  const selectedOptional = resolveClosureLock(RELEASE, CATALOG, requirements({ components: ["consumer-extra"] }));
  ok(
    (selectedOptional.lock?.components ?? []).some((entry) => entry.componentId === "consumer-extra"),
    "an explicitly selected optional component was still excluded",
  );

  const absentComponent = resolveClosureLock(RELEASE, CATALOG, requirements({ components: ["consumer-private"] }));
  ok(absentComponent.outcome === "MISSING_COMPONENT", `selecting a private component reported ${absentComponent.outcome}`);

  for (const [label, file] of [
    ["a runtime directory", "node_modules/pkg/index.ts"],
    ["a build output", "dist/bundle.js"],
    ["a git internal", ".git/config.ts"],
    ["a temp path", "tmp/scratch.ts"],
    // An absolute path that avoids the host-home token the repository's own verify.ts forbids
    // in tracked files. The rule under test is "not repository-relative", not which root.
    ["an absolute path", "/opt/owner-checkout/file.ts"],
    ["a traversal", "services/../../escape.ts"],
  ] as const) {
    red(
      () => resolveClosureLock(RELEASE, [runtimeModule({ components: [component("bad", [file])] }), consumerModule()], requirements()),
      `a component tracking ${label}`,
    );
  }
  // Two separate rules, so two separate controls. An empty digest map also disagrees with the
  // file list, which the declaration-consistency rule catches first -- so the malformed-digest
  // rule needs a case where the key is present and only its value is wrong.
  red(
    () => resolveClosureLock(
      RELEASE,
      [runtimeModule({ components: [{ ...component("bad", ["services/a.ts"]), fileDigests: { "services/a.ts": "not-a-digest" } }] }), consumerModule()],
      requirements(),
    ),
    "a component whose file digest is malformed",
  );
  // An empty digest map is caught by the per-file rule above, so the consistency rule needs the
  // opposite shape: every listed file has a valid digest and the map carries an extra key.
  red(
    () => resolveClosureLock(
      RELEASE,
      [runtimeModule({
        components: [{
          ...component("bad", ["services/a.ts"]),
          fileDigests: { "services/a.ts": "1".repeat(64), "services/unlisted.ts": "2".repeat(64) },
        }],
      }), consumerModule()],
      requirements(),
    ),
    "a component declaring a digest for a file it does not track",
  );
}

// INT-CLOSURE-007 transitive invalidation
function invalidation(): void {
  const before = resolveClosureLock(RELEASE, CATALOG, requirements());
  const changedUnrelated = resolveClosureLock(
    RELEASE,
    [runtimeModule(), consumerModule(), ingestModule({ manifestSha256: "f".repeat(64) })],
    requirements(),
  );
  ok(
    before.lock?.closureDigest === changedUnrelated.lock?.closureDigest,
    "a change to an unselected module staled the closure",
  );

  const changedProvider = resolveClosureLock(
    RELEASE,
    [runtimeModule({ manifestSha256: "f".repeat(64) }), consumerModule(), ingestModule()],
    requirements(),
  );
  ok(
    before.lock?.closureDigest !== changedProvider.lock?.closureDigest,
    "a change to a selected transitive provider did not stale the closure",
  );
  ok(
    before.lock?.moduleDigests["bettor-consumer"] === changedProvider.lock?.moduleDigests["bettor-consumer"],
    "changing a provider staled an unrelated module's own digest",
  );

  // A module digest covers its own manifest and components and nothing else, so the repository
  // head is deliberately not an input.
  ok(moduleDigest(runtimeModule()) === moduleDigest(runtimeModule()), "a module digest is not stable");
  ok(
    moduleDigest(runtimeModule()) !== moduleDigest(runtimeModule({ manifestSha256: "f".repeat(64) })),
    "a module digest ignores its own manifest",
  );
  ok(
    moduleDigest(runtimeModule()) !== moduleDigest(runtimeModule({
      components: [component("runtime-core", ["services/runtime-fabric/src/index.ts", "services/runtime-fabric/src/extra.ts"])],
    })),
    "a module digest ignores its own components",
  );
}

// INT-CLOSURE-008 immutable pin
function immutablePin(): void {
  for (const [label, patch] of [
    ["a branch name", { commit: "main" }],
    ["a short commit", { commit: "1".repeat(7) }],
    ["a moving tree", { tree: "HEAD" }],
    ["a malformed release digest", { releaseDigest: "nope" }],
  ] as const) {
    const pinned = resolveClosureLock({ ...RELEASE, ...patch }, CATALOG, requirements());
    ok(pinned.outcome === "ABSENT_RELEASE", `${label} reported ${pinned.outcome}`);
  }

  const noConsumer = resolveClosureLock(RELEASE, CATALOG, requirements({ consumerId: "Bettor Arena" }));
  ok(noConsumer.outcome === "INVALID_REQUIREMENTS", `an invalid consumer id reported ${noConsumer.outcome}`);
  const noModules = resolveClosureLock(RELEASE, CATALOG, requirements({ modules: [] }));
  ok(noModules.outcome === "INVALID_REQUIREMENTS", `empty requirements reported ${noModules.outcome}`);
}

function evidenceBoundary(): void {
  ok(moduleClosureState.skillsProjection === "NOT_EXERCISED", "a Skills projection was claimed");
  ok(moduleClosureState.liveOrigin === "NOT_IMPLEMENTED", "a live origin was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const closureNeverPasses: NeverPass<typeof moduleClosureState> = true;
void closureNeverPasses;

deterministic();
transitive();
providerUniqueness();
pathOwnership();
interfaceCompatibility();
exclusion();
invalidation();
immutablePin();
evidenceBoundary();

console.log("SELFTEST GREEN: INT-CLOSURE determinism, transitive dependencies, provider uniqueness, path ownership, interface compatibility, exclusion, invalidation, immutable pin");
