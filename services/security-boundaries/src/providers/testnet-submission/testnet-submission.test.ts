import {
  ACCOUNT,
  ADMITTED_TESTNET_CHAIN_IDS,
  BLOCK_HASH,
  ENTRY_POINT,
  FakeChainTransport,
  PAYMASTER,
  REORG_BLOCK_HASH,
  TARGET,
  TX_HASH,
  assertChainTransition,
  assertContractSubject,
  assertEconomicLimits,
  assertNetworkSubject,
  isChainOutcome,
  paymasterRefusal,
  policyRefusal,
  receiptRefusal,
  runSubmission,
  testnetSubmissionState,
  validateChainLifecycle,
  type ChainOutcome,
  type ChainSubmissionReceipt,
  type ContractSubject,
  type EconomicLimits,
  type InputReceipts,
  type NetworkSubject,
  type OperationRequest,
  type PaymasterQuote,
} from "./index.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SEC-CHAIN ${message}`);
}

// A control that only asserts "something threw" also passes when a later line throws a
// TypeError for an unrelated reason, which makes a dead guard look load-bearing under a plant
// check. Every control must fail through this provider's own contract error.
function red(action: () => unknown, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  ok(thrown !== undefined, `${message} stayed green`);
  const text = thrown instanceof Error ? thrown.message : String(thrown);
  ok(text.startsWith("invalid chain contract: "), `${message} threw "${text}" rather than a chain contract error`);
}

const SEPOLIA = 11155111;
const NOW = 1_700_000_000_000;
const INTENT = "d".repeat(64);
const VALIDATOR = `0x${"5".repeat(40)}`;

function network(overrides: Partial<NetworkSubject> = {}): NetworkSubject {
  return {
    chainId: SEPOLIA,
    rpcId: "alchemy-sepolia",
    rpcVersion: "2.1.0",
    bundlerId: "pimlico",
    bundlerVersion: "0.7.1",
    entryPointAddress: ENTRY_POINT,
    entryPointVersion: "0.7.0",
    ...overrides,
  };
}

function contracts(overrides: Partial<ContractSubject> = {}): ContractSubject {
  return {
    accountAddress: ACCOUNT,
    accountBytecodeSha256: "a".repeat(64),
    validatorAddress: VALIDATOR,
    validatorBytecodeSha256: "b".repeat(64),
    deploymentReceiptSha256: "c".repeat(64),
    chainId: SEPOLIA,
    ...overrides,
  };
}

function receipts(overrides: Partial<InputReceipts> = {}): InputReceipts {
  return {
    intentDigest: INTENT,
    policyEpoch: 7,
    workflowReceiptSha256: "e".repeat(64),
    signingReceiptSha256: "f".repeat(64),
    hardwareReceiptSha256: "9".repeat(64),
    boundIntentDigest: INTENT,
    boundPolicyEpoch: 7,
    ...overrides,
  };
}

function operation(overrides: Partial<OperationRequest> = {}): OperationRequest {
  return {
    operationId: "op-1",
    target: TARGET,
    functionSelector: "0xa9059cbb",
    valueWei: "1000000",
    gasLimit: 200_000,
    maxFeePerGasWei: "2000000000",
    nonce: 3,
    ...overrides,
  };
}

function limits(overrides: Partial<EconomicLimits> = {}): EconomicLimits {
  return {
    maxValueWei: "1000000000000000000",
    maxGasLimit: 500_000,
    maxFeePerGasWei: "5000000000",
    maxTotalFeeWei: "1000000000000000",
    feeRecipient: null,
    feeBasisPoints: 0,
    ...overrides,
  };
}

interface RunOverrides {
  network?: Partial<NetworkSubject>;
  contracts?: Partial<ContractSubject>;
  receipts?: Partial<InputReceipts>;
  operation?: Partial<OperationRequest>;
  limits?: Partial<EconomicLimits>;
  sponsored?: boolean;
  nowEpochMs?: number;
}

function submit(transport = new FakeChainTransport(), overrides: RunOverrides = {}): ChainSubmissionReceipt {
  return runSubmission({
    network: network(overrides.network),
    contracts: contracts(overrides.contracts),
    receipts: receipts(overrides.receipts),
    operation: operation(overrides.operation),
    limits: limits(overrides.limits),
    sponsored: overrides.sponsored ?? false,
    transport,
    nowEpochMs: overrides.nowEpochMs ?? NOW,
  }).receipt;
}

