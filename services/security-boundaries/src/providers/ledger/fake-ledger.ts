import { GENESIS_HASH, entriesDigest, entryHash, headHashOf } from "./chain.ts";
import {
  LEDGER_SNAPSHOT_SCHEMA,
  type LedgerEntry,
  type LedgerEvent,
  type LedgerHead,
  type LedgerProbeState,
  type LedgerSnapshot,
  type LedgerTransport,
} from "./types.ts";

const SERVER_IDENTITY = "9".repeat(64);

// Deterministic in-memory append-only store. Every knob a control needs is exposed, including
// the ones that produce a snapshot whose metadata agrees while its entries do not.
export class FakeLedger implements LedgerTransport {
  probeState: LedgerProbeState = "AVAILABLE";
  version: string | null = "1.9.0";
  serverIdentity: string | null = SERVER_IDENTITY;
  authenticates = true;
  appends = true;
  proofs = true;
  snapshots = true;
  restores = true;
  residual = 0;
  // Drop this many entries from the restored set while leaving the snapshot metadata intact.
  dropOnRestore = 0;
  // Rewrite one restored entry's amount without recomputing its hash.
  tamperIndex: number | null = null;
  readonly entries: LedgerEntry[] = [];

  probe(): { state: LedgerProbeState; version: string | null; serverIdentity: string | null } {
    return {
      state: this.probeState,
      version: this.probeState === "ABSENT" ? null : this.version,
      serverIdentity: this.probeState === "ABSENT" ? null : this.serverIdentity,
    };
  }

  authenticate(): boolean {
    return this.authenticates;
  }

  append(event: LedgerEvent): LedgerEntry | null {
    if (!this.appends) return null;
    const previousHash = headHashOf(this.entries);
    const sequenced: LedgerEvent = { ...event, sequence: this.entries.length };
    const entry: LedgerEntry = { event: sequenced, previousHash, entryHash: entryHash(previousHash, sequenced) };
    this.entries.push(entry);
    return entry;
  }

  head(): LedgerHead {
    return { count: this.entries.length, headHash: headHashOf(this.entries), serverIdentity: this.serverIdentity ?? GENESIS_HASH };
  }

  entryFor(eventId: string): LedgerEntry | null {
    return this.entries.find((entry) => entry.event.eventId === eventId) ?? null;
  }

  // A server that returns a proof it cannot back up. The head it reports still agrees, so only
  // recomputing the chain catches this -- which is the hollow proof-only success the eval names.
  tamperProof = false;

  proof(eventId: string): LedgerEntry[] | null {
    if (!this.proofs) return null;
    if (this.entryFor(eventId) === null) return null;
    const copy = this.entries.map((entry) => ({ ...entry, event: { ...entry.event } }));
    if (this.tamperProof && copy.length > 1) copy[0].event.amountMinor = "424242";
    return copy;
  }

  snapshot(): LedgerSnapshot | null {
    if (!this.snapshots) return null;
    return {
      schema: LEDGER_SNAPSHOT_SCHEMA,
      head: this.head(),
      schemaVersion: "1.0.0",
      encryptionRef: { kind: "key", id: "ledger-backup-key", sha256: "a".repeat(64) },
      brokerRef: { kind: "broker-secret", id: "ledger-broker", sha256: "b".repeat(64) },
      entriesDigest: entriesDigest(this.entries),
    };
  }

  restoreEntries(_snapshot: LedgerSnapshot): LedgerEntry[] | null {
    if (!this.restores) return null;
    const restored = this.entries.slice(0, this.entries.length - this.dropOnRestore).map((entry) => ({ ...entry, event: { ...entry.event } }));
    if (this.tamperIndex !== null && restored[this.tamperIndex] !== undefined) {
      restored[this.tamperIndex].event.amountMinor = "999999";
    }
    return restored;
  }

  residualHandles(): number {
    return this.residual;
  }

  // Produce a snapshot whose head, count and entries digest all agree with a set of entries
  // that the restore path will not actually return in full. SEC-LEDGER-006's control.
  hollowSnapshot(): LedgerSnapshot | null {
    const full = this.snapshot();
    this.dropOnRestore = 1;
    return full;
  }
}
