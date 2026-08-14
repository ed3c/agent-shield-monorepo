import type {
  ChainTransport,
  CleanupAccount,
  InclusionReport,
  InclusionState,
  LedgerRecord,
  OperationRequest,
  PaymasterQuote,
} from "./types.ts";

export const TX_HASH = `0x${"a".repeat(64)}` as const;
export const BLOCK_HASH = `0x${"b".repeat(64)}` as const;
export const REORG_BLOCK_HASH = `0x${"c".repeat(64)}` as const;
export const ACCOUNT = `0x${"1".repeat(40)}` as const;
export const TARGET = `0x${"2".repeat(40)}` as const;
export const PAYMASTER = `0x${"3".repeat(40)}` as const;
export const ENTRY_POINT = `0x${"4".repeat(40)}` as const;

// A deterministic stand-in for the RPC, bundler, paymaster and ledger. Every field is a knob a
// negative control turns; nothing here talks to a chain.
export class FakeChainTransport implements ChainTransport {
  networkReachable = true;
  reportedChainId: number | null = 11155111;

  bundlerReachable = true;
  reportedBundlerVersion: string | null = "0.7.1";
  reportedEntryPoint: string | null = ENTRY_POINT;

  quotes = true;
  quoteOverride: Partial<PaymasterQuote> = {};

  simulates = true;
  simulationReverted = false;
  simulationGasUsed = 90_000;
  simulatedAccountOverride: string | null = null;
  simulatedChainIdOverride: number | null = null;

  // SEC-CHAIN-004. What the chain says about this operation ID before anything is submitted.
  priorSubmission: string | null = null;

  submits = true;
  submittedHashOverride: string | null = null;
  // SEC-CHAIN-004. Counted rather than inferred: "the retry did not double-submit" is a claim
  // about whether this method ran, and nothing else observes that.
  submitCalls = 0;

  inclusionState: InclusionState = "included";
  blockNumber: number | null = 100;
  headBlockNumber = 110;
  blockHash: string | null = BLOCK_HASH;
  // Set by the reorg control: the second read of the same transaction disagrees with the first.
  rereadBlockHash: string | null = null;
  rereadBlockNumber: number | null = null;
  #reads = 0;

  records = true;
  recorded: LedgerRecord[] = [];

  retainedProcesses = 0;
  retainedNonceLeases = 0;
  retainedSubscriptions = 0;

  probeNetwork(): { reachable: boolean; chainId: number | null } {
    return { reachable: this.networkReachable, chainId: this.reportedChainId };
  }

  probeBundler(): { reachable: boolean; bundlerVersion: string | null; entryPointAddress: string | null } {
    return {
      reachable: this.bundlerReachable,
      bundlerVersion: this.reportedBundlerVersion,
      entryPointAddress: this.reportedEntryPoint,
    };
  }

  quotePaymaster(operation: OperationRequest): PaymasterQuote | null {
    if (!this.quotes) return null;
    return {
      paymasterId: "sponsor-testnet",
      paymasterVersion: "1.2.0",
      paymasterAddress: PAYMASTER,
      sponsoredTarget: operation.target,
      sponsoredSelector: operation.functionSelector,
      maxSponsoredWei: "1000000000000000000",
      expiresAtEpochMs: 1_700_000_600_000,
      ...this.quoteOverride,
    };
  }

  simulate(operation: OperationRequest) {
    if (!this.simulates) return null;
    void operation;
    return {
      reverted: this.simulationReverted,
      revertReason: this.simulationReverted ? "AA23 reverted: signature error" : null,
      gasUsed: this.simulationGasUsed,
      simulatedAccount: this.simulatedAccountOverride ?? ACCOUNT,
      simulatedChainId: this.simulatedChainIdOverride ?? 11155111,
    };
  }

  submittedHashFor(operationId: string): string | null {
    void operationId;
    return this.priorSubmission;
  }

  submit(operation: OperationRequest, quote: PaymasterQuote | null): string | null {
    void operation;
    void quote;
    this.submitCalls += 1;
    if (!this.submits) return null;
    return this.submittedHashOverride ?? TX_HASH;
  }

  observe(transactionHash: string): InclusionReport {
    void transactionHash;
    this.#reads += 1;
    // The second read is what a reorg control changes: the same transaction, a different block.
    const isReread = this.#reads > 1;
    return {
      state: this.inclusionState,
      transactionHash: this.inclusionState === "included" ? TX_HASH : null,
      blockNumber: isReread && this.rereadBlockNumber !== null ? this.rereadBlockNumber : this.blockNumber,
      headBlockNumber: this.headBlockNumber,
      blockHash: isReread && this.rereadBlockHash !== null ? this.rereadBlockHash : this.blockHash,
    };
  }

  record(record: LedgerRecord): boolean {
    if (!this.records) return false;
    this.recorded.push(record);
    return true;
  }

  cleanupAccount(): CleanupAccount {
    return {
      processes: this.retainedProcesses,
      nonceLeases: this.retainedNonceLeases,
      openSubscriptions: this.retainedSubscriptions,
    };
  }
}
