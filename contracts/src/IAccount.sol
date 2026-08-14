// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev ERC-4337 v0.7 account interface, transcribed from the specification rather than
/// imported from a package.
///
/// SEC-AA-001 admits dependencies only after an exact source/version/checksum, SBOM, notices
/// and licence review, and `docs/licensing/TECHNOLOGY_REVIEW_MATRIX.md` currently records
/// `no contract/provider admitted`. An interface is a specification: transcribing it creates
/// nothing to admit, where importing a kernel package would.
///
/// The layout below is normative and must not be "improved" -- the EntryPoint ABI-decodes
/// exactly this struct, so a reordered or widened field is a different calldata shape.
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    /// @dev verificationGasLimit (high 128 bits) || callGasLimit (low 128 bits)
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    /// @dev maxPriorityFeePerGas (high 128 bits) || maxFeePerGas (low 128 bits)
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

interface IAccount {
    /// @return validationData packed as `authorizer (160) || validUntil (48) || validAfter (48)`,
    /// where an authorizer of 0 means valid and 1 means the signature failed. Returning a
    /// failure code rather than reverting is required by the specification: the EntryPoint
    /// needs to charge for the attempt.
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);
}
