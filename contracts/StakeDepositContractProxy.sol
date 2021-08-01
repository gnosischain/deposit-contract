// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.6.11;

import "./utils/EIP1967Proxy.sol";
import "./utils/Claimable.sol";
import "./StakeDepositContract.sol";

/**
 * @title StakeDepositContractProxy
 * @dev Upgradeable and Claimable version of the underlying StakeDepositContract.
 */
contract StakeDepositContractProxy is EIP1967Proxy, Claimable {
    address private immutable token;

    constructor(address _admin, address _token) public {
        _setAdmin(_admin);
        _setImplementation(address(new StakeDepositContract(_token)));
        token = _token;
    }

    /**
     * @dev Allows to transfer any locked token from this contract.
     * Only admin can call this method.
     * Deposit-related tokens cannot be claimed.
     * @param _token address of the token, if it is not provided (0x00..00), native coins will be transferred.
     * @param _to address that will receive the locked tokens on this contract.
     */
    function claimTokens(address _token, address _to) external onlyAdmin {
        require(token != _token);
        _claimValues(_token, _to);
    }
}
