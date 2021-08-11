// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.6.11;

import "./utils/EIP1967Proxy.sol";
import "./StakeDepositContract.sol";

/**
 * @title StakeDepositContractProxy
 * @dev Upgradeable and Claimable version of the underlying StakeDepositContract.
 */
contract StakeDepositContractProxy is EIP1967Proxy {
    constructor(address _admin, address _token) public {
        _setAdmin(_admin);
        _setImplementation(address(new StakeDepositContract(_token)));
    }
}