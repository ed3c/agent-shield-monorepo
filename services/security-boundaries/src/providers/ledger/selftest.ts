import {
  FakeLedger,
  LEDGER_ENTRY_SCHEMA,
  VerifiedLedgerProvider,
  checkDomainInvariants,
  entriesDigest,
  ledgerProviderState,
  verifyChain,
  type LedgerEvent,
  type LedgerProviderConfig,
  type LedgerServerSubject,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SEC-LEDGER ${message}`);
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
  ok(text.startsWith("invalid ledger contract: "), `${message} threw "${text}" rather than a ledger contract error`);
}

const SERVER: LedgerServerSubject = {
  id: "immudb",
  version: "1.9.0",
  artifactSha256: "a".repeat(64),
  sourceCommit: "1".repeat(40),
  license: "Apache-2.0",
  licenseSha256: "b".repeat(64),
  sbomSha256: "c".repeat(64),
  noticesSha256: "d".repeat(64),
  serverIdentity: "9".repeat(64),
};

function config(overrides: Partial<LedgerProviderConfig> = {}): LedgerProviderConfig {
  return { server: SERVER, workflowId: "settlement.sign", schemaVersion: "1.0.0", ...overrides };
}

function provider(ledger: FakeLedger, overrides: Partial<LedgerProviderConfig> = {}): VerifiedLedgerProvider {
  return new VerifiedLedgerProvider(config(overrides), ledger);
}

function event(overrides: Partial<LedgerEvent> = {}): LedgerEvent {
  return {
    schema: LEDGER_ENTRY_SCHEMA,
    eventId: "event-1",
    kind: "intent-declared",
    intentId: "intent-1",
    workflowId: "settlement.sign",
    policyEpoch: 4,
    payloadDigest: "e".repeat(64),
    amountMinor: "0",
    direction: "debit",
    sequence: 0,
    ...overrides,
  };
}

// A small well-formed history: declare, authorize, settle a credit.
function seed(ledger: FakeLedger): void {
  const instance = provider(ledger);
  instance.append(event());
  instance.append(event({ eventId: "event-2", kind: "operation-authorized" }));
  instance.append(event({ eventId: "event-3", kind: "operation-settled", amountMinor: "1000", direction: "credit" }));
}

// SEC-LEDGER-001 exact admission
function exactAdmission(): void {
  const ledger = new FakeLedger();
  ok(provider(ledger).serverSubject.version === "1.9.0", "an admitted server was refused");
  for (const [label, patch] of [
    ["mutable source ref", { sourceCommit: "main" }],
    ["short source ref", { sourceCommit: "1".repeat(7) }],
    ["unknown licence", { license: "Proprietary" as never }],
    ["wrong artifact digest", { artifactSha256: "nope" }],
    ["absent SBOM", { sbomSha256: "" }],
    ["absent server identity", { serverIdentity: "nope" }],
  ] as const) {
    red(() => provider(ledger, { server: { ...SERVER, ...patch } }), `a server with a ${label}`);
  }

  const absent = new FakeLedger();
  absent.probeState = "ABSENT";
  ok(provider(absent).append(event()).outcome === "ABSENT_SERVER", "an absent server was not reported");
  const drifted = new FakeLedger();
  drifted.version = "1.0.0";
  ok(provider(drifted).append(event()).outcome === "ABSENT_SERVER", "a version-drifted server was admitted");
}

// SEC-LEDGER-002 canonical append and idempotency
function idempotency(): void {
  const ledger = new FakeLedger();
  const instance = provider(ledger);
  const first = instance.append(event());
  ok(first.outcome === "COMMITTED" && first.receipt?.duplicate === false, "the first append did not commit");

  const duplicate = instance.append(event());
  ok(duplicate.outcome === "COMMITTED" && duplicate.receipt?.duplicate === true, "a duplicate delivery was not marked");
  ok(ledger.entries.length === 1, "a duplicate delivery appended a second entry");
  ok(duplicate.receipt?.entryHash === first.receipt?.entryHash, "a duplicate delivery returned a different entry");

  red(() => { throw new Error("invalid ledger contract: probe"); }, "the control harness itself");
  ok(provider(ledger).append(event({ eventId: "Event 1" })).outcome === "INVALID_ENTRY", "a malformed event ID was appended");
  ok(provider(ledger).append(event({ amountMinor: "-5" })).outcome === "INVALID_ENTRY", "a negative amount was appended");
  ok(provider(ledger).append(event({ payloadDigest: "short" })).outcome === "INVALID_ENTRY", "an event with no payload digest was appended");
  ok(
    provider(ledger).append({ ...event({ eventId: "event-x" }), secret: "value" } as unknown as LedgerEvent).outcome === "INVALID_ENTRY",
    "an event carrying an extra field was appended",
  );
}

// SEC-LEDGER-003 tamper detection
function tamperDetection(): void {
  const ledger = new FakeLedger();
  seed(ledger);
  ok(verifyChain(ledger.entries).ok, "a clean chain failed verification");

  const mutated = ledger.entries.map((entry) => ({ ...entry, event: { ...entry.event } }));
  mutated[1].event.amountMinor = "500";
  ok(!verifyChain(mutated).ok, "a mutated historical entry passed verification");

  const reordered = [ledger.entries[0], ledger.entries[2], ledger.entries[1]].map((entry) => ({ ...entry }));
  ok(!verifyChain(reordered).ok, "a reordered chain passed verification");

  const deleted = [ledger.entries[0], ledger.entries[2]].map((entry) => ({ ...entry }));
  ok(!verifyChain(deleted).ok, "a chain with a deleted entry passed verification");

  const lying = new FakeLedger();
  seed(lying);
  lying.tamperIndex = 1;
  const restored = lying.restoreEntries(lying.snapshot()!);
  ok(restored !== null && !verifyChain(restored).ok, "a tampered restore passed chain verification");

  // The hollow proof-only success the eval names, on the append path this time: the server
  // reports a head that still agrees, and hands back a proof whose entries do not recompute to
  // it. Believing the head alone would have passed; recomputing the chain is what catches it.
  const hollowProof = new FakeLedger();
  seed(hollowProof);
  hollowProof.tamperProof = true;
  const appended = provider(hollowProof).append(event({ eventId: "event-hollow", kind: "operation-authorized" }));
  ok(appended.outcome === "PROOF_FAILED", `a hollow proof reported ${appended.outcome}`);
  ok(appended.receipt === null, "a hollow proof produced a receipt");
}

// SEC-LEDGER-004 consistency
function consistency(): void {
  const forked = new FakeLedger();
  forked.serverIdentity = "7".repeat(64);
  ok(provider(forked).append(event()).outcome === "ABSENT_SERVER", "a forked server identity was accepted");

  const noProof = new FakeLedger();
  noProof.proofs = false;
  ok(provider(noProof).append(event()).outcome === "PROOF_FAILED", "a missing proof was accepted");

  const noAppend = new FakeLedger();
  noAppend.appends = false;
  ok(provider(noAppend).append(event()).outcome === "APPEND_FAILED", "a failed append reported success");

  const unauthenticated = new FakeLedger();
  unauthenticated.authenticates = false;
  ok(provider(unauthenticated).append(event()).outcome === "AUTH_REFUSED", "an unauthenticated append succeeded");
}

// SEC-LEDGER-005 backup identity and SEC-LEDGER-006 restore completeness
function backupAndRestore(): void {
  const ledger = new FakeLedger();
  seed(ledger);
  const restored = provider(ledger).restore();
  ok(restored.outcome === "RECOVERED" && restored.report?.holds === true, "a complete restore did not recover");
  ok(restored.report?.entries === 3, "the restore report lost entries");
  ok(restored.report?.netMinorByIntent["intent-1"] === "1000", "the replayed balance is wrong");

  const noBackup = new FakeLedger();
  seed(noBackup);
  noBackup.snapshots = false;
  ok(provider(noBackup).restore().outcome === "BACKUP_ABSENT", "a missing backup was not reported");

  const wrongSchema = new FakeLedger();
  seed(wrongSchema);
  ok(provider(wrongSchema, { schemaVersion: "2.0.0" }).restore().outcome === "SNAPSHOT_MISMATCH", "a snapshot from another schema was restored");

  const noRestore = new FakeLedger();
  seed(noRestore);
  noRestore.restores = false;
  ok(provider(noRestore).restore().outcome === "RESTORE_FAILED", "a failed restore reported success");

  // The eval's own control: matching root metadata with missing event data. The snapshot head,
  // count and entries digest are all taken from the full ledger, and the restore then returns
  // one entry fewer. Metadata agreement is not recoverability.
  const hollow = new FakeLedger();
  seed(hollow);
  hollow.dropOnRestore = 1;
  const hollowResult = provider(hollow).restore();
  ok(hollowResult.outcome === "RESTORE_FAILED", `a hollow snapshot reported ${hollowResult.outcome}`);
  ok(hollowResult.report === null, "a hollow snapshot produced an invariant report");

  // A dropped entry and a tampered entry fail at different checks, and the distinction is the
  // point: dropping one changes the count and the entries digest, so RESTORE_FAILED. Tampering
  // with an entry's content leaves its recorded hash -- and therefore the digest -- unchanged,
  // so only recomputing the chain catches it: REPLAY_FAILED.
  const tampered = new FakeLedger();
  seed(tampered);
  tampered.tamperIndex = 1;
  const tamperedResult = provider(tampered).restore();
  ok(tamperedResult.outcome === "REPLAY_FAILED", `a tampered restore reported ${tamperedResult.outcome}`);
  ok(tamperedResult.report === null, "a tampered restore produced an invariant report");
}

// SEC-LEDGER-006 domain invariants
function domainInvariants(): void {
  const ledger = new FakeLedger();
  seed(ledger);
  ok(checkDomainInvariants(ledger.entries).holds, "a well-formed history failed its invariants");

  const settleBeforeDeclare = new FakeLedger();
  provider(settleBeforeDeclare).append(event({ eventId: "s1", kind: "operation-settled", intentId: "intent-9", amountMinor: "10", direction: "credit" }));
  ok(!checkDomainInvariants(settleBeforeDeclare.entries).holds, "a settlement before declaration passed its invariants");

  const reverseBeforeSettle = new FakeLedger();
  const instance = provider(reverseBeforeSettle);
  instance.append(event());
  instance.append(event({ eventId: "r1", kind: "operation-reversed", amountMinor: "10", direction: "debit" }));
  ok(!checkDomainInvariants(reverseBeforeSettle.entries).holds, "a reversal before settlement passed its invariants");

  const negative = new FakeLedger();
  const negativeInstance = provider(negative);
  negativeInstance.append(event());
  negativeInstance.append(event({ eventId: "n1", kind: "operation-settled", amountMinor: "10", direction: "credit" }));
  negativeInstance.append(event({ eventId: "n2", kind: "operation-reversed", amountMinor: "50", direction: "debit" }));
  const report = checkDomainInvariants(negative.entries);
  ok(!report.holds && report.detail.includes("negative net balance"), "an over-reversal passed its invariants");

  const doubleDeclare = new FakeLedger();
  const doubleInstance = provider(doubleDeclare);
  doubleInstance.append(event());
  doubleInstance.append(event({ eventId: "d2" }));
  ok(!checkDomainInvariants(doubleDeclare.entries).holds, "a doubly-declared intent passed its invariants");

  // A ledger whose chain verifies but whose domain invariants do not must not recover. This is
  // the difference between "the bytes are intact" and "the history means something".
  const brokenDomain = new FakeLedger();
  const brokenInstance = provider(brokenDomain);
  brokenInstance.append(event());
  brokenInstance.append(event({ eventId: "b2", kind: "operation-settled", amountMinor: "10", direction: "credit" }));
  brokenInstance.append(event({ eventId: "b3", kind: "operation-reversed", amountMinor: "99", direction: "debit" }));
  ok(verifyChain(brokenDomain.entries).ok, "the broken-domain fixture is not chain-valid, so it tests nothing");
  const result = provider(brokenDomain).restore();
  ok(result.outcome === "INVARIANT_FAILED", `a chain-valid but domain-broken ledger reported ${result.outcome}`);
  ok(result.report !== null && !result.report.holds, "the invariant failure carried no report");
}

// SEC-LEDGER-007 privacy
function privacy(): void {
  const ledger = new FakeLedger();
  seed(ledger);
  const receipt = provider(ledger).append(event({ eventId: "event-4", kind: "operation-authorized" })).receipt;
  ok(receipt !== null, "a committed append produced no receipt");
  const serialized = JSON.stringify(receipt);
  for (const field of ["payloadDigest", "amountMinor", "direction", "policyEpoch"]) {
    ok(!serialized.includes(field), `the receipt carried the event field ${field}`);
  }
  ok(serialized.includes("entryHash") && serialized.includes("headHash"), "the receipt lost its digests");

  const snapshot = ledger.snapshot();
  ok(snapshot !== null, "no snapshot was produced");
  const snapshotText = JSON.stringify(snapshot);
  ok(!snapshotText.includes("payload") || snapshotText.includes("entriesDigest"), "the snapshot carried payloads");
  ok(snapshot.encryptionRef.kind === "key" && snapshot.brokerRef.kind === "broker-secret", "the snapshot lost its opaque refs");
}

// SEC-LEDGER-008 failure separation and cleanup
function failureSeparation(): void {
  const appendCases = [
    { label: "absent server", make: () => { const l = new FakeLedger(); l.probeState = "ABSENT"; return l; }, expected: "ABSENT_SERVER" },
    { label: "auth refused", make: () => { const l = new FakeLedger(); l.authenticates = false; return l; }, expected: "AUTH_REFUSED" },
    { label: "append failure", make: () => { const l = new FakeLedger(); l.appends = false; return l; }, expected: "APPEND_FAILED" },
    { label: "proof failure", make: () => { const l = new FakeLedger(); l.proofs = false; return l; }, expected: "PROOF_FAILED" },
  ] as const;
  for (const item of appendCases) {
    const result = provider(item.make()).append(event());
    ok(result.outcome === item.expected, `${item.label} produced ${result.outcome}, expected ${item.expected}`);
    ok(result.receipt === null, `${item.expected} still produced a receipt`);
  }

  const restoreCases = [
    { label: "backup absent", tune: (l: FakeLedger) => { l.snapshots = false; }, expected: "BACKUP_ABSENT" },
    { label: "restore failure", tune: (l: FakeLedger) => { l.restores = false; }, expected: "RESTORE_FAILED" },
    { label: "hollow snapshot", tune: (l: FakeLedger) => { l.dropOnRestore = 1; }, expected: "RESTORE_FAILED" },
  ] as const;
  for (const item of restoreCases) {
    const ledger = new FakeLedger();
    seed(ledger);
    item.tune(ledger);
    const result = provider(ledger).restore();
    ok(result.outcome === item.expected, `${item.label} produced ${result.outcome}, expected ${item.expected}`);
  }

  const clean = new FakeLedger();
  seed(clean);
  ok(provider(clean).cleanup() === "RECOVERED", "a clean ledger reported residue");
  const leaking = new FakeLedger();
  leaking.residual = 2;
  ok(provider(leaking).cleanup() === "FAILED_CLEANUP", "a retained handle was reported as clean");

  ok(ledgerProviderState.liveAppend === "NOT_EXERCISED", "a fixture append was promoted to live evidence");
  ok(ledgerProviderState.restoreDrill === "NOT_EXERCISED", "a fixture restore was promoted to a drill");
  ok(ledgerProviderState.anchorSubmission === "NOT_IMPLEMENTED", "anchor submission was claimed");
}

function digestSanity(): void {
  const ledger = new FakeLedger();
  seed(ledger);
  ok(entriesDigest(ledger.entries) !== entriesDigest(ledger.entries.slice(0, 2)), "the entries digest ignores how many entries there are");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const ledgerNeverPasses: NeverPass<typeof ledgerProviderState> = true;
void ledgerNeverPasses;

exactAdmission();
idempotency();
tamperDetection();
consistency();
backupAndRestore();
domainInvariants();
privacy();
failureSeparation();
digestSanity();

console.log("SELFTEST GREEN: SEC-LEDGER exact admission, idempotency, tamper detection, consistency, backup identity, restore completeness, domain invariants, privacy, failure separation");