// SEC-CHAIN-001 and SEC-CHAIN-007. Exact admission, on an allowlisted testnet.
function exactAdmission(): void {
  assertNetworkSubject(network());
  for (const chainId of Object.keys(ADMITTED_TESTNET_CHAIN_IDS).map(Number)) {
    assertNetworkSubject(network({ chainId }));
  }

  // The control #63 names: a production chain reaching the configuration. The allowlist refuses
  // every chain it does not name, so the mainnets below and the ones nobody listed fail alike.
  for (const chainId of [1, 8453, 42161, 137, 10, 56, 43114]) {
    red(() => assertNetworkSubject(network({ chainId })), `mainnet chain ${chainId}`);
  }
  red(() => assertNetworkSubject(network({ chainId: 31337 })), "an unlisted local chain");
  red(() => assertNetworkSubject(network({ chainId: 1.5 })), "a fractional chain identifier");
  red(() => assertNetworkSubject(network({ chainId: Number.NaN })), "a non-finite chain identifier");

  // A moving endpoint version is an endpoint whose behaviour can change under a pinned
  // operation, which is the mutable-endpoint policy the control names.
  red(() => assertNetworkSubject(network({ rpcVersion: "latest" })), "a moving RPC channel");
  red(() => assertNetworkSubject(network({ bundlerVersion: "LATEST" })), "a moving bundler channel");
  red(() => assertNetworkSubject(network({ entryPointVersion: "latest" })), "a moving entry point channel");
  // Shaped badly without being a moving channel. Every fixture the shape rule had was being
  // caught by the "latest" rule above, which the plant check surfaced.
  red(() => assertNetworkSubject(network({ rpcVersion: "2.1.0 beta" })), "a malformed RPC version");
  red(() => assertNetworkSubject(network({ bundlerVersion: "" })), "an absent bundler version");
  red(() => assertNetworkSubject(network({ rpcId: "A B" })), "a malformed RPC identifier");
  red(() => assertNetworkSubject(network({ bundlerId: "A B" })), "a malformed bundler identifier");
  red(() => assertNetworkSubject(network({ entryPointAddress: "0xnothex" })), "a malformed entry point address");

  assertContractSubject(contracts(), network());
  red(() => assertContractSubject(contracts({ accountAddress: "0xshort" }), network()), "a malformed account address");
  red(() => assertContractSubject(contracts({ validatorAddress: "0xshort" }), network()), "a malformed validator address");
  red(() => assertContractSubject(contracts({ accountBytecodeSha256: "short" }), network()), "unaddressed account bytecode");
  red(() => assertContractSubject(contracts({ validatorBytecodeSha256: "short" }), network()), "unaddressed validator bytecode");
  red(() => assertContractSubject(contracts({ deploymentReceiptSha256: "short" }), network()), "an unaddressed deployment receipt");
  // The same address on another chain is another contract.
  red(() => assertContractSubject(contracts({ chainId: 84532 }), network()), "a contract deployed on another chain");

  // The endpoint's own answer outranks the subject: a testnet RPC repointed at another chain
  // passes every static check.
  const repointed = new FakeChainTransport();
  repointed.reportedChainId = 84532;
  ok(submit(repointed).outcome === "ABSENT_NETWORK", "a repointed endpoint was admitted");

  const wrongBundler = new FakeChainTransport();
  wrongBundler.reportedBundlerVersion = "0.6.0";
  ok(submit(wrongBundler).outcome === "ABSENT_BUNDLER", "a bundler of another version was admitted");

  // A bundler on another entry point produces a validation revert that reads like a policy
  // failure, so the disagreement is named rather than discovered downstream.
  const wrongEntryPoint = new FakeChainTransport();
  wrongEntryPoint.reportedEntryPoint = `0x${"7".repeat(40)}`;
  ok(submit(wrongEntryPoint).outcome === "ABSENT_BUNDLER", "a bundler on another entry point was admitted");
}

