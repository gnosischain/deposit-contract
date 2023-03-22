// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

import "./utils/EIP1967Proxy.sol";
import "./SBCDepositContract.sol";

/**
 * @title SBCDepositContractProxy
 * @dev Upgradeable version of the underlying SBCDepositContract.
 */
contract SBCDepositContractProxy is EIP1967Proxy {
    bool private paused;

    uint256 private constant DEPOSIT_CONTRACT_TREE_DEPTH = 32;
    // first slot from StakeDepositContract
    bytes32[DEPOSIT_CONTRACT_TREE_DEPTH] private zero_hashes;

    constructor(address _admin, address _token) {
        _setAdmin(_admin);
        _setImplementation(address(new SBCDepositContract(_token)));

        // Compute hashes in empty sparse Merkle tree
        for (uint256 height = 0; height < DEPOSIT_CONTRACT_TREE_DEPTH - 1; height++)
            zero_hashes[height + 1] = sha256(abi.encodePacked(zero_hashes[height], zero_hashes[height]));
    }
}
