import type { ProductOutcome } from "../../../packages/contracts/src/product/index.ts";
import {
  ALLOWED_RUNTIME_IMPORTS,
  type ExpoActionDefinition,
  type ExpoActionRequest,
  type ScreenTarget,
  type ShippedModule,
  type ToolchainSubject,
  type ViewState,
  type ViewTone,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const TARGET_ID = /^[a-z][a-z0-9-]{2,63}$/;
const ACTION_ID = /^[a-z][a-z0-9.-]{2,63}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const ARGUMENT_KEY = /^[a-z][a-zA-Z0-9]{0,31}$/;
const MAX_ARGUMENT_LENGTH = 256;

export function fail(message: string): never {
  throw new Error(`invalid expo contract: ${message}`);
}

// UX-EXPO-001. Exact tooling versions, and an app runtime that is not the tooling.
//
// Bun builds the bundle and is never present when the bundle runs. A subject naming `bun` or
// `node` as the app runtime describes something that cannot exist on a device, and it is the
// mistake that produces code importing `node:fs` and passing every check until install.
export function assertToolchain(subject: ToolchainSubject): ToolchainSubject {
  for (const [name, value] of [
    ["bunVersion", subject.bunVersion],
    ["typescriptVersion", subject.typescriptVersion],
    ["expoSdkVersion", subject.expoSdkVersion],
    ["reactNativeVersion", subject.reactNativeVersion],
  ] as const) {
    if (!SEMVER.test(value)) fail(`${name} must be an exact three-part version`);
  }
  if (subject.appRuntime !== "hermes" && subject.appRuntime !== "jsc") {
    fail(`app runtime ${subject.appRuntime} is tooling, not a device runtime`);
  }
  return subject;
}

// UX-EXPO-001. The shipped runtime's import surface.
//
// An allowlist rather than a denylist of Bun globals: a denylist has to be extended every time
// the tooling grows an API, and the version that has not been extended yet looks exactly like a
// passing check. Relative paths are the app's own modules and are admitted by shape.
export function runtimeImportRefusal(modules: readonly ShippedModule[]): string | null {
  if (modules.length === 0) return "the shipped runtime declares no modules";
  for (const module of modules) {
    if (!module.path.startsWith("apps/mobile-app/")) return `${module.path} is not a mobile-app module`;
    for (const specifier of module.imports) {
      if (specifier.startsWith("./") || specifier.startsWith("../")) continue;
      if (!ALLOWED_RUNTIME_IMPORTS.includes(specifier)) {
        return `${module.path} imports ${specifier}, which is not available on a device runtime`;
      }
    }
  }
  return null;
}

// UX-EXPO-003. The accessibility catalog. `targetId` is the platform-neutral identity a QA
// adapter addresses, so a duplicate makes two elements indistinguishable and an absent one
// makes an element unreachable -- both are contract breaks, not cosmetic problems.
export function assertScreenCatalog(targets: readonly ScreenTarget[]): ReadonlyMap<string, ScreenTarget> {
  if (targets.length === 0) fail("the screen catalog is empty");
  const byId = new Map<string, ScreenTarget>();
  for (const target of targets) {
    if (!TARGET_ID.test(target.targetId)) fail(`target identifier ${target.targetId} is not a stable platform-neutral identity`);
    if (byId.has(target.targetId)) fail(`target identifier ${target.targetId} is declared twice`);
    // A critical target is one an automated run asserts against. An unlabelled one is
    // announced as nothing by a screen reader and matched by nothing by a QA adapter.
    if (target.critical && target.label.trim().length === 0) fail(`critical target ${target.targetId} has no label`);
    if (target.critical && target.role === "region") fail(`critical target ${target.targetId} is not an interactive role`);
    byId.set(target.targetId, target);
  }
  return byId;
}

// UX-EXPO-004. The closed action catalog.
export function assertActionCatalog(
  actions: readonly ExpoActionDefinition[],
  targets: ReadonlyMap<string, ScreenTarget>,
): ReadonlyMap<string, ExpoActionDefinition> {
  const byKey = new Map<string, ExpoActionDefinition>();
  for (const action of actions) {
    if (!ACTION_ID.test(action.id)) fail(`action identifier ${action.id} is invalid`);
    if (!SEMVER.test(action.version)) fail(`action ${action.id} has no exact version`);
    const key = `${action.id}@${action.version}`;
    if (byKey.has(key)) fail(`action ${key} is declared twice`);
    // An action pointing at a target that is not in the catalog is an action no adapter can
    // perform and no screen reader can announce.
    const target = targets.get(action.targetId);
    if (target === undefined) fail(`action ${key} names target ${action.targetId}, which is not in the screen catalog`);
    // A write or privileged action is one an automated run will assert against, so its target
    // has to carry the stricter labelling rule rather than merely exist.
    if (action.riskClass !== "read" && !target.critical) fail(`action ${key} changes state through a non-critical target`);
    for (const argumentKey of action.allowedArgumentKeys) {
      if (!ARGUMENT_KEY.test(argumentKey)) fail(`action ${key} admits an invalid argument key ${argumentKey}`);
    }
    if (new Set(action.allowedArgumentKeys).size !== action.allowedArgumentKeys.length) {
      fail(`action ${key} admits a duplicate argument key`);
    }
    byKey.set(key, action);
  }
  return byKey;
}

// UX-EXPO-004. The runtime half: what a caller is allowed to ask for.
//
// The control the issue names is a dynamic executable action, and there are three shapes it
// arrives in -- an action the catalog does not contain, an argument key the action does not
// admit, and a nested argument value. The third is the one that looks harmless: a scalar
// cannot carry a payload, and an object or array can.
export function actionRefusal(
  request: ExpoActionRequest,
  catalog: ReadonlyMap<string, ExpoActionDefinition>,
): string | null {
  const definition = catalog.get(`${request.actionId}@${request.actionVersion}`);
  if (definition === undefined) return "the request names an action that is not in the catalog";

  const argumentValue: unknown = request.arguments;
  if (argumentValue === null || typeof argumentValue !== "object" || Array.isArray(argumentValue)) {
    return "the request arguments are not a plain object";
  }
  const prototype = Object.getPrototypeOf(argumentValue);
  if (prototype !== Object.prototype && prototype !== null) return "the request arguments are not a plain own-key object";

  for (const [key, value] of Object.entries(request.arguments)) {
    if (!definition.allowedArgumentKeys.includes(key)) return `the request supplies argument ${key}, which this action does not admit`;
    if (typeof value === "object") return `argument ${key} is a nested structure rather than a scalar`;
    if (typeof value === "string" && value.length > MAX_ARGUMENT_LENGTH) return `argument ${key} exceeds the admitted length`;
    if (typeof value === "number" && !Number.isFinite(value)) return `argument ${key} is not a finite number`;
  }
  return null;
}

// UX-EXPO-005. Outcome to tone.
//
// The map has to be injective or two different situations render identically -- which is the
// exact failure "waiting for a human" and "denied" showing the same amber banner produces. The
// injectivity is asserted at module load rather than reviewed.
const TONES: Readonly<Record<ProductOutcome, ViewTone>> = {
  COMPLETED: "success",
  WAITING_FOR_HUMAN: "waiting-human",
  WAITING_FOR_HARDWARE: "waiting-hardware",
  DENIED: "denied",
  ABSENT_ADAPTER: "absent",
  NOT_IMPLEMENTED: "unimplemented",
  NOT_EXERCISED: "unexercised",
  FAILED_ACTION: "failed-action",
  FAILED_PROVIDER: "failed-provider",
  FAILED_OBSERVATION: "failed-observation",
  FAILED_CLEANUP: "failed-cleanup",
};

{
  const tones = Object.values(TONES);
  if (new Set(tones).size !== tones.length) {
    throw new Error("invalid expo contract: two product outcomes render as the same tone");
  }
}

export function projectViewState(
  outcome: ProductOutcome,
  target: ScreenTarget,
  receiptDigest: string | null,
): ViewState {
  // The one rule that cannot be relaxed: success is a claim about a receipt, so a surface with
  // no receipt cannot make it. Every other tone is a report about the absence of one.
  if (outcome === "COMPLETED" && receiptDigest === null) fail("a completed state was rendered without a receipt");
  if (receiptDigest !== null && !SHA_256.test(receiptDigest)) fail("the receipt digest is not content-addressed");
  return {
    tone: TONES[outcome],
    targetId: target.targetId,
    role: target.role,
    label: target.label,
    receiptDigest,
  };
}

export function viewToneFor(outcome: ProductOutcome): ViewTone {
  return TONES[outcome];
}
