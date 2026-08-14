import type { SecurityOpaqueRef } from "../../../../../packages/contracts/src/security/index.ts";

export const LEDGER_ENTRY_SCHEMA = "agent-shield/ledger-entry/v1" as const;
export const LEDGER_RECEIPT_SCHEMA = "agent-shield/ledger-receipt/v1" as const;
export const LEDGER_SNAPSHOT_SCHEMA = "agent-shield/ledger-snapshot/v1" as const;

export type LedgerState =
  | "UNRESOLVED"
  | "SERVER_ADMITTED"
  | "AUTHENTICATED"
  | "ENTRY_VALIDATED"
  | "APPENDING"
  | "PROOF_FETCHED"
  | "VERIFIED"
  | "COMMITTED"
  | "BACKUP_RESOLVED"
  | "SNAPSHOT_VERIFIED"
  | "RESTORING"
  | "REPLAYING"
  | "DOMAIN_INVARIANTS_CHECKED"
  | "RECOVERED"
  | "ABSENT_SERVER"
  | "AUTH_REFUSED"
  | "INVALID_ENTRY"
  | "APPEND_FAILED"
  | "PROOF_FAILED"
  | "BACKUP_ABSENT"
  | "SNAPSHOT_MISMATCH"
  | "RESTORE_FAILED"
  | "REPLAY_FAILED"
  | "INVARIANT_FAILED"
  | "FAILED_CLEANUP";

export type LedgerOutcome = Extract<LedgerState,
  | "COMMITTED"
  | "RECOVERED"
  | "ABSENT_SERVER"
  | "AUTH_REFUSED"
  | "INVALID_ENTRY"
  | "APPEND_FAILED"
  | "PROOF_FAILED"
  | "BACKUP_ABSENT"
  | "SNAPSHOT_MISMATCH"
  | "RESTORE_FAILED"
  | "REPLAY_FAILED"
  | "INVARIANT_FAILED"
  | "FAILED_CLEANUP">;

export interface LedgerServerSubject {
  id: string;
  version: string;
  artifactSha256: string;
  sourceCommit: string;
  license: "Apache-2.0" | "BUSL-1.1";
  licenseSha256: string;
  sbomSha256: string;
  noticesSha256: string;
  // SEC-LEDGER-004. A forked or replaced server has a different identity, and the client
  // pins it rather than trusting whatever answered.
  serverIdentity: string;
}

export type LedgerEventKind = "intent-declared" | "operation-authorized" | "operation-settled" | "operation-reversed";

// SEC-LEDGER-007. An entry carries digests and references, never payloads. There is no field
// here that could hold a secret, a key or a personal record.
export interface LedgerEvent {
  schema: typeof LEDGER_ENTRY_SCHEMA;
  eventId: string;
  kind: LedgerEventKind;
  intentId: string;
  workflowId: string;
  policyEpoch: number;
  payloadDigest: string;
  amountMinor: string;
  direction: "debit" | "credit";
  sequence: number;
}

export interface LedgerEntry {
  event: LedgerEvent;
  previousHash: string;
  entryHash: string;
}

export interface LedgerHead {
  count: number;
  headHash: string;
  serverIdentity: string;
}

export interface LedgerReceipt {
  schema: typeof LEDGER_RECEIPT_SCHEMA;
  eventId: string;
  sequence: number;
  entryHash: string;
  head: LedgerHead;
  serverVersion: string;
  duplicate: boolean;
}

// SEC-LEDGER-005. A snapshot binds the head, the schema, the encryption and broker references
// and a digest over the entries it claims to contain -- so a snapshot whose metadata matches
// but whose entry data does not cannot pass as the same snapshot.
export interface LedgerSnapshot {
  schema: typeof LEDGER_SNAPSHOT_SCHEMA;
  head: LedgerHead;
  schemaVersion: string;
  encryptionRef: SecurityOpaqueRef;
  brokerRef: SecurityOpaqueRef;
  entriesDigest: string;
}

export interface DomainInvariantReport {
  entries: number;
  netMinorByIntent: Record<string, string>;
  reversedIntents: string[];
  holds: boolean;
  detail: string;
}

export interface LedgerRestoreResult {
  lifecycle: LedgerState[];
  outcome: LedgerOutcome;
  report: DomainInvariantReport | null;
}

export interface LedgerAppendResult {
  lifecycle: LedgerState[];
  outcome: LedgerOutcome;
  receipt: LedgerReceipt | null;
}

export type LedgerProbeState = "AVAILABLE" | "ABSENT";

export interface LedgerTransport {
  probe(): { state: LedgerProbeState; version: string | null; serverIdentity: string | null };
  authenticate(workflowId: string): boolean;
  append(event: LedgerEvent): LedgerEntry | null;
  head(): LedgerHead;
  entryFor(eventId: string): LedgerEntry | null;
  proof(eventId: string): LedgerEntry[] | null;
  snapshot(): LedgerSnapshot | null;
  restoreEntries(snapshot: LedgerSnapshot): LedgerEntry[] | null;
  residualHandles(): number;
}

export interface LedgerProviderConfig {
  server: LedgerServerSubject;
  workflowId: string;
  schemaVersion: string;
}