// SEC-CHAIN-002. The operation is closed over its inputs or it is not built.
function subjectClosure(): void {
  ok(receiptRefusal(receipts()) === null, "closed receipts were refused");
  // An operation with no hardware evidence is legitimate -- a low-risk route never issues a
  // challenge -- so `null` is admitted and a malformed value is not.
  ok(receiptRefusal(receipts({ hardwareReceiptSha256: null })) === null, "an unchallenged operation was refused");

  const refusals: [string, Partial<InputReceipts>][] = [
    ["a stale intent", { boundIntentDigest: "1".repeat(64) }],
    ["a superseded policy epoch", { boundPolicyEpoch: 8 }],
    ["an unaddressed intent", { intentDigest: "short", boundIntentDigest: "short" }],
    ["an unaddressed workflow receipt", { workflowReceiptSha256: "short" }],
    ["an unaddressed signing receipt", { signingReceiptSha256: "short" }],
    ["an unaddressed hardware receipt", { hardwareReceiptSha256: "short" }],
    ["a fractional policy epoch", { policyEpoch: 7.5, boundPolicyEpoch: 7.5 }],
  ];
  for (const [label, overrides] of refusals) {
    ok(receiptRefusal(receipts(overrides)) !== null, `${label} was admitted`);
    ok(submit(new FakeChainTransport(), { receipts: overrides }).outcome === "SUBJECT_MISMATCH", `${label} did not report a subject mismatch`);
  }
}

// SEC-CHAIN-003. Nothing is submitted past a failed simulation.
function simulation(): void {
  const clean = submit();
  ok(clean.outcome === "RECORDED", `a clean run reported ${clean.outcome}`);

  const cases: [string, (transport: FakeChainTransport) => void][] = [
    ["a simulation that did not run", (t) => { t.simulates = false; }],
    ["a reverting simulation", (t) => { t.simulationReverted = true; }],
    ["a simulation against another account", (t) => { t.simulatedAccountOverride = `0x${"8".repeat(40)}`; }],
    ["a simulation against another chain", (t) => { t.simulatedChainIdOverride = 84532; }],
    ["a simulation that exhausted the gas limit", (t) => { t.simulationGasUsed = 300_000; }],
  ];
  for (const [label, mutate] of cases) {
    const transport = new FakeChainTransport();
    mutate(transport);
    const receipt = submit(transport);
    ok(receipt.outcome === "SIMULATION_REVERTED", `${label} reported ${receipt.outcome}`);
    // The point of the gate: nothing reached the bundler.
    ok(transport.submitCalls === 0, `${label} was submitted anyway`);
    ok(receipt.transactionHash === null, `${label} produced a transaction hash`);
  }
}

// SEC-CHAIN-004. A retry reconciles against the chain rather than double-submitting.
function idempotency(): void {
  const transport = new FakeChainTransport();
  const first = submit(transport);
  ok(first.outcome === "RECORDED", `the first submission reported ${first.outcome}`);
  ok(transport.submitCalls === 1, `the first submission called submit ${transport.submitCalls} times`);

  // The retry: the chain already knows this operation ID.
  const retryTransport = new FakeChainTransport();
  retryTransport.priorSubmission = TX_HASH;
  const retry = submit(retryTransport);
  ok(retry.outcome === "RECORDED", `the retry reported ${retry.outcome}`);
  ok(retryTransport.submitCalls === 0, "the retry submitted a second time");
  ok(retry.transactionHash === TX_HASH, "the retry lost the original transaction hash");
  ok(retry.lifecycle.includes("SUBMITTED"), "the retry did not record that the operation was submitted");

  // A prior submission the transport cannot describe is not something to build on.
  const malformed = new FakeChainTransport();
  malformed.priorSubmission = "0xnot-a-hash";
  const refused = submit(malformed);
  ok(refused.outcome === "SUBMISSION_FAILED", `a malformed prior submission reported ${refused.outcome}`);
  ok(malformed.submitCalls === 0, "a malformed prior submission was resubmitted");

  const rejected = new FakeChainTransport();
  rejected.submits = false;
  ok(submit(rejected).outcome === "SUBMISSION_FAILED", "a rejected submission was admitted");

  const badHash = new FakeChainTransport();
  badHash.submittedHashOverride = "0xnot-a-hash";
  ok(submit(badHash).outcome === "SUBMISSION_FAILED", "a malformed submission hash was admitted");

  // Replacement is its own state: another operation took the nonce, which is not a drop and not
  // a timeout.
  const replaced = new FakeChainTransport();
  replaced.inclusionState = "replaced";
  ok(submit(replaced).outcome === "REPLACED", "a replaced nonce was not reported as replaced");
}

