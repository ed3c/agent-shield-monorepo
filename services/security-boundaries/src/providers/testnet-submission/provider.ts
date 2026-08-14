import { validateChainLifecycle } from "./state-machine.ts";
import {
  ADMITTED_TESTNET_CHAIN_IDS,
  CHAIN_SUBMISSION_RECEIPT_SCHEMA,
  type ChainState,
  type ChainSubmissionReceipt,
  type ChainTransport,
  type ContractSubject,
  type EconomicLimits,
  type InputReceipts,
  type NetworkSubject,
  type OperationRequest,
  type PaymasterQuote,
} from "./types.ts";

const SHA_256 = /^[a-f0-9]{64}$/;
const ADDRESS = /^0x[a-f0-9]{40}$/;
const SELECTOR = /^0x[a-f0-9]{8}$/;
const TX_HASH = /^0x[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const WEI = /^(?:0|[1-9][0-9]{0,29})$/;

// SEC-CHAIN-006. How far the chain has to move past the inclusion block before this provider
// will call an operation settled. One block is inclusion, not finality.
const REQUIRED_CONFIRMATIONS = 5;

export function fail(message: string): never {
  throw new Error(`invalid chain contract: ${message}`);
}

// Wei values arrive as decimal strings because they do not fit in a double. Comparing them as
// BigInt is the only reading that is correct at the top of the range, and a cap silently
// compared as a float is a cap that stops working exactly where it matters.
function wei(value: string, name: string): bigint {
  if (!WEI.test(value)) fail(`${name} is not a decimal wei amount`);
  return BigInt(value);
}

// SEC-CHAIN-001 and SEC-CHAIN-007. The network, as an exact subject on an admitted testnet.
export function assertNetworkSubject(subject: NetworkSubject): NetworkSubject {
  // There is deliberately no `Number.isSafeInteger(chainId)` check. It was written first and
  // the plant check found it dead: a fractional or non-finite chain ID is not a key of
  // ADMITTED_TESTNET_CHAIN_IDS either, so the allowlist below already refuses it and removing
  // the integer check turned nothing red.
  //
  // The allowlist is the whole testnet-safety control. A caller-supplied `isTestnet` flag would
  // put the decision in the hands of the thing being constrained, and a denylist of mainnet IDs
  // would admit every chain nobody thought of.
  if (ADMITTED_TESTNET_CHAIN_IDS[subject.chainId] === undefined) {
    fail(`chain ${subject.chainId} is not an admitted testnet`);
  }
  for (const [name, value] of [["rpcId", subject.rpcId], ["bundlerId", subject.bundlerId]] as const) {
    if (!SAFE_ID.test(value)) fail(`${name} is invalid`);
  }
  for (const [name, value] of [
    ["rpcVersion", subject.rpcVersion],
    ["bundlerVersion", subject.bundlerVersion],
    ["entryPointVersion", subject.entryPointVersion],
  ] as const) {
    if (!SAFE_VERSION.test(value)) fail(`${name} is invalid`);
    // A moving endpoint version is an endpoint whose behaviour can change under a pinned
    // operation, which is the mutable-endpoint policy SEC-CHAIN-001's control names.
    if (value.toLowerCase() === "latest") fail(`${name} must be exact, not a moving channel`);
  }
  if (!ADDRESS.test(subject.entryPointAddress)) fail("entryPointAddress is invalid");
  return subject;
}

export function assertContractSubject(subject: ContractSubject, network: NetworkSubject): ContractSubject {
  for (const [name, value] of [
    ["accountAddress", subject.accountAddress],
    ["validatorAddress", subject.validatorAddress],
  ] as const) {
    if (!ADDRESS.test(value)) fail(`${name} is invalid`);
  }
  for (const [name, value] of [
    ["accountBytecodeSha256", subject.accountBytecodeSha256],
    ["validatorBytecodeSha256", subject.validatorBytecodeSha256],
    ["deploymentReceiptSha256", subject.deploymentReceiptSha256],
  ] as const) {
    if (!SHA_256.test(value)) fail(`${name} is not content-addressed`);
  }
  // A contract deployed on one chain is not the same contract at the same address on another.
  if (subject.chainId !== network.chainId) fail("the contract subject was deployed on another chain");
  return subject;
}

// SEC-CHAIN-009. Every economic bound named, and each one checked. A cap that is absent is not
// generous, it is unbounded.
export function assertEconomicLimits(limits: EconomicLimits): EconomicLimits {
  wei(limits.maxValueWei, "maxValueWei");
  wei(limits.maxFeePerGasWei, "maxFeePerGasWei");
  wei(limits.maxTotalFeeWei, "maxTotalFeeWei");
  if (!Number.isSafeInteger(limits.maxGasLimit) || limits.maxGasLimit <= 0) fail("maxGasLimit must be a positive whole number");
  if (!Number.isSafeInteger(limits.feeBasisPoints) || limits.feeBasisPoints < 0) fail("feeBasisPoints must be a whole number");
  // A fee with no destination is a fee going somewhere the receipt does not name, and a
  // destination with no fee is a field nobody will keep in step. Either alone is the hidden
  // fee routing SEC-CHAIN-009's control looks for.
  if (limits.feeBasisPoints > 0 && limits.feeRecipient === null) fail("a fee is charged with no named recipient");
  if (limits.feeBasisPoints === 0 && limits.feeRecipient !== null) fail("a fee recipient is named with no fee");
  if (limits.feeRecipient !== null && !ADDRESS.test(limits.feeRecipient)) fail("feeRecipient is invalid");
  return limits;
}

// SEC-CHAIN-002. The operation is closed over its inputs, or it is not built.
export function receiptRefusal(receipts: InputReceipts): string | null {
  for (const [name, value] of [
    ["intentDigest", receipts.intentDigest],
    ["workflowReceiptSha256", receipts.workflowReceiptSha256],
    ["signingReceiptSha256", receipts.signingReceiptSha256],
  ] as const) {
    if (!SHA_256.test(value)) return `${name} is not content-addressed`;
  }
  if (receipts.hardwareReceiptSha256 !== null && !SHA_256.test(receipts.hardwareReceiptSha256)) {
    return "hardwareReceiptSha256 is not content-addressed";
  }
  // The receipts say what they are about. A stale one is a receipt whose own subject is not
  // this operation's, and mixing two epochs is how an operation authorised under a superseded
  // policy reaches a bundler.
  if (receipts.boundIntentDigest !== receipts.intentDigest) return "an input receipt is bound to another intent";
  if (receipts.boundPolicyEpoch !== receipts.policyEpoch) return "an input receipt is bound to another policy epoch";
  if (!Number.isSafeInteger(receipts.policyEpoch) || receipts.policyEpoch < 0) return "the policy epoch is not a whole number";
  return null;
}

// SEC-CHAIN-009. The operation against its bounds.
export function policyRefusal(operation: OperationRequest, limits: EconomicLimits): string | null {
  if (!SAFE_ID.test(operation.operationId)) return "the operation identifier is invalid";
  if (!ADDRESS.test(operation.target)) return "the operation target is not an address";
  if (!SELECTOR.test(operation.functionSelector)) return "the operation selector is not a four-byte selector";
  if (!Number.isSafeInteger(operation.nonce) || operation.nonce < 0) return "the operation nonce is not a whole number";
  if (!Number.isSafeInteger(operation.gasLimit) || operation.gasLimit <= 0) return "the operation gas limit is not a positive whole number";

  if (wei(operation.valueWei, "valueWei") > wei(limits.maxValueWei, "maxValueWei")) return "the operation value exceeds its cap";
  if (operation.gasLimit > limits.maxGasLimit) return "the operation gas limit exceeds its cap";
  const feePerGas = wei(operation.maxFeePerGasWei, "operation maxFeePerGasWei");
  if (feePerGas > wei(limits.maxFeePerGasWei, "maxFeePerGasWei")) return "the operation fee per gas exceeds its cap";
  // The per-gas cap and the total cap are different bounds: a modest gas price on an enormous
  // gas limit passes the first and not the second.
  if (feePerGas * BigInt(operation.gasLimit) > wei(limits.maxTotalFeeWei, "maxTotalFeeWei")) {
    return "the operation total fee exceeds its cap";
  }
  return null;
}

// SEC-CHAIN-005. A sponsorship is an offer with a scope and an expiry.
export function paymasterRefusal(
  quote: PaymasterQuote,
  operation: OperationRequest,
  nowEpochMs: number,
): string | null {
  if (!SAFE_ID.test(quote.paymasterId)) return "the paymaster identifier is invalid";
  if (!SAFE_VERSION.test(quote.paymasterVersion) || quote.paymasterVersion.toLowerCase() === "latest") {
    return "the paymaster version must be exact";
  }
  if (!ADDRESS.test(quote.paymasterAddress)) return "the paymaster address is invalid";
  // A quote that does not name what it sponsors sponsors everything, which is the unrestricted
  // approval SEC-CHAIN-005's control names.
  if (quote.sponsoredTarget !== operation.target) return "the quote sponsors another target";
  if (quote.sponsoredSelector !== operation.functionSelector) return "the quote sponsors another function";
  if (wei(operation.valueWei, "valueWei") > wei(quote.maxSponsoredWei, "maxSponsoredWei")) {
    return "the operation exceeds the sponsored amount";
  }
  if (!Number.isSafeInteger(quote.expiresAtEpochMs)) return "the quote expiry is not a whole number of milliseconds";
  if (nowEpochMs >= quote.expiresAtEpochMs) return "the paymaster quote has expired";
  return null;
}

interface Cleanup {
  cleared: boolean;
  detail: string;
}

// SEC-CHAIN-008. Asked once, after every run. A leased nonce that is never released blocks
// every later operation from the same account, so it is accounted for whatever else happened.
function cleanup(transport: ChainTransport): Cleanup {
  const account = transport.cleanupAccount();
  const leaks = [
    ["processes", account.processes],
    ["nonce leases", account.nonceLeases],
    ["open subscriptions", account.openSubscriptions],
  ] as const;
  const retained = leaks.filter(([, count]) => count > 0);
  if (retained.length === 0) return { cleared: true, detail: "no process, nonce lease or subscription was retained" };
  return { cleared: false, detail: `the run retained ${retained.map(([name, count]) => `${count} ${name}`).join(", ")}` };
}

function receipt(
  operationId: string,
  chainId: number,
  lifecycle: ChainState[],
  detail: string,
  transactionHash: string | null,
  confirmations: number,
  cleanupCleared: boolean,
): ChainSubmissionReceipt {
  return {
    schema: CHAIN_SUBMISSION_RECEIPT_SCHEMA,
    operationId,
    chainId,
    lifecycle,
    outcome: validateChainLifecycle(lifecycle),
    transactionHash,
    confirmations,
    cleanupCleared,
    detail,
  };
}

export interface SubmissionRequest {
  network: NetworkSubject;
  contracts: ContractSubject;
  receipts: InputReceipts;
  operation: OperationRequest;
  limits: EconomicLimits;
  // `true` when the operation is meant to be sponsored. A quote that does not arrive is then
  // ABSENT_PAYMASTER rather than a silent fall back to self-funding, which would spend the
  // account's own testnet balance without anyone having asked.
  sponsored: boolean;
  transport: ChainTransport;
  nowEpochMs: number;
}

// UNRESOLVED → NETWORK_ADMITTED → CONTRACTS_RESOLVED → INPUT_RECEIPTS_VERIFIED
//           → OPERATION_BUILT → SIMULATED → AUTHORIZED → SUBMITTED → INCLUDED
//           → CONFIRMED → RECORDED
export function runSubmission(request: SubmissionRequest): { receipt: ChainSubmissionReceipt } {
  const { network, contracts, receipts, operation, limits, sponsored, transport, nowEpochMs } = request;
  assertNetworkSubject(network);
  assertContractSubject(contracts, network);
  assertEconomicLimits(limits);
  const id = operation.operationId;
  const chainId = network.chainId;
  const lifecycle: ChainState[] = ["UNRESOLVED"];
  const done = (detail: string, hash: string | null = null, confirmations = 0): { receipt: ChainSubmissionReceipt } => {
    const cleared = cleanup(transport);
    return { receipt: receipt(id, chainId, lifecycle, detail, hash, confirmations, cleared.cleared) };
  };

  const networkProbe = transport.probeNetwork();
  if (!networkProbe.reachable) {
    lifecycle.push("ABSENT_NETWORK");
    return done("the RPC endpoint is not reachable");
  }
  // The chain the endpoint actually serves, not the one the subject claims. A testnet RPC that
  // has been repointed at mainnet answers every other check identically.
  if (networkProbe.chainId !== chainId) {
    lifecycle.push("ABSENT_NETWORK");
    return done(`the endpoint serves chain ${networkProbe.chainId} and the subject names ${chainId}`);
  }

  const bundlerProbe = transport.probeBundler();
  if (!bundlerProbe.reachable) {
    lifecycle.push("ABSENT_BUNDLER");
    return done("the bundler is not reachable");
  }
  if (bundlerProbe.bundlerVersion !== network.bundlerVersion) {
    lifecycle.push("ABSENT_BUNDLER");
    return done("the bundler is not the admitted version");
  }
  // A bundler on one entry point against an account deployed for another produces a validation
  // revert that reads like a policy failure, so the disagreement is named here instead.
  if (bundlerProbe.entryPointAddress !== network.entryPointAddress) {
    lifecycle.push("ABSENT_BUNDLER");
    return done("the bundler runs another entry point");
  }
  lifecycle.push("NETWORK_ADMITTED", "CONTRACTS_RESOLVED");

  const receiptRefused = receiptRefusal(receipts);
  if (receiptRefused !== null) {
    lifecycle.push("SUBJECT_MISMATCH");
    return done(receiptRefused);
  }
  lifecycle.push("INPUT_RECEIPTS_VERIFIED");

  const policyRefused = policyRefusal(operation, limits);
  if (policyRefused !== null) {
    lifecycle.push("POLICY_REFUSED");
    return done(policyRefused);
  }
  lifecycle.push("OPERATION_BUILT");

  // SEC-CHAIN-004. Idempotency is answered from the chain, before anything is spent. A retry
  // after a crash has no local memory to consult, and a local-only ledger is exactly the thing
  // the crash destroyed.
  const alreadySubmitted = transport.submittedHashFor(id);
  if (alreadySubmitted !== null) {
    if (!TX_HASH.test(alreadySubmitted)) {
      lifecycle.push("SUBMISSION_FAILED");
      return done("the transport reported a malformed prior submission");
    }
    return observeAndRecord(request, lifecycle, alreadySubmitted, ["SIMULATED", "AUTHORIZED", "SUBMITTED"]);
  }

  const simulation = transport.simulate(operation);
  if (simulation === null) {
    lifecycle.push("SIMULATION_REVERTED");
    return done("the simulation did not run");
  }
  // A simulation of a different account or a different chain proves nothing about this
  // operation, and it is the shape a cached or cross-environment simulator produces.
  if (simulation.simulatedAccount !== contracts.accountAddress || simulation.simulatedChainId !== chainId) {
    lifecycle.push("SIMULATION_REVERTED");
    return done("the simulation ran against another account or chain");
  }
  if (simulation.reverted) {
    lifecycle.push("SIMULATION_REVERTED");
    return done(simulation.revertReason ?? "the simulation reverted");
  }
  // Gas is checked against the operation's own limit rather than the cap: an operation that
  // will run out of gas on chain is a submission that burns a fee for nothing.
  if (simulation.gasUsed > operation.gasLimit) {
    lifecycle.push("SIMULATION_REVERTED");
    return done("the simulation used more gas than the operation allows");
  }
  lifecycle.push("SIMULATED");

  let quote: PaymasterQuote | null = null;
  if (sponsored) {
    quote = transport.quotePaymaster(operation);
    if (quote === null) {
      lifecycle.push("ABSENT_PAYMASTER");
      return done("a sponsored operation received no paymaster quote");
    }
    const quoteRefused = paymasterRefusal(quote, operation, nowEpochMs);
    if (quoteRefused !== null) {
      lifecycle.push("POLICY_REFUSED");
      return done(quoteRefused);
    }
  }
  lifecycle.push("AUTHORIZED");

  const hash = transport.submit(operation, quote);
  if (hash === null || !TX_HASH.test(hash)) {
    lifecycle.push("SUBMISSION_FAILED");
    return done("the bundler did not accept the operation");
  }
  lifecycle.push("SUBMITTED");
  return observeAndRecord(request, lifecycle, hash, []);
}

// SUBMITTED → INCLUDED → CONFIRMED → RECORDED, shared by a fresh submission and by a retry that
// reconciled against an operation already on chain.
function observeAndRecord(
  request: SubmissionRequest,
  lifecycle: ChainState[],
  hash: string,
  resumeStates: readonly ChainState[],
): { receipt: ChainSubmissionReceipt } {
  const { transport, operation, receipts, network } = request;
  const id = operation.operationId;
  for (const state of resumeStates) lifecycle.push(state);
  const done = (detail: string, confirmations = 0): { receipt: ChainSubmissionReceipt } => {
    const cleared = cleanup(transport);
    return { receipt: receipt(id, network.chainId, lifecycle, detail, hash, confirmations, cleared.cleared) };
  };

  const report = transport.observe(hash);
  // SEC-CHAIN-006. Three ways an operation leaves the mempool without settling, and they are
  // separate states because they mean different things to the caller: dropped may be retried,
  // replaced means another operation took the nonce, pending means keep waiting.
  if (report.state === "dropped") {
    lifecycle.push("DROPPED");
    return done("the operation was dropped from the mempool");
  }
  if (report.state === "replaced") {
    lifecycle.push("REPLACED");
    return done("another operation replaced this nonce");
  }
  if (report.state === "pending") {
    lifecycle.push("TIMED_OUT");
    return done("the operation is still pending");
  }
  if (report.blockNumber === null || report.blockHash === null) {
    lifecycle.push("CONFIRMATION_FAILED");
    return done("the transport reported inclusion without a block");
  }
  lifecycle.push("INCLUDED");

  // Inclusion is not finality. The head has to have moved past the inclusion block by the
  // confirmation policy before this provider will call the operation settled -- and a head
  // behind the inclusion block is a transport reporting something impossible.
  const confirmations = report.headBlockNumber - report.blockNumber + 1;
  if (confirmations < 1) {
    lifecycle.push("CONFIRMATION_FAILED");
    return done("the reported head is behind the inclusion block");
  }
  if (confirmations < REQUIRED_CONFIRMATIONS) {
    lifecycle.push("CONFIRMATION_FAILED");
    return done(`the operation has ${confirmations} confirmations and the policy requires ${REQUIRED_CONFIRMATIONS}`, confirmations);
  }
  // A reorg shows up as a different block hash at the same height on the second read. Reading
  // once and trusting it is what makes "included" look like "settled".
  const reread = transport.observe(hash);
  if (reread.blockHash !== report.blockHash || reread.blockNumber !== report.blockNumber) {
    lifecycle.push("REORGED");
    return done("the inclusion block changed between reads", confirmations);
  }
  lifecycle.push("CONFIRMED");

  const recorded = transport.record({
    operationId: id,
    transactionHash: hash,
    blockNumber: report.blockNumber,
    intentDigest: receipts.intentDigest,
    policyEpoch: receipts.policyEpoch,
  });
  if (!recorded) {
    lifecycle.push("LEDGER_FAILED");
    return done("the ledger did not accept the record", confirmations);
  }

  const cleared = cleanup(transport);
  if (!cleared.cleared) {
    lifecycle.push("FAILED_CLEANUP");
    return { receipt: receipt(id, network.chainId, lifecycle, cleared.detail, hash, confirmations, false) };
  }
  lifecycle.push("RECORDED");
  return { receipt: receipt(id, network.chainId, lifecycle, "the operation is confirmed and recorded", hash, confirmations, true) };
}

// The evidence this provider is allowed to claim. A deterministic run over a fake chain moves
// none of it, and the eval suite pins the type so widening a member to PASS fails to compile.
export const testnetSubmissionState = {
  testnetSubmission: "NOT_EXERCISED",
  bundlerInclusion: "NOT_EXERCISED",
  paymasterSponsorship: "NOT_EXERCISED",
  mainnetSubmission: "NOT_IMPLEMENTED",
  productionKeyCustody: "NOT_IMPLEMENTED",
} as const;
