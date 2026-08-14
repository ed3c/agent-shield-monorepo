export const CHAIN_SUBMISSION_RECEIPT_SCHEMA = "agent-shield/testnet-submission-receipt/v1" as const;

export type ChainState =
  | "UNRESOLVED"
  | "NETWORK_ADMITTED"
  | "CONTRACTS_RESOLVED"
  | "INPUT_RECEIPTS_VERIFIED"
  | "OPERATION_BUILT"
  | "SIMULATED"
  | "AUTHORIZED"
  | "SUBMITTED"
  | "INCLUDED"
  | "CONFIRMED"
  | "RECORDED"
  | "ABSENT_NETWORK"
  | "ABSENT_BUNDLER"
  | "ABSENT_PAYMASTER"
  | "SUBJECT_MISMATCH"
  | "SIMULATION_REVERTED"
  | "POLICY_REFUSED"
  | "SUBMISSION_FAILED"
  | "REPLACED"
  | "DROPPED"
  | "TIMED_OUT"
  | "REORGED"
  | "CONFIRMATION_FAILED"
  | "LEDGER_FAILED"
  | "FAILED_CLEANUP";

export type ChainOutcome = Extract<ChainState,
  | "RECORDED"
  | "ABSENT_NETWORK"
  | "ABSENT_BUNDLER"
  | "ABSENT_PAYMASTER"
  | "SUBJECT_MISMATCH"
  | "SIMULATION_REVERTED"
  | "POLICY_REFUSED"
  | "SUBMISSION_FAILED"
  | "REPLACED"
  | "DROPPED"
  | "TIMED_OUT"
  | "REORGED"
  | "CONFIRMATION_FAILED"
  | "LEDGER_FAILED"
  | "FAILED_CLEANUP">;

// SEC-CHAIN-007. Testnet only, as an allowlist of exact chain IDs.
//
// A `isTestnet: boolean` field on the network subject would put the decision in the caller's
// hands, and the caller is the thing being constrained. A denylist of mainnet IDs would refuse
// the chains someone thought of and admit every chain they did not. So the admitted set is
// enumerated, and every other chain -- including one that really is a testnet -- is refused
// until it is added here deliberately.
export const ADMITTED_TESTNET_CHAIN_IDS: Readonly<Record<number, string>> = {
  11155111: "ethereum-sepolia",
  84532: "base-sepolia",
  421614: "arbitrum-sepolia",
  11155420: "optimism-sepolia",
};

export interface NetworkSubject {
  chainId: number;
  rpcId: string;
  rpcVersion: string;
  bundlerId: string;
  bundlerVersion: string;
  // The account-abstraction entry point the bundler and the account agree on. A bundler running
  // one version against an account deployed for another produces a validation revert that reads
  // like a policy failure.
  entryPointAddress: string;
  entryPointVersion: string;
}

export interface ContractSubject {
  // #62 owns the contracts. This provider consumes their identity as a subject and never
  // compiles, deploys or modifies anything: the deployment receipt is an input.
  accountAddress: string;
  accountBytecodeSha256: string;
  validatorAddress: string;
  validatorBytecodeSha256: string;
  deploymentReceiptSha256: string;
  chainId: number;
}

// SEC-CHAIN-002. Everything the operation has to be closed over. Each is a digest of a receipt
// produced elsewhere -- #54 intent, #56 workflow, #61 signing, #59/#60 hardware -- consumed
// through its public shape and never by reaching into the producing provider.
export interface InputReceipts {
  intentDigest: string;
  policyEpoch: number;
  workflowReceiptSha256: string;
  signingReceiptSha256: string;
  hardwareReceiptSha256: string | null;
  // The subject each of those receipts claims to be about. A stale receipt is one whose own
  // intent digest does not match the operation being built.
  boundIntentDigest: string;
  boundPolicyEpoch: number;
}

// SEC-CHAIN-009. Every economic bound, named rather than implied. A cap that is absent is not a
// generous cap, it is an unbounded one.
export interface EconomicLimits {
  maxValueWei: string;
  maxGasLimit: number;
  maxFeePerGasWei: string;
  maxTotalFeeWei: string;
  // Where a fee goes, if any. `null` means this operation routes no fee, which is a different
  // statement from an unspecified destination.
  feeRecipient: string | null;
  feeBasisPoints: number;
}

export interface OperationRequest {
  operationId: string;
  target: string;
  functionSelector: string;
  valueWei: string;
  gasLimit: number;
  maxFeePerGasWei: string;
  nonce: number;
}

// SEC-CHAIN-005. A paymaster quote is an offer with a scope and an expiry, not a blanket
// approval. `null` on the request means the operation is self-funded.
export interface PaymasterQuote {
  paymasterId: string;
  paymasterVersion: string;
  paymasterAddress: string;
  sponsoredTarget: string;
  sponsoredSelector: string;
  maxSponsoredWei: string;
  expiresAtEpochMs: number;
}

export interface SimulationResult {
  reverted: boolean;
  revertReason: string | null;
  gasUsed: number;
  // What the simulation was run against. A simulation of a different account or a different
  // chain proves nothing about this operation.
  simulatedAccount: string;
  simulatedChainId: number;
}

export type InclusionState = "pending" | "included" | "dropped" | "replaced";

export interface InclusionReport {
  state: InclusionState;
  transactionHash: string | null;
  blockNumber: number | null;
  // SEC-CHAIN-006. Included is not final. The head is how far the chain has moved since, and
  // the difference is the only thing that makes a confirmation policy meaningful.
  headBlockNumber: number;
  // The block hash the operation was included in, re-read at confirmation time. A reorg shows
  // up here as a different hash at the same height.
  blockHash: string | null;
}

export interface LedgerRecord {
  operationId: string;
  transactionHash: string;
  blockNumber: number;
  intentDigest: string;
  policyEpoch: number;
}

export interface CleanupAccount {
  processes: number;
  nonceLeases: number;
  openSubscriptions: number;
}

export interface ChainSubmissionReceipt {
  schema: typeof CHAIN_SUBMISSION_RECEIPT_SCHEMA;
  operationId: string;
  chainId: number;
  lifecycle: ChainState[];
  outcome: ChainOutcome;
  transactionHash: string | null;
  confirmations: number;
  // SEC-CHAIN-008. Redacted and content-bound. Nothing here is a credential, an endpoint URL or
  // a host path -- the broker holds those and this provider never sees them.
  cleanupCleared: boolean;
  detail: string;
}

// The chain boundary. RPC, bundler, paymaster and ledger live on the far side, reached through
// broker-held credentials this provider never holds. Admission, subject closure, simulation
// gating, idempotency, confirmation policy, economic limits and cleanup are owned here.
export interface ChainTransport {
  probeNetwork(): { reachable: boolean; chainId: number | null } ;
  probeBundler(): { reachable: boolean; bundlerVersion: string | null; entryPointAddress: string | null };
  quotePaymaster(operation: OperationRequest): PaymasterQuote | null;
  simulate(operation: OperationRequest): SimulationResult | null;
  // SEC-CHAIN-004. The transport reports whether this operation ID has already been submitted,
  // so a retry is answered from the chain rather than from local memory that a restart loses.
  submittedHashFor(operationId: string): string | null;
  submit(operation: OperationRequest, quote: PaymasterQuote | null): string | null;
  observe(transactionHash: string): InclusionReport;
  record(record: LedgerRecord): boolean;
  cleanupAccount(): CleanupAccount;
}