// SEC-CHAIN-005. Sponsorship is an offer with a scope and an expiry.
function paymaster(): void {
  const sponsored = submit(new FakeChainTransport(), { sponsored: true });
  ok(sponsored.outcome === "RECORDED", `a sponsored run reported ${sponsored.outcome}`);

  // A sponsored operation with no quote must not silently self-fund: that spends the account's
  // own balance without anyone having asked.
  const noQuote = new FakeChainTransport();
  noQuote.quotes = false;
  ok(submit(noQuote, { sponsored: true }).outcome === "ABSENT_PAYMASTER", "a sponsored operation fell back to self-funding");
  // An unsponsored operation does not consult the paymaster at all.
  ok(submit(noQuote, { sponsored: false }).outcome === "RECORDED", "an unsponsored operation required a quote");

  const quoteRefusals: [string, Partial<PaymasterQuote>][] = [
    ["a quote for another target", { sponsoredTarget: `0x${"8".repeat(40)}` }],
    ["a quote for another function", { sponsoredSelector: "0xdeadbeef" }],
    ["a quote below the operation value", { maxSponsoredWei: "1" }],
    ["an expired quote", { expiresAtEpochMs: NOW }],
    ["a moving paymaster version", { paymasterVersion: "latest" }],
    ["a malformed paymaster address", { paymasterAddress: "0xshort" }],
    ["a malformed paymaster identifier", { paymasterId: "A B" }],
    ["a fractional expiry", { expiresAtEpochMs: 1_700_000_600_000.5 }],
  ];
  for (const [label, override] of quoteRefusals) {
    const transport = new FakeChainTransport();
    transport.quoteOverride = override;
    const receipt = submit(transport, { sponsored: true });
    ok(receipt.outcome === "POLICY_REFUSED", `${label} reported ${receipt.outcome}`);
    ok(transport.submitCalls === 0, `${label} was submitted anyway`);
  }

  const quote = new FakeChainTransport().quotePaymaster(operation()) as PaymasterQuote;
  ok(paymasterRefusal(quote, operation(), NOW) === null, "a valid quote was refused");
  ok(quote.paymasterAddress === PAYMASTER, "the quote lost its paymaster address");
}

// SEC-CHAIN-006. Included is not final.
function confirmationAndReorg(): void {
  const settled = submit();
  ok(settled.outcome === "RECORDED", `a settled run reported ${settled.outcome}`);
  ok(settled.confirmations >= 5, `a settled run reported ${settled.confirmations} confirmations`);

  // The control #63 names: reporting mempool or submitted state as settled.
  const pending = new FakeChainTransport();
  pending.inclusionState = "pending";
  const waiting = submit(pending);
  ok(waiting.outcome === "TIMED_OUT", `a pending operation reported ${waiting.outcome}`);
  ok(waiting.lifecycle.includes("INCLUDED") === false, "a pending operation was recorded as included");

  const dropped = new FakeChainTransport();
  dropped.inclusionState = "dropped";
  ok(submit(dropped).outcome === "DROPPED", "a dropped operation was not reported as dropped");

  // One confirmation is inclusion, not finality.
  const shallow = new FakeChainTransport();
  shallow.headBlockNumber = 102;
  const thin = submit(shallow);
  ok(thin.outcome === "CONFIRMATION_FAILED", `a three-confirmation operation reported ${thin.outcome}`);
  ok(thin.confirmations === 3, `a three-confirmation operation reported ${thin.confirmations}`);

  // A head behind the inclusion block and a head not far enough past it share an outcome, so
  // the outcome alone cannot tell them apart -- which is what the plant check found. The detail
  // is the only place they differ, and a transport reporting something impossible is a
  // different fact from an operation that simply needs more time.
  const impossible = new FakeChainTransport();
  impossible.headBlockNumber = 99;
  const inverted = submit(impossible);
  ok(inverted.outcome === "CONFIRMATION_FAILED", "a head behind the inclusion block was admitted");
  ok(inverted.detail.includes("head is behind"), `an impossible head reported "${inverted.detail}"`);
  ok(inverted.confirmations === 0, `an impossible head reported ${inverted.confirmations} confirmations`);
  ok(thin.detail.includes("head is behind") === false, "a shallow confirmation was reported as an impossible head");

  const blockless = new FakeChainTransport();
  blockless.blockNumber = null;
  ok(submit(blockless).outcome === "CONFIRMATION_FAILED", "inclusion without a block was admitted");

  const hashless = new FakeChainTransport();
  hashless.blockHash = null;
  ok(submit(hashless).outcome === "CONFIRMATION_FAILED", "inclusion without a block hash was admitted");

  // A reorg is a different block at the same height on the second read. Reading once and
  // trusting it is what makes included look like settled.
  const reorged = new FakeChainTransport();
  reorged.rereadBlockHash = REORG_BLOCK_HASH;
  const forked = submit(reorged);
  ok(forked.outcome === "REORGED", `a reorged operation reported ${forked.outcome}`);
  ok(forked.lifecycle.includes("CONFIRMED") === false, "a reorged operation was confirmed");

  const moved = new FakeChainTransport();
  moved.rereadBlockNumber = 101;
  ok(submit(moved).outcome === "REORGED", "an operation that moved block was confirmed");

  ok(BLOCK_HASH !== REORG_BLOCK_HASH, "the reorg fixture uses the same block hash");
}

