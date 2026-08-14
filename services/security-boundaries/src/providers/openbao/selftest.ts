import {
  FakeBroker,
  OpenBaoBrokerProvider,
  REDACTED,
  SealedSecret,
  brokerRef,
  openBaoProviderState,
  verifyAudit,
  type BrokerPolicy,
  type BrokerRequest,
  type OpenBaoProviderConfig,
  type OpenBaoServerSubject,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SEC-BAO ${message}`);
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
  ok(text.startsWith("invalid broker contract: "), `${message} threw "${text}" rather than a broker contract error`);
}

const NOW = 1_700_000_000_000;

const SERVER: OpenBaoServerSubject = {
  id: "openbao",
  version: "2.2.0",
  artifactSha256: "a".repeat(64),
  sourceCommit: "1".repeat(40),
  license: "MPL-2.0",
  licenseSha256: "b".repeat(64),
  sbomSha256: "c".repeat(64),
  noticesSha256: "d".repeat(64),
};

const POLICY: BrokerPolicy = {
  path: "agent-shield/settlement/signing-key",
  operation: "unwrap",
  workflowId: "settlement.sign",
  policyEpoch: 4,
};

const REF = brokerRef("broker-secret", "settlement-signing-key", "e".repeat(64));

function config(overrides: Partial<OpenBaoProviderConfig> = {}): OpenBaoProviderConfig {
  return { server: SERVER, policies: [POLICY], maxLeaseMs: 300_000, ...overrides };
}

function request(overrides: Partial<BrokerRequest> = {}): BrokerRequest {
  return {
    ref: REF,
    path: POLICY.path,
    operation: "unwrap",
    workflowId: "settlement.sign",
    actorId: "owner",
    policyEpoch: 4,
    ...overrides,
  };
}

function provider(broker: FakeBroker, overrides: Partial<OpenBaoProviderConfig> = {}): OpenBaoBrokerProvider {
  return new OpenBaoBrokerProvider(config(overrides), broker);
}

// SEC-BAO-001 exact admission
function exactAdmission(): void {
  const broker = new FakeBroker();
  ok(provider(broker).serverSubject.version === "2.2.0", "an admitted server was refused");

  for (const [label, patch] of [
    ["mutable source ref", { sourceCommit: "main" }],
    ["short source ref", { sourceCommit: "1".repeat(7) }],
    ["unknown licence", { license: "Unknown" as never }],
    ["wrong artifact checksum", { artifactSha256: "nope" }],
    ["absent SBOM", { sbomSha256: "" }],
    ["absent notices", { noticesSha256: "nope" }],
  ] as const) {
    red(() => provider(broker, { server: { ...SERVER, ...patch } }), `a server with a ${label}`);
  }

  const absent = new FakeBroker();
  absent.probeState = "ABSENT";
  ok(provider(absent).request(request(), NOW).outcome === "ABSENT_SERVER", "an absent server was not reported");

  const drifted = new FakeBroker();
  drifted.version = "2.0.0";
  ok(provider(drifted).request(request(), NOW).outcome === "ABSENT_SERVER", "a version-drifted server was admitted");
}

// SEC-BAO-002 no-value exposure
//
// The canary is planted in the broker and the value really does reach the caller, so this is
// not a test of an empty pipe. Every surface a value could escape through is then scanned.
function noValueExposure(): void {
  const broker = new FakeBroker();
  const result = provider(broker).request(request(), NOW);
  ok(result.outcome === "LEASE_REVOKED" && result.sealed !== null, "the happy path produced no sealed value");

  let observed = "";
  result.sealed.use((value) => { observed = value; });
  ok(observed === broker.canary, "the sealed value did not reach its in-process consumer");

  const surfaces: Array<[string, string]> = [
    ["JSON.stringify(result)", JSON.stringify(result)],
    ["JSON.stringify(sealed)", JSON.stringify(result.sealed)],
    ["String(sealed)", String(result.sealed)],
    ["template interpolation", `${result.sealed}`],
    ["concatenation", "" + String(result.sealed)],
    // Every implicit coercion above resolves through Symbol.toPrimitive, so toString is only
    // reached when a call site writes it out -- which is exactly what a logging line does.
    ["explicit toString()", result.sealed.toString()],
    ["array join", [result.sealed].join(",")],
    // The hook a runtime inspector consults before printing an object. Called directly so this
    // file needs no node:util import, which this repository has no type shim for.
    ["inspect hook", String((result.sealed as unknown as Record<symbol, () => unknown>)[Symbol.for("nodejs.util.inspect.custom")].call(result.sealed))],
    ["Object.entries", JSON.stringify(Object.entries(result.sealed))],
    ["Object.values", JSON.stringify(Object.values(result.sealed))],
    ["Object.getOwnPropertyNames", JSON.stringify(Object.getOwnPropertyNames(result.sealed).map((key) => (result.sealed as unknown as Record<string, unknown>)[key]))],
    ["spread", JSON.stringify({ ...result.sealed })],
    ["audit receipt", JSON.stringify(result.audit)],
    ["audit log", JSON.stringify(broker.audits)],
    ["error message", (() => { try { throw new Error(`op failed for ${String(result.sealed)}`); } catch (error) { return (error as Error).message; } })()],
  ];
  for (const [label, surface] of surfaces) {
    ok(!surface.includes(broker.canary), `the canary escaped through ${label}`);
  }
  ok(String(result.sealed) === REDACTED, "the sealed value did not redact when printed");
  ok(JSON.parse(JSON.stringify(result.sealed)) === REDACTED, "the sealed value did not redact when serialized");

  // The receipt records how many bytes were handled, never which bytes.
  ok(result.audit?.valueByteLength === broker.canary.length, "the audit lost the byte count");

  // The control the eval names: if the value were carried in a plain field, the same scan
  // would find it. Proving the scan can fail is what makes the passes meaningful.
  const leaky = { ...result, leaked: broker.canary };
  ok(JSON.stringify(leaky).includes(broker.canary), "the canary scan cannot detect a leak and proves nothing");
}

// SEC-BAO-003 least privilege
function leastPrivilege(): void {
  const broker = new FakeBroker();
  for (const [label, path] of [
    ["a root wildcard", "*"],
    ["a prefix wildcard", "agent-shield/*"],
    ["a deep wildcard", "agent-shield/settlement/**"],
    ["a traversal", "agent-shield/../root/key"],
    ["a single segment", "agent-shield"],
    ["a glob class", "agent-shield/settlement/[a-z]"],
  ] as const) {
    red(() => provider(broker, { policies: [{ ...POLICY, path }] }), `a policy with ${label}`);
  }
  red(() => provider(broker, { policies: [] }), "a broker with no policy at all");
  red(() => provider(broker).request(request({ path: "agent-shield/settlement/*" }), NOW), "a request with a wildcard path");
  red(() => provider(broker, { maxLeaseMs: 7_200_000 }), "an unbounded maximum lease");

  // A grant is exact in all four dimensions.
  for (const [label, overrides] of [
    ["another path", { path: "agent-shield/settlement/other-key" }],
    ["another operation", { operation: "read" as const }],
    ["another workflow", { workflowId: "settlement.other" }],
    ["another epoch", { policyEpoch: 5 }],
  ] as const) {
    ok(
      provider(broker).request(request(overrides), NOW).outcome === "POLICY_REFUSED",
      `a request for ${label} was not refused`,
    );
  }
}

// SEC-BAO-004 lease lifecycle
function leaseLifecycle(): void {
  const broker = new FakeBroker();
  ok(provider(broker).request(request(), NOW).outcome === "LEASE_REVOKED", "a valid lease did not complete and revoke");

  const expired = new FakeBroker();
  expired.leaseOverride = { expiresAtEpochMs: NOW - 1 };
  ok(provider(expired).request(request(), NOW).outcome === "LEASE_EXPIRED", "an expired lease was spent");

  const revoked = new FakeBroker();
  revoked.leaseOverride = { revoked: true };
  ok(provider(revoked).request(request(), NOW).outcome === "LEASE_EXPIRED", "a revoked lease was spent");

  const overlong = new FakeBroker();
  overlong.leaseMs = 600_000;
  ok(provider(overlong).request(request(), NOW).outcome === "POLICY_REFUSED", "a lease beyond the maximum duration was accepted");

  const unrevocable = new FakeBroker();
  unrevocable.revokes = false;
  ok(provider(unrevocable).request(request(), NOW).outcome === "REVOCATION_FAILED", "a lease that could not be revoked reported success");
}

// SEC-BAO-005 confused deputy
function confusedDeputy(): void {
  const broker = new FakeBroker();
  // A lease minted for another workflow, actor or path cannot be spent here even when the
  // transport hands one back.
  for (const [label, override] of [
    ["another workflow", { workflowId: "settlement.other" }],
    ["another actor", { actorId: "someone-else" }],
    ["another path", { path: "agent-shield/settlement/other-key" }],
  ] as const) {
    const swapped = new FakeBroker();
    swapped.leaseOverride = override;
    ok(
      provider(swapped).request(request(), NOW).outcome === "POLICY_REFUSED",
      `a lease issued for ${label} was spent on this request`,
    );
  }

  // Swapping the secret reference alone does not widen anything: the audit records the exact
  // ref that was used, so a substitution is visible rather than anonymous.
  const other = brokerRef("broker-secret", "other-key", "f".repeat(64));
  const result = provider(broker).request(request({ ref: other }), NOW);
  ok(result.audit?.refId === "other-key", "the audit did not record the exact reference that was used");
}

// SEC-BAO-006 failure separation
function failureSeparation(): void {
  const cases = [
    { label: "absent server", broker: (() => { const b = new FakeBroker(); b.probeState = "ABSENT"; return b; })(), expected: "ABSENT_SERVER" },
    { label: "no authentication", broker: (() => { const b = new FakeBroker(); b.authenticates = false; return b; })(), expected: "ABSENT_AUTH" },
    { label: "no lease issued", broker: (() => { const b = new FakeBroker(); b.issues = false; return b; })(), expected: "AUTH_REFUSED" },
    { label: "expired lease", broker: (() => { const b = new FakeBroker(); b.leaseOverride = { expiresAtEpochMs: NOW - 1 }; return b; })(), expected: "LEASE_EXPIRED" },
    { label: "operation failure", broker: (() => { const b = new FakeBroker(); b.executes = false; return b; })(), expected: "OPERATION_FAILED" },
    { label: "audit failure", broker: (() => { const b = new FakeBroker(); b.auditWrites = false; return b; })(), expected: "AUDIT_FAILED" },
    { label: "revocation failure", broker: (() => { const b = new FakeBroker(); b.revokes = false; return b; })(), expected: "REVOCATION_FAILED" },
  ] as const;

  for (const item of cases) {
    const result = provider(item.broker).request(request(), NOW);
    ok(result.outcome === item.expected, `${item.label} produced ${result.outcome}, expected ${item.expected}`);
    // The control the eval names: no failure may fall back to a value. Every failure returns
    // a null sealed carrier, so there is nothing for a caller to read from a local plaintext
    // or an environment variable instead.
    ok(result.sealed === null, `${item.expected} still returned a value`);
  }
  ok(new Set(cases.map((item) => item.expected)).size === 7, "the failure fixtures stopped covering seven distinct outcomes");

  // An unwritten audit does not become a successful operation.
  const unaudited = new FakeBroker();
  unaudited.auditWrites = false;
  const result = provider(unaudited).request(request(), NOW);
  ok(result.audit === null && result.sealed === null, "an unwritten audit produced a usable result");

  // Nor an unrecorded refusal: a refusal whose audit could not be written is an audit failure,
  // not a quietly-refused request. This is a separate write site from the one above.
  const unauditedRefusal = provider(unaudited).request(request({ workflowId: "settlement.other" }), NOW);
  ok(
    unauditedRefusal.outcome === "AUDIT_FAILED" && unauditedRefusal.audit === null,
    `a refusal with an unwritable audit reported ${unauditedRefusal.outcome}`,
  );
}

// SEC-BAO-007 audit identity
function auditIdentity(): void {
  const broker = new FakeBroker();
  const result = provider(broker).request(request(), NOW);
  const audit = result.audit;
  ok(audit !== null, "a completed operation produced no audit receipt");
  ok(verifyAudit(audit), "a genuine audit receipt failed verification");
  ok(
    audit.path === POLICY.path && audit.operation === "unwrap" && audit.workflowId === "settlement.sign"
    && audit.actorId === "owner" && audit.policyEpoch === 4 && audit.leaseId === "lease-settlement.sign"
    && audit.serverVersion === "2.2.0" && audit.result === "OK",
    "the audit receipt did not bind the full subject",
  );

  for (const [label, forged] of [
    ["a forged result", { ...audit, result: "REFUSED" as const }],
    ["a forged actor", { ...audit, actorId: "someone-else" }],
    ["a forged epoch", { ...audit, policyEpoch: 99 }],
    ["a forged lease", { ...audit, leaseId: "lease-other" }],
    ["a stale server version", { ...audit, serverVersion: "1.0.0" }],
  ] as const) {
    ok(!verifyAudit(forged), `${label} passed audit verification`);
  }

  // A refusal is audited too, so a refused request is not an unrecorded one.
  const refused = provider(broker).request(request({ workflowId: "settlement.other" }), NOW);
  ok(refused.audit !== null && refused.audit.result === "REFUSED" && verifyAudit(refused.audit), "a refusal was not audited");
}

// SEC-BAO-008 cleanup and recovery
function cleanupRecovery(): void {
  const clean = new FakeBroker();
  provider(clean).request(request(), NOW);
  ok(provider(clean).cleanup() === "LEASE_REVOKED", "a clean broker reported residue");

  const leaking = new FakeBroker();
  leaking.residual = 1;
  ok(provider(leaking).cleanup() === "FAILED_CLEANUP", "a retained token was reported as clean");

  ok(openBaoProviderState.unsealCeremony === "NOT_IMPLEMENTED", "an unseal ceremony was claimed");
  ok(openBaoProviderState.recoveryCeremony === "NOT_IMPLEMENTED", "a recovery ceremony was claimed");
  ok(openBaoProviderState.liveLease === "NOT_EXERCISED", "a fixture lease was promoted to live evidence");
}

function sealedCarrier(): void {
  const sealed = new SealedSecret("ref", "value-under-seal");
  ok(sealed.use((value) => value.length) === 16, "the sealed carrier did not expose its value to a consumer");
  ok(Object.isFrozen(sealed), "the sealed carrier is mutable");
  ok(Object.keys(sealed).join(",") === "ref", "the sealed carrier exposed a field other than its reference");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const brokerNeverPasses: NeverPass<typeof openBaoProviderState> = true;
void brokerNeverPasses;

exactAdmission();
noValueExposure();
leastPrivilege();
leaseLifecycle();
confusedDeputy();
failureSeparation();
auditIdentity();
cleanupRecovery();
sealedCarrier();

console.log("SELFTEST GREEN: SEC-BAO exact admission, no-value exposure, least privilege, lease lifecycle, confused deputy, failure separation, audit identity, cleanup");
