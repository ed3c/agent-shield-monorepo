import { createHash } from "node:crypto";
import { evaluatePolicy, POLICY_RULES, type PolicyRule } from "./policy.ts";
import type {
  OpaBundleSubject,
  OpaDecisionState,
  OpaEngineTransport,
  OpaEvaluationInput,
  OpaLimits,
  OpaProbeResult,
  OpaProbeState,
} from "./types.ts";

// A deterministic in-memory stand-in for the engine. It never becomes live evidence: the
// provider's liveEvidence stays NOT_EXERCISED because this transport is a fixture, and the
// selftest asserts that no OPA binary, network call or clock is involved.
export class FakeOpaEngine implements OpaEngineTransport {
  probeState: OpaProbeState = "AVAILABLE";
  version: string | null = "0.68.0";
  bundles = new Map<string, OpaBundleSubject>();
  evaluationFails = false;
  disagreeWith: OpaDecisionState | null = null;
  cleanupSucceeds = true;
  readonly calls = { probe: 0, resolve: 0, digest: 0, evaluate: 0, cleanup: 0 };
  readonly #rules: readonly PolicyRule[];

  constructor(rules: readonly PolicyRule[] = POLICY_RULES) {
    this.#rules = rules;
  }

  probe(): OpaProbeResult {
    this.calls.probe += 1;
    return { state: this.probeState, version: this.probeState === "ABSENT" ? null : this.version, detail: `fake OPA probe ${this.probeState}` };
  }

  resolveBundle(bundleId: string): OpaBundleSubject | null {
    this.calls.resolve += 1;
    return this.bundles.get(bundleId) ?? null;
  }

  // The digest is derived from the bundle's own declared content, so a tampered field produces
  // a different digest and the provider rejects the bundle.
  bundleDigest(bundle: OpaBundleSubject): string {
    this.calls.digest += 1;
    return createHash("sha256")
      .update(JSON.stringify({
        bundleId: bundle.bundleId,
        bundleVersion: bundle.bundleVersion,
        policyEpoch: bundle.policyEpoch,
        ruleIds: [...bundle.ruleIds].sort(),
      }))
      .digest("hex");
  }

  evaluate(_bundle: OpaBundleSubject, input: OpaEvaluationInput, limits: OpaLimits): OpaDecisionState | null {
    this.calls.evaluate += 1;
    if (this.evaluationFails) return null;
    if (this.disagreeWith !== null) return this.disagreeWith;
    return evaluatePolicy(input, limits, this.#rules).state;
  }

  cleanup(): boolean {
    this.calls.cleanup += 1;
    return this.cleanupSucceeds;
  }

  register(bundle: Omit<OpaBundleSubject, "bundleSha256">): OpaBundleSubject {
    const complete: OpaBundleSubject = { ...bundle, bundleSha256: "0".repeat(64) };
    const registered: OpaBundleSubject = { ...complete, bundleSha256: this.bundleDigest(complete) };
    this.bundles.set(registered.bundleId, registered);
    return registered;
  }
}