// SEC-CHAIN-009. Every economic bound, and fee routing that is either named or absent.
function economicLimits(): void {
  assertEconomicLimits(limits());
  assertEconomicLimits(limits({ feeBasisPoints: 50, feeRecipient: `0x${"6".repeat(40)}` }));

  // A fee with no destination goes somewhere the receipt does not name; a destination with no
  // fee is a field nobody will keep in step. Either alone is a hidden fee route.
  red(() => assertEconomicLimits(limits({ feeBasisPoints: 50 })), "a fee with no named recipient");
  red(() => assertEconomicLimits(limits({ feeRecipient: `0x${"6".repeat(40)}` })), "a fee recipient with no fee");
  red(() => assertEconomicLimits(limits({ feeBasisPoints: 50, feeRecipient: "0xshort" })), "a malformed fee recipient");
  red(() => assertEconomicLimits(limits({ feeBasisPoints: -1 })), "a negative fee");
  red(() => assertEconomicLimits(limits({ maxGasLimit: 0 })), "a zero gas cap");
  red(() => assertEconomicLimits(limits({ maxValueWei: "-1" })), "a negative value cap");
  red(() => assertEconomicLimits(limits({ maxTotalFeeWei: "1e18" })), "a non-decimal fee cap");

  ok(policyRefusal(operation(), limits()) === null, "a bounded operation was refused");

  const breaches: [string, Partial<OperationRequest>][] = [
    ["an over-value operation", { valueWei: "2000000000000000000" }],
    // The three fee bounds overlap unless each fixture is shaped to breach exactly one: the
    // plant check found the total-fee rule catching both of the others' fixtures.
    ["an over-gas operation", { gasLimit: 600_000, maxFeePerGasWei: "1" }],
    ["an over-priced operation", { gasLimit: 100_000, maxFeePerGasWei: "6000000000" }],
    ["a malformed target", { target: "0xshort" }],
    ["a malformed selector", { functionSelector: "0xa9" }],
    ["a negative nonce", { nonce: -1 }],
    ["a zero gas limit", { gasLimit: 0 }],
    ["a malformed operation identifier", { operationId: "A B" }],
  ];
  for (const [label, overrides] of breaches) {
    ok(policyRefusal(operation(overrides), limits()) !== null, `${label} was admitted`);
    const transport = new FakeChainTransport();
    ok(submit(transport, { operation: overrides }).outcome === "POLICY_REFUSED", `${label} did not report a policy refusal`);
    ok(transport.submitCalls === 0, `${label} was submitted anyway`);
  }

  // The per-gas cap and the total cap are different bounds: a modest gas price on an enormous
  // gas limit passes the first and fails the second, which is the case a single cap misses.
  const withinPerGas = operation({ gasLimit: 400_000, maxFeePerGasWei: "4000000000" });
  ok(policyRefusal(withinPerGas, limits()) !== null, "an operation within the per-gas cap escaped the total cap");
  ok(policyRefusal(withinPerGas, limits({ maxTotalFeeWei: "2000000000000000" })) === null, "a raised total cap still refused");

  // Wei values are compared as BigInt because they do not fit in a double. A cap compared as a
  // float stops working exactly where it matters.
  const huge = operation({ valueWei: "9007199254740993" });
  ok(policyRefusal(huge, limits({ maxValueWei: "9007199254740992" })) !== null, "a value above a large cap was admitted");
}

