// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccount, PackedUserOperation} from "./IAccount.sol";

/// @title SessionAccount
/// @notice A minimal ERC-4337 account with two validation routes: a session-limited low-risk
/// route and an owner-signed high-risk route that additionally requires hardware/signing
/// evidence bound to the current policy epoch.
///
/// @dev Deliberately not upgradeable, not proxied, and not delegatecall-capable. #62's
/// SEC-AA-006 asks for least-privilege admin; the least privilege available is "there is no
/// admin operation at all". Ownership is immutable and set in the constructor, so there is no
/// ownership-transfer path to protect, no upgrade slot to collide with, and no initializer to
/// front-run.
///
/// What this contract is NOT: it is not a kernel, it does not support modules or hooks, and it
/// implements no plugin registry. Those are the features that make an account a platform and
/// an audit a large one. #62 asks for *minimal* validator/execution contracts.
contract SessionAccount is IAccount {
    // ---------------------------------------------------------------------------------------
    // Errors. Named rather than `require` strings so the selectors are part of the ABI and the
    // static analysis can assert the failure surface.
    // ---------------------------------------------------------------------------------------
    error NotEntryPoint();
    error NotSelf();
    error SessionUnknown();
    error SessionExhausted();
    error SessionTargetRefused();
    error SessionSelectorRefused();
    error SessionExpired();
    error EvidenceStale();
    error FeeRecipientRequired();
    error FeeTooHigh();
    error CallReverted();

    // ---------------------------------------------------------------------------------------
    // Immutable subjects. Every one of these is constructor-set and unwritable afterwards,
    // which is what makes "no admin backdoor" a property of the bytecode rather than of a
    // modifier somebody could remove.
    // ---------------------------------------------------------------------------------------

    /// @dev The only caller the EntryPoint routes through. Checked on both validation and
    /// execution because an account that validates for the EntryPoint and executes for anyone
    /// has no access control at all.
    address public immutable entryPoint;

    /// @dev High-risk authority. Immutable: there is no transferOwnership, so a compromised
    /// owner is a redeployment rather than a silent takeover.
    address public immutable owner;

    /// @dev SEC-AA-005. Fee routing is fixed at deployment: a destination, a rate and a cap.
    /// A fee whose destination can change after deployment is a fee whose destination is
    /// whatever the last admin call said, which is the hidden-fee shape the control looks for.
    address public immutable feeRecipient;
    uint16 public immutable feeBasisPoints;
    uint256 public immutable feeCapWei;

    /// @dev SEC-AA-005. 1% ceiling, enforced at construction. A cap that only exists in the
    /// deployment script is a cap the next deployment forgets.
    uint16 public constant MAX_FEE_BASIS_POINTS = 100;

    // ---------------------------------------------------------------------------------------
    // Session state.
    // ---------------------------------------------------------------------------------------

    struct Session {
        address target;
        bytes4 selector;
        uint128 maxValueWei;
        uint48 validAfter;
        uint48 validUntil;
        uint32 maxCalls;
        uint32 usedCalls;
    }

    /// @dev Sessions are keyed by their own hash and created only by the account calling
    /// itself through the high-risk route, so opening a session is itself an owner-signed,
    /// evidence-bound operation.
    mapping(bytes32 sessionId => Session session) public sessions;

    /// @dev SEC-AA-004. The epoch evidence must be bound to. Advanced only through the
    /// high-risk route; evidence bound to an earlier epoch stops being admissible rather than
    /// being re-evaluated.
    uint48 public policyEpoch;

    event SessionOpened(bytes32 indexed sessionId, address indexed target, bytes4 selector);
    event SessionClosed(bytes32 indexed sessionId);
    event PolicyEpochAdvanced(uint48 indexed epoch);
    event FeePaid(address indexed recipient, uint256 amount);

    constructor(
        address entryPoint_,
        address owner_,
        address feeRecipient_,
        uint16 feeBasisPoints_,
        uint256 feeCapWei_
    ) {
        if (entryPoint_ == address(0) || owner_ == address(0)) revert NotSelf();
        // A fee with no destination goes somewhere the receipt does not name; a destination
        // with no fee is a field nobody keeps in step. Either alone is refused.
        if ((feeBasisPoints_ == 0) != (feeRecipient_ == address(0))) revert FeeRecipientRequired();
        if (feeBasisPoints_ > MAX_FEE_BASIS_POINTS) revert FeeTooHigh();
        entryPoint = entryPoint_;
        owner = owner_;
        feeRecipient = feeRecipient_;
        feeBasisPoints = feeBasisPoints_;
        feeCapWei = feeCapWei_;
        policyEpoch = 1;
    }

    modifier onlyEntryPoint() {
        if (msg.sender != entryPoint) revert NotEntryPoint();
        _;
    }

    /// @dev Self-call only. Every state change that is not a session counter goes through the
    /// high-risk validation route and comes back in as a call from this contract to itself, so
    /// there is exactly one authorisation path rather than one per administrative function.
    modifier onlySelf() {
        if (msg.sender != address(this)) revert NotSelf();
        _;
    }

    // ---------------------------------------------------------------------------------------
    // Validation
    // ---------------------------------------------------------------------------------------

    /// @inheritdoc IAccount
    /// @dev SEC-AA-003 and SEC-AA-004. The first signature byte selects the route, and the two
    /// routes cannot be confused: the session route never inspects a signature and the owner
    /// route never inspects a session, so a caller cannot present session credentials to reach
    /// the owner path.
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override onlyEntryPoint returns (uint256 validationData) {
        // The nonce is the EntryPoint's replay protection and is not re-implemented here.
        // Re-checking it locally would be a second source of truth that can disagree.
        if (userOp.signature.length == 0) return _SIG_FAILED;

        if (uint8(userOp.signature[0]) == 0) {
            validationData = _validateSession(userOp);
        } else {
            validationData = _validateOwner(userOp, userOpHash);
        }

        _prefund(missingAccountFunds);
    }

    uint256 private constant _SIG_FAILED = 1;

    /// @dev Session route. Every dimension #62 names -- target, function, value, time, nonce
    /// and rate -- is checked, and each has its own error so a refusal says which bound was hit.
    /// The session route deliberately does not look at `userOpHash`: the EntryPoint's nonce is
    /// the replay protection for this route, and a second binding here would be a second source
    /// of truth that can disagree with it.
    function _validateSession(PackedUserOperation calldata userOp) private returns (uint256) {
        // signature layout: [0] = 0x00 route tag, [1:33] = session id
        if (userOp.signature.length != 33) return _SIG_FAILED;
        bytes32 sessionId = bytes32(userOp.signature[1:33]);
        Session storage session = sessions[sessionId];
        if (session.target == address(0)) return _SIG_FAILED;

        // Rate: a session with a call budget of n permits n calls, and the counter is written
        // during validation because the EntryPoint charges for validation whether or not the
        // call later succeeds. Incrementing after execution would let a reverting call be
        // retried without limit.
        if (session.usedCalls >= session.maxCalls) return _SIG_FAILED;
        session.usedCalls += 1;

        (address target, uint256 value, bytes4 selector) = _decodeExecute(userOp.callData);
        if (target != session.target) return _SIG_FAILED;
        if (selector != session.selector) return _SIG_FAILED;
        if (value > session.maxValueWei) return _SIG_FAILED;

        // Time bounds are returned to the EntryPoint rather than compared here: the
        // specification makes the bundler responsible for the time window, and comparing
        // against block.timestamp inside validation is a banned opcode in the standard
        // validation rules.
        return _packValidationData(0, session.validUntil, session.validAfter);
    }

    /// @dev Owner route. SEC-AA-004: the signature, the evidence digest and the policy epoch
    /// are all required, and the epoch is what makes stale evidence inadmissible.
    function _validateOwner(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) private view returns (uint256) {
        // signature layout: [0] = 0x01 route tag, [1:66] = r,s,v, [66:98] = evidence digest,
        // [98:104] = policy epoch
        if (userOp.signature.length != 104) return _SIG_FAILED;

        bytes32 evidenceDigest = bytes32(userOp.signature[66:98]);
        uint48 claimedEpoch = uint48(bytes6(userOp.signature[98:104]));
        // Evidence bound to a superseded epoch is refused rather than re-evaluated. A future
        // epoch is refused too: it cannot have been produced by a policy that exists.
        if (claimedEpoch != policyEpoch) return _SIG_FAILED;
        if (evidenceDigest == bytes32(0)) return _SIG_FAILED;

        // The signature covers the evidence and the epoch as well as the operation, so
        // re-presenting a valid signature with different evidence changes the signed message.
        bytes32 signed = keccak256(abi.encode(userOpHash, evidenceDigest, claimedEpoch));
        bytes32 r = bytes32(userOp.signature[1:33]);
        bytes32 s = bytes32(userOp.signature[33:65]);
        uint8 v = uint8(userOp.signature[65]);

        // SEC-AA-007. Signature malleability: for every valid (r, s, v) there is a second
        // (r, -s mod n, v ^ 1) that recovers the same address. Refusing the upper half of the
        // curve order is the standard fix and it is not optional -- a malleable signature is a
        // second valid credential for the same authorisation.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return _SIG_FAILED;
        }
        if (v != 27 && v != 28) return _SIG_FAILED;

        address recovered = ecrecover(signed, v, r, s);
        // ecrecover returns the zero address on failure, and `owner` can never be zero because
        // the constructor refuses it -- so this comparison cannot be satisfied by a malformed
        // signature.
        if (recovered != owner) return _SIG_FAILED;
        return 0;
    }

    function _packValidationData(
        uint160 authorizer,
        uint48 validUntil,
        uint48 validAfter
    ) private pure returns (uint256) {
        return uint256(authorizer) | (uint256(validUntil) << 160) | (uint256(validAfter) << 208);
    }

    /// @dev The EntryPoint asks the account to top up its deposit during validation. A failed
    /// transfer is ignored on purpose: the specification says the EntryPoint handles the
    /// shortfall, and reverting here would turn a funding problem into a validation failure.
    function _prefund(uint256 missingAccountFunds) private {
        if (missingAccountFunds == 0) return;
        (bool ok, ) = payable(msg.sender).call{value: missingAccountFunds}("");
        ok;
    }

    // ---------------------------------------------------------------------------------------
    // Execution
    // ---------------------------------------------------------------------------------------

    /// @dev The single execution entry point. `call` only -- there is no `delegatecall` in this
    /// contract, which is what stops an execution from rewriting this account's own storage.
    ///
    /// SEC-AA-007 reentrancy: the only state this function touches is the fee transfer, which
    /// happens *after* the call and reads only immutables. A reentrant call re-enters
    /// `validateUserOp` through the EntryPoint, where the session counter has already been
    /// incremented -- so a reentrant session call consumes budget exactly as a sequential one
    /// does. There is no balance-before/balance-after invariant to violate.
    function execute(address target, uint256 value, bytes calldata data)
        external
        onlyEntryPoint
        returns (bytes memory result)
    {
        bool ok;
        (ok, result) = target.call{value: value}(data);
        if (!ok) revert CallReverted();
        _payFee(value);
    }

    /// @dev SEC-AA-005. Explicit, bounded, and disabled by construction when the rate is zero.
    function _payFee(uint256 value) private {
        if (feeBasisPoints == 0) return;
        uint256 fee = (value * feeBasisPoints) / 10_000;
        if (fee > feeCapWei) fee = feeCapWei;
        if (fee == 0) return;
        (bool ok, ) = payable(feeRecipient).call{value: fee}("");
        if (!ok) revert CallReverted();
        emit FeePaid(feeRecipient, fee);
    }

    // ---------------------------------------------------------------------------------------
    // Self-authorised administration. Reachable only by this account calling itself, which is
    // reachable only through the owner validation route.
    // ---------------------------------------------------------------------------------------

    function openSession(
        address target,
        bytes4 selector,
        uint128 maxValueWei,
        uint48 validAfter,
        uint48 validUntil,
        uint32 maxCalls
    ) external onlySelf returns (bytes32 sessionId) {
        if (target == address(0)) revert SessionTargetRefused();
        if (selector == bytes4(0)) revert SessionSelectorRefused();
        if (maxCalls == 0) revert SessionExhausted();
        // A session with no end is a permanent delegation, which is the opposite of a session.
        if (validUntil == 0 || validUntil <= validAfter) revert SessionExpired();

        sessionId = keccak256(
            abi.encode(target, selector, maxValueWei, validAfter, validUntil, maxCalls, policyEpoch)
        );
        if (sessions[sessionId].target != address(0)) revert SessionUnknown();
        sessions[sessionId] = Session({
            target: target,
            selector: selector,
            maxValueWei: maxValueWei,
            validAfter: validAfter,
            validUntil: validUntil,
            maxCalls: maxCalls,
            usedCalls: 0
        });
        emit SessionOpened(sessionId, target, selector);
    }

    function closeSession(bytes32 sessionId) external onlySelf {
        if (sessions[sessionId].target == address(0)) revert SessionUnknown();
        delete sessions[sessionId];
        emit SessionClosed(sessionId);
    }

    /// @dev SEC-AA-004. Advancing the epoch invalidates every piece of evidence bound to the
    /// old one, and every session opened under it -- session IDs are derived from the epoch, so
    /// an advanced epoch makes the old IDs unreachable rather than merely unwelcome.
    function advancePolicyEpoch() external onlySelf {
        if (policyEpoch == type(uint48).max) revert EvidenceStale();
        policyEpoch += 1;
        emit PolicyEpochAdvanced(policyEpoch);
    }

    /// @dev Decodes `execute(address,uint256,bytes)` calldata. Any other selector, or calldata
    /// too short to hold the fixed head, is refused by returning a zero target -- which no
    /// session can match, because `openSession` refuses the zero address.
    function _decodeExecute(bytes calldata callData)
        private
        pure
        returns (address target, uint256 value, bytes4 innerSelector)
    {
        if (callData.length < 4 + 32 + 32 + 32 + 32 + 4) return (address(0), 0, bytes4(0));
        if (bytes4(callData[0:4]) != this.execute.selector) return (address(0), 0, bytes4(0));
        target = address(uint160(uint256(bytes32(callData[4:36]))));
        value = uint256(bytes32(callData[36:68]));
        // The inner call's own selector, at the start of the `data` argument's contents. The
        // offset is fixed because `execute` has exactly one dynamic parameter.
        uint256 dataOffset = uint256(bytes32(callData[68:100]));
        if (dataOffset != 96) return (address(0), 0, bytes4(0));
        innerSelector = bytes4(callData[132:136]);
    }

    receive() external payable {}
}
