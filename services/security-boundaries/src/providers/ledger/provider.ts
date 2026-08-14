import { checkDomainInvariants, entriesDigest, fail, headHashOf, verifyChain } from "./chain.ts";
import {
  LEDGER_ENTRY_SCHEMA,
  LEDGER_RECEIPT_SCHEMA,
  type LedgerAppendResult,
  type LedgerEvent,
  type LedgerProviderConfig,
  type LedgerRestoreResult,
  type LedgerServerSubject,
  type LedgerSnapshot,
  type LedgerState,
  type LedgerTransport,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_OID = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const AMOUNT_MINOR = /^(?:0|[1-9][0-9]{0,29})$/;

export function assertServerSubject(server: LedgerServerSubject): LedgerServerSubject {
  if (!SAFE_ID.test(server.id)) fail("server.id is invalid");
  if (!SAFE_VERSION.test(server.version)) fail("server.version is invalid");
  if (!GIT_OID.test(server.sourceCommit)) fail("server.sourceCommit must be a full 40-hex object ID");
  if (server.license !== "Apache-2.0" && server.license !== "BUSL-1.1") fail("server.license is not an admitted licence");
  for (const [name, digest] of [
    ["artifactSha256", server.artifactSha256],
    ["licenseSha256", server.licenseSha256],
    ["sbomSha256", server.sbomSha256],
    ["noticesSha256", server.noticesSha256],
    ["serverIdentity", server.serverIdentity],
  ] as const) {
    if (!SHA_256.test(digest)) fail(`server.${name} is invalid`);
  }
  return server;
}

export function assertEvent(event: LedgerEvent): LedgerEvent {
  if (event.schema !== LEDGER_ENTRY_SCHEMA) fail("event.schema is unsupported");
  if (!SAFE_ID.test(event.eventId)) fail("event.eventId is invalid");
  if (!SAFE_ID.test(event.intentId)) fail("event.intentId is invalid");
  if (!SAFE_ID.test(event.workflowId)) fail("event.workflowId is invalid");
  if (!SHA_256.test(event.payloadDigest)) fail("event.payloadDigest is invalid");
  if (!AMOUNT_MINOR.test(event.amountMinor)) fail("event.amountMinor must be a decimal minor-unit string");
  if (!Number.isSafeInteger(event.policyEpoch) || event.policyEpoch < 0) fail("event.policyEpoch is invalid");
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) fail("event.sequence is invalid");
  // SEC-LEDGER-007. Nothing beyond the declared fields may ride along into the ledger.
  const allowed = new Set(["schema", "eventId", "kind", "intentId", "workflowId", "policyEpoch", "payloadDigest", "amountMinor", "direction", "sequence"]);
  for (const key of Object.keys(event)) if (!allowed.has(key)) fail(`event.${key} is not allowed`);
  return event;
}

export class VerifiedLedgerProvider {
  readonly #server: LedgerServerSubject;
  readonly #transport: LedgerTransport;
  readonly #config: LedgerProviderConfig;

  constructor(config: LedgerProviderConfig, transport: LedgerTransport) {
    this.#server = assertServerSubject(config.server);
    if (!SAFE_ID.test(config.workflowId)) fail("config.workflowId is invalid");
    if (!SAFE_VERSION.test(config.schemaVersion)) fail("config.schemaVersion is invalid");
    this.#config = config;
    this.#transport = transport;
  }