// SEC-CHAIN-008. Credentials are brokered and host state is accounted for.
function privacyAndCleanup(): void {
  const leaks: [string, (transport: FakeChainTransport) => void][] = [
    ["a process", (t) => { t.retainedProcesses = 1; }],
    ["a nonce lease", (t) => { t.retainedNonceLeases = 1; }],
    ["an open subscription", (t) => { t.retainedSubscriptions = 1; }],
  ];
  for (const [label, leak] of leaks) {
    const transport = new FakeChainTransport();
    leak(transport);
    const receipt = submit(transport);
    ok(receipt.outcome === "FAILED_CLEANUP", `${label} left behind reported ${receipt.outcome}`);
    ok(receipt.cleanupCleared === false, `${label} left behind was reported as cleared`);
  }
  ok(submit().cleanupCleared === true, "a clean run was reported as leaking");

  // A run that failed for its own reason still reports whether it cleaned up. Two facts, not
  // one, and the outcome names the earlier failure because that is the more useful of the two.
  const failedAndLeaked = new FakeChainTransport();
  failedAndLeaked.simulationReverted = true;
  failedAndLeaked.retainedNonceLeases = 1;
  const receipt = submit(failedAndLeaked);
  ok(receipt.outcome === "SIMULATION_REVERTED", `a failed run that leaked reported ${receipt.outcome}`);
  ok(receipt.cleanupCleared === false, "a failed run that leaked was reported as cleared");

  // The receipt carries no endpoint, credential or host path. `ChainTransport` has no member
  // that returns one, so there is nothing to redact -- the broker holds them and this provider
  // never sees them.
  const text = JSON.stringify(submit());
  for (const forbidden of ["http", "://", "apiKey", "Bearer", "alchemy-sepolia", "pimlico"]) {
    ok(text.includes(forbidden) === false, `the receipt carried ${forbidden}`);
  }
  type Forbids<T, K extends string> = K extends keyof T ? never : true;
  const transportHasNoCredential: Forbids<FakeChainTransport, "apiKey" | "rpcUrl" | "privateKey" | "endpoint"> = true;
  void transportHasNoCredential;

  // The ledger record is the last step and its failure is its own state: the operation really
  // did confirm, and reporting it as unsubmitted would be worse than reporting the ledger.
  const noLedger = new FakeChainTransport();
  noLedger.records = false;
  const unrecorded = submit(noLedger);
  ok(unrecorded.outcome === "LEDGER_FAILED", `a failed ledger reported ${unrecorded.outcome}`);
  ok(unrecorded.transactionHash === TX_HASH, "a failed ledger discarded the transaction hash");

  const ledger = new FakeChainTransport();
  submit(ledger);
  ok(ledger.recorded.length === 1, `the ledger received ${ledger.recorded.length} records`);
  ok(ledger.recorded[0]?.intentDigest === INTENT, "the ledger record lost its intent binding");
  ok(ledger.recorded[0]?.policyEpoch === 7, "the ledger record lost its policy epoch");
}

// The transition table itself. The provider only ever builds legal traces, so without this the
// enforcement point is type-checked and never executed.
function transitionLegality(): void {
  ok(validateChainLifecycle(["UNRESOLVED", "ABSENT_NETWORK"]) === "ABSENT_NETWORK", "a legal trace was refused");
  ok(isChainOutcome("RECORDED"), "RECORDED is not recognised as an outcome");
  ok(isChainOutcome("SUBMITTED") === false, "SUBMITTED is treated as an outcome");

  red(() => assertChainTransition("OPERATION_BUILT", "SUBMITTED"), "submitting past a simulation");
  red(() => assertChainTransition("SIMULATED", "SUBMITTED"), "submitting without authorization");
  red(() => assertChainTransition("SUBMITTED", "CONFIRMED"), "confirming without inclusion");
  red(() => assertChainTransition("INCLUDED", "RECORDED"), "recording without confirmation");
  red(() => assertChainTransition("UNRESOLVED", "OPERATION_BUILT"), "building without admitting a network");
  red(() => assertChainTransition("RECORDED", "UNRESOLVED"), "restarting a recorded operation");

  red(() => validateChainLifecycle(["UNRESOLVED", "RECORDED"]), "a trace that skipped the whole submission");
  red(() => validateChainLifecycle(["NETWORK_ADMITTED", "SUBJECT_MISMATCH"]), "a trace that did not start at UNRESOLVED");
  red(() => validateChainLifecycle(["UNRESOLVED", "NETWORK_ADMITTED"]), "a trace that stopped short of an outcome");
  red(() => validateChainLifecycle(["UNRESOLVED"]), "a single-state trace");
}

