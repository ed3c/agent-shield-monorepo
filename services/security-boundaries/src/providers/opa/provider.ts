import { createHash } from "node:crypto";
import {
  settlementIntentDigest,
  type SettlementIntent,
} from "../../../../../packages/contracts/src/security/index.ts";
import { evaluatePolicy, POLICY_RULES, type PolicyRule } from "./policy.ts";
import {
  OPA_DECISION_SCHEMA,
  type OpaBundleSubject,
  type OpaDecision,
  type OpaEngineSubject,
  type OpaEngineTransport,
  type OpaEvaluationInput,
  type OpaEvaluationResult,
  type OpaLimits,
  type OpaProviderConfig,
  type OpaState,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const AMOUNT_MINOR = /^(?:0|[1-9][0-9]{0,29})$/;

export function fail(message: string): never {
  throw new Error(`invalid OPA policy contract: ${message}`);
}

// SEC-OPA-001. Every digest of the admitted engine, plus a licence state that must be the
// exact known-permissive one. An unknown or absent licence digest is inadmissible.
export function assertEngineSubject(engine: OpaEngineSubject): OpaEngineSubject {
  if (!SAFE_ID.test(engine.id)) fail("engine.id is invalid");
  if (!SAFE_VERSION.test(engine.version)) fail("engine.version is invalid");
  if (!SHA_256.test(engine.artifactSha256)) fail("engine.artifactSha256 is invalid");
  if (!GIT_OID.test(engine.sourceCommit)) fail("engine.sourceCommit must be a full 40-hex object ID");
  if (engine.license !== "Apache-2.0") fail("engine.license is not the admitted licence");
  for (const [name, digest] of [["licenseSha256", engine.licenseSha256], ["sbomSha256", engine.sbomSha256], ["noticesSha256", engine.noticesSha256]] as const) {
    if (!SHA_256.test(digest)) fail(`engine.${name} is invalid`);
  }
  return engine;
}

export function assertLimits(limits: OpaLimits): OpaLimits {
  if (!AMOUNT_MINOR.test(limits.maxAmountMinor)) fail("limits.maxAmountMinor must be a decimal minor-unit string");
  for (const [name, values] of [
    ["deniedTargets", limits.deniedTargets],
    ["requiredEvidenceRefs", limits.requiredEvidenceRefs],
    ["hardwareDataClasses", limits.hardwareDataClasses],
  ] as const) {
    if (!Array.isArray(values) || values.length > 64) fail(`limits.${name} must be a bounded array`);
    for (const [index, value] of values.entries()) if (!SAFE_ID.test(value)) fail(`limits.${name}[${index}] is invalid`);
    if (new Set(values).size !== values.length) fail(`limits.${name} contains duplicates`);
  }
  return limits;
}

// SEC-OPA-004. The evaluation input is built here, and `purpose` is not carried across. The
// only free text on a settlement intent therefore cannot reach the policy engine at all, so an
// injected override string is data that was never read rather than instruction that was
// filtered.
export function buildEvaluationInput(intent: SettlementIntent, dataClass: string): OpaEvaluationInput {
  if (!SAFE_ID.test(dataClass)) fail("dataClass is invalid");
  return {
    intentId: intent.intentId,
    intentDigest: settlementIntentDigest(intent),
    policyEpoch: intent.policyEpoch,
    target: intent.target,
    amountMinor: intent.amountMinor,
    currency: intent.currency,
    actorKind: intent.actorKind,
    actorId: intent.actorId,
    evidenceRefs: [...intent.evidenceRefs].sort(),
    dataClass,
  };
}

function decision(
  input: OpaEvaluationInput,
  bundle: OpaBundleSubject,
  outcome: ReturnType<typeof evaluatePolicy>,
): OpaDecision {
  return {
    schema: OPA_DECISION_SCHEMA,
    state: outcome.state,
    intentDigest: input.intentDigest,
    policyEpoch: bundle.policyEpoch,
    bundleSha256: bundle.bundleSha256,
    reasonCodes: outcome.reasonCodes,
    requiredEvidence: outcome.requiredEvidence,
    // SEC-OPA-008. The detail carries codes and digests only: no target, amount, actor or any
    // other input value that a portable receipt would then be carrying.
    detail: `decision ${outcome.state} under bundle ${bundle.bundleSha256.slice(0, 12)} epoch ${bundle.policyEpoch}`,
  };
}

export class OpaPolicyProvider {
  readonly #engine: OpaEngineSubject;
  readonly #transport: OpaEngineTransport;
  readonly #config: OpaProviderConfig;
  readonly #rules: readonly PolicyRule[];

  constructor(config: OpaProviderConfig, transport: OpaEngineTransport, rules: readonly PolicyRule[] = POLICY_RULES) {
    this.#engine = assertEngineSubject(config.engine);
    assertLimits(config.limits);
    if (!SAFE_ID.test(config.bundleId)) fail("config.bundleId is invalid");
    // SEC-OPA-007. A bundle with no rules cannot decide anything, so an empty rule set is
    // refused at construction rather than silently allowing everything at evaluation time.
    if (rules.length === 0) fail("a policy bundle with no rules cannot authorize anything");
    this.#transport = transport;
    this.#config = config;
    this.#rules = rules;
  }

  get engineSubject(): OpaEngineSubject {
    return { ...this.#engine };
  }

  // SEC-OPA-005 and SEC-OPA-006. Each failure gets its own outcome, and no failure path can
  // reach a decision object: `decision` stays null unless DECISION_EMITTED.
  evaluate(intent: SettlementIntent, dataClass: string): OpaEvaluationResult {
    const lifecycle: OpaState[] = ["UNRESOLVED"];

    const probe = this.#transport.probe();
    if (probe.state !== "AVAILABLE" || probe.version !== this.#engine.version) {
      lifecycle.push("ABSENT_ENGINE");
      return { lifecycle, outcome: "ABSENT_ENGINE", decision: null };
    }
    lifecycle.push("ENGINE_ADMITTED");

    const bundle = this.#transport.resolveBundle(this.#config.bundleId);
    if (bundle === null) {
      lifecycle.push("ABSENT_BUNDLE");
      return { lifecycle, outcome: "ABSENT_BUNDLE", decision: null };
    }
    lifecycle.push("BUNDLE_RESOLVED");

    if (!SHA_256.test(bundle.bundleSha256) || this.#transport.bundleDigest(bundle) !== bundle.bundleSha256) {
      lifecycle.push("INVALID_POLICY");
      return { lifecycle, outcome: "INVALID_POLICY", decision: null };
    }
    const declared = [...bundle.ruleIds].sort().join(",");
    const present = this.#rules.map((rule) => rule.id).sort().join(",");
    if (declared !== present) {
      // The bundle names the rules it contains. A bundle that no longer matches the compiled
      // rule set is an invalid policy, not a policy that quietly lost a rule.
      lifecycle.push("INVALID_POLICY");
      return { lifecycle, outcome: "INVALID_POLICY", decision: null };
    }
    lifecycle.push("BUNDLE_VERIFIED");

    let input: OpaEvaluationInput;
    try {
      input = buildEvaluationInput(intent, dataClass);
    } catch {
      lifecycle.push("INVALID_INPUT");
      return { lifecycle, outcome: "INVALID_INPUT", decision: null };
    }
    if (input.policyEpoch < bundle.policyEpoch) {
      lifecycle.push("POLICY_EPOCH_STALE");
      return { lifecycle, outcome: "POLICY_EPOCH_STALE", decision: null };
    }
    if (input.policyEpoch > bundle.policyEpoch) {
      // An intent from a future epoch cannot be judged by this bundle either.
      lifecycle.push("POLICY_EPOCH_STALE");
      return { lifecycle, outcome: "POLICY_EPOCH_STALE", decision: null };
    }
    lifecycle.push("INPUT_VALIDATED", "EVALUATING");

    const engineState = this.#transport.evaluate(bundle, input, this.#config.limits);
    if (engineState === null) {
      lifecycle.push("EVALUATION_FAILED");
      return { lifecycle, outcome: "EVALUATION_FAILED", decision: null };
    }
    const outcome = evaluatePolicy(input, this.#config.limits, this.#rules);
    if (engineState !== outcome.state) {
      // The adapter re-derives the decision and refuses to forward one it cannot reproduce.
      lifecycle.push("EVALUATION_FAILED");
      return { lifecycle, outcome: "EVALUATION_FAILED", decision: null };
    }
    lifecycle.push("DECISION_EMITTED");
    return { lifecycle, outcome: "DECISION_EMITTED", decision: decision(input, bundle, outcome) };
  }

  // SEC-OPA-008. Cleanup is verified, not assumed: a transport that could not release its
  // temporary engine state produces FAILED_CLEANUP rather than a silent success.
  cleanup(): OpaState {
    return this.#transport.cleanup() ? "DECISION_EMITTED" : "FAILED_CLEANUP";
  }
}

export function policyReceiptDigest(value: OpaDecision): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