  get serverSubject(): LedgerServerSubject {
    return { ...this.#server };
  }

  #admit(lifecycle: LedgerState[]): LedgerState | null {
    const probe = this.#transport.probe();
    // SEC-LEDGER-004. The pinned server identity is checked, so a forked or replaced server
    // answering on the same address is refused rather than trusted.
    if (probe.state !== "AVAILABLE" || probe.version !== this.#server.version || probe.serverIdentity !== this.#server.serverIdentity) {
      return "ABSENT_SERVER";
    }
    lifecycle.push("SERVER_ADMITTED");
    if (!this.#transport.authenticate(this.#config.workflowId)) return "AUTH_REFUSED";
    lifecycle.push("AUTHENTICATED");
    return null;
  }

  append(event: LedgerEvent): LedgerAppendResult {
    const lifecycle: LedgerState[] = ["UNRESOLVED"];
    const blocked = this.#admit(lifecycle);
    if (blocked !== null) return { lifecycle: [...lifecycle, blocked], outcome: blocked as LedgerAppendResult["outcome"], receipt: null };

    try {
      assertEvent(event);
    } catch {
      return { lifecycle: [...lifecycle, "INVALID_ENTRY"], outcome: "INVALID_ENTRY", receipt: null };
    }
    lifecycle.push("ENTRY_VALIDATED");

    // SEC-LEDGER-002. Idempotent by event ID. A duplicate delivery returns the original
    // receipt marked duplicate; it does not append a second entry.
    const existing = this.#transport.entryFor(event.eventId);
    if (existing !== null) {
      const head = this.#transport.head();
      return {
        lifecycle: [...lifecycle, "COMMITTED"],
        outcome: "COMMITTED",
        receipt: {
          schema: LEDGER_RECEIPT_SCHEMA,
          eventId: event.eventId,
          sequence: existing.event.sequence,
          entryHash: existing.entryHash,
          head,
          serverVersion: this.#server.version,
          duplicate: true,
        },
      };
    }

    lifecycle.push("APPENDING");
    const appended = this.#transport.append(event);
    if (appended === null) return { lifecycle: [...lifecycle, "APPEND_FAILED"], outcome: "APPEND_FAILED", receipt: null };

    const proof = this.#transport.proof(event.eventId);
    if (proof === null) return { lifecycle: [...lifecycle, "PROOF_FAILED"], outcome: "PROOF_FAILED", receipt: null };
    lifecycle.push("PROOF_FETCHED");

    // SEC-LEDGER-003. The proof is the whole chain, recomputed here. A server that returns a
    // head the client cannot reproduce from the entries fails rather than being believed.
    const chain = verifyChain(proof);
    const head = this.#transport.head();
    if (!chain.ok || headHashOf(proof) !== head.headHash || proof.length !== head.count) {
      return { lifecycle: [...lifecycle, "PROOF_FAILED"], outcome: "PROOF_FAILED", receipt: null };
    }
    if (head.serverIdentity !== this.#server.serverIdentity) {
      return { lifecycle: [...lifecycle, "PROOF_FAILED"], outcome: "PROOF_FAILED", receipt: null };
    }
    lifecycle.push("VERIFIED", "COMMITTED");

    return {
      lifecycle,
      outcome: "COMMITTED",
      receipt: {
        schema: LEDGER_RECEIPT_SCHEMA,
        eventId: event.eventId,
        sequence: appended.event.sequence,
        entryHash: appended.entryHash,
        head,
        serverVersion: this.#server.version,
        duplicate: false,
      },
    };
  }

  // SEC-LEDGER-005 and SEC-LEDGER-006. Recovery is replay, not metadata agreement. A snapshot
  // whose head and digest fields look right but whose entries are missing fails here, which is
  // the whole point of the eval: an append-only claim is not recoverability.
  restore(): LedgerRestoreResult {
    const lifecycle: LedgerState[] = ["UNRESOLVED"];
    const blocked = this.#admit(lifecycle);
    if (blocked !== null) return { lifecycle: [...lifecycle, blocked], outcome: blocked as LedgerRestoreResult["outcome"], report: null };

    const snapshot = this.#transport.snapshot();
    if (snapshot === null) return { lifecycle: [...lifecycle, "BACKUP_ABSENT"], outcome: "BACKUP_ABSENT", report: null };
    lifecycle.push("BACKUP_RESOLVED");

    if (
      snapshot.schemaVersion !== this.#config.schemaVersion
      || snapshot.head.serverIdentity !== this.#server.serverIdentity
      || !SHA_256.test(snapshot.entriesDigest)
      || !SHA_256.test(snapshot.encryptionRef.sha256)
      || !SHA_256.test(snapshot.brokerRef.sha256)
    ) {
      return { lifecycle: [...lifecycle, "SNAPSHOT_MISMATCH"], outcome: "SNAPSHOT_MISMATCH", report: null };
    }
    lifecycle.push("SNAPSHOT_VERIFIED", "RESTORING");

    const entries = this.#transport.restoreEntries(snapshot);
    if (entries === null) return { lifecycle: [...lifecycle, "RESTORE_FAILED"], outcome: "RESTORE_FAILED", report: null };

    // The count and the digest are checked against the entries actually restored, so metadata
    // that agrees with a smaller set of events is caught here.
    if (entries.length !== snapshot.head.count || entriesDigest(entries) !== snapshot.entriesDigest) {
      return { lifecycle: [...lifecycle, "RESTORE_FAILED"], outcome: "RESTORE_FAILED", report: null };
    }
    lifecycle.push("REPLAYING");

    const chain = verifyChain(entries);
    if (!chain.ok || headHashOf(entries) !== snapshot.head.headHash) {
      return { lifecycle: [...lifecycle, "REPLAY_FAILED"], outcome: "REPLAY_FAILED", report: null };
    }

    const report = checkDomainInvariants(entries);
    if (!report.holds) {
      return { lifecycle: [...lifecycle, "INVARIANT_FAILED"], outcome: "INVARIANT_FAILED", report };
    }
    lifecycle.push("DOMAIN_INVARIANTS_CHECKED", "RECOVERED");
    return { lifecycle, outcome: "RECOVERED", report };
  }

  cleanup(): LedgerState {
    return this.#transport.residualHandles() === 0 ? "RECOVERED" : "FAILED_CLEANUP";
  }
}