// Every terminal state #63 names must be produced by a distinct fixture.
function stateSeparation(): void {
  const outcomes = new Set<ChainOutcome>();
  const fixtures: [string, () => ChainOutcome][] = [
    ["recorded", () => submit().outcome],
    ["absent network", () => { const t = new FakeChainTransport(); t.networkReachable = false; return submit(t).outcome; }],
    ["absent bundler", () => { const t = new FakeChainTransport(); t.bundlerReachable = false; return submit(t).outcome; }],
    ["absent paymaster", () => { const t = new FakeChainTransport(); t.quotes = false; return submit(t, { sponsored: true }).outcome; }],
    ["subject mismatch", () => submit(new FakeChainTransport(), { receipts: { boundPolicyEpoch: 8 } }).outcome],
    ["simulation reverted", () => { const t = new FakeChainTransport(); t.simulationReverted = true; return submit(t).outcome; }],
    ["policy refused", () => submit(new FakeChainTransport(), { operation: { gasLimit: 600_000 } }).outcome],
    ["submission failed", () => { const t = new FakeChainTransport(); t.submits = false; return submit(t).outcome; }],
    ["replaced", () => { const t = new FakeChainTransport(); t.inclusionState = "replaced"; return submit(t).outcome; }],
    ["dropped", () => { const t = new FakeChainTransport(); t.inclusionState = "dropped"; return submit(t).outcome; }],
    ["timed out", () => { const t = new FakeChainTransport(); t.inclusionState = "pending"; return submit(t).outcome; }],
    ["reorged", () => { const t = new FakeChainTransport(); t.rereadBlockHash = REORG_BLOCK_HASH; return submit(t).outcome; }],
    ["confirmation failed", () => { const t = new FakeChainTransport(); t.headBlockNumber = 102; return submit(t).outcome; }],
    ["ledger failed", () => { const t = new FakeChainTransport(); t.records = false; return submit(t).outcome; }],
    ["failed cleanup", () => { const t = new FakeChainTransport(); t.retainedNonceLeases = 1; return submit(t).outcome; }],
  ];
  for (const [label, invoke] of fixtures) {
    const outcome = invoke();
    ok(outcome !== undefined, `${label} produced no outcome`);
    outcomes.add(outcome);
  }
  ok(outcomes.size === 15, `the fixtures cover ${outcomes.size} distinct outcomes, expected 15`);
}

function evidenceBoundary(): void {
  ok(testnetSubmissionState.testnetSubmission === "NOT_EXERCISED", "a testnet submission was claimed");
  ok(testnetSubmissionState.bundlerInclusion === "NOT_EXERCISED", "a bundler inclusion was claimed");
  ok(testnetSubmissionState.paymasterSponsorship === "NOT_EXERCISED", "a paymaster sponsorship was claimed");
  ok(testnetSubmissionState.mainnetSubmission === "NOT_IMPLEMENTED", "a mainnet submission was claimed");
  ok(testnetSubmissionState.productionKeyCustody === "NOT_IMPLEMENTED", "production key custody was claimed");
}

type NeverPass<T> = "PASS" extends T[keyof T] ? never : true;
const chainNeverPasses: NeverPass<typeof testnetSubmissionState> = true;
void chainNeverPasses;

exactAdmission();
subjectClosure();
simulation();
idempotency();
paymaster();
confirmationAndReorg();
economicLimits();
privacyAndCleanup();
transitionLegality();
stateSeparation();
evidenceBoundary();

console.log("SEC-CHAIN GREEN: exact admission, subject closure, simulation, idempotency, paymaster, confirmation/reorg, economic limits, privacy/cleanup, transition legality");
